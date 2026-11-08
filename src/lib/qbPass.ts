import { createAdminClient } from '@/utils/supabase/server-admin';

/**
 * 시험지 만들기 이용권 (2026-10-07, 브랜치 redesign-2026 — 배포 시점은 사용자가 결제와 묶어 정한다)
 *
 * - 강사 이용권: 30일, 29,000원. 결제는 기존 포트원 주문(item_type 'QB_PASS')을 그대로 쓴다 — 정기결제 계약이 필요 없다.
 *   이용 기간은 purchased_items 의 QB_PASS 줄을 시간순으로 이어 붙여 계산한다(기간 중에 또 사면 끝에 30일이 붙는다).
 * - 무료·1회권·시험대비권: planAccess.ts (시험대비권은 시험지·프린트 합산, 예상은 기간 중 무제한).
 * - 숫자(가격·무료 횟수)는 qbPassConfig.ts 한 곳에서 바꾼다(사용자 고민 중).
 */
import { QB_PASS, PASS_EXAM, PASS_ONCE, PASS_SHEET, passTerm, paywallOn } from './qbPassConfig';
import { computeAccess, predictWindows, planFeature, type Access, type PlanCharge, type UseKind } from './planAccess';
export { QB_PASS };

export const PLAN_FEATURES = ['plan_free_exam', 'plan_free_bundle', 'plan_free_predict', 'plan_exam_exam', 'plan_exam_bundle', 'plan_exam_predict', 'plan_once_bundle', 'plan_sheet_exam', 'plan_teacher_exam'];
const ADMIN_EMAIL = 'mathofhy@naver.com';
const DAY = 86_400_000;

export type PassStatus = Access & {
    unlimited: boolean;          // 강사 이용권이 있거나 운영자, 또는 유료화 시작 전(누구나)
    paywall: boolean;            // 유료화가 켜졌나(QB_PAYWALL_START 이후)
    admin: boolean;
    passUntil: string | null;    // 이용권 끝나는 시각(ISO)
    freePerWeek: number;
    usedThisWeek: number;
    resetsAt: string;
    freeLeft: number;            // 지금 시험지를 저장할 수 있는 무료 횟수
    price: number;
    days: number;
    offer: Offer;
    viewers: number | null;    // 최근 30분 동안 시험지 만들기 화면에 들어온 사람(방문 단위). 3명 미만이면 null
};

export type Offer = { price: number; listPrice: number };

/** 지금 가격 — 출시 할인가(salePrice), 정가(price)는 줄 그어 보여 준다. 결제 주문도 이걸로 서버가 정한다. */
export async function currentOffer(): Promise<Offer> {
    return { price: QB_PASS.salePrice, listPrice: QB_PASS.price };
}

/** 최근 30분 동안 시험지 만들기 화면에 들어온 사람 수(운영 사이트 qb_enter, 방문 단위로 중복 제거). 3명 미만이면 null */
export async function recentViewers(): Promise<number | null> {
    const since = new Date(Date.now() - 30 * 60_000).toISOString();
    const { data, error } = await createAdminClient().from('question_bank_events').select('session_id')
        .eq('event', 'qb_enter').gte('created_at', since).limit(2000);
    if (error) return null;
    const n = new Set((data || []).map(r => r.session_id).filter(Boolean)).size;
    return n >= 3 ? n : null;
}

/** 결제 기록을 이어 붙여 이용권 끝나는 시각 */
export function passUntilFrom(purchases: { created_at: string; item_id?: string | null }[]): Date | null {
    let until = 0;
    for (const p of [...purchases].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
        const at = new Date(p.created_at).getTime();
        until = Math.max(until, at) + (passTerm(String(p.item_id || ''))?.days ?? QB_PASS.days) * DAY;   // 몇 개월짜리인지(10/8)
    }
    return until ? new Date(until) : null;
}

export async function passStatus(user: { id: string; email?: string | null }): Promise<PassStatus> {
    const sb = createAdminClient();
    // 평생 횟수는 PostgREST의 기본 1,000행 제한으로 잘리면 안 된다. 읽기 실패는 503으로 돌린다.
    const all = async (query: () => any): Promise<any[]> => {
        const rows: any[] = [];
        for (let from = 0; ; from += 1000) {
            const { data, error } = await query().order('id').range(from, from + 999);
            if (error) throw new Error('이용 기록을 확인하지 못했습니다.');
            rows.push(...(data || []));
            if ((data || []).length < 1000) return rows;
        }
    };
    const [buys, other, uses, failed] = await Promise.all([
        all(() => sb.from('purchased_items').select('created_at, item_id').eq('user_id', user.id).eq('item_type', QB_PASS.itemType)),
        all(() => sb.from('purchased_items').select('id, created_at, item_type').eq('user_id', user.id).in('item_type', [PASS_ONCE.itemType, PASS_EXAM.itemType, PASS_SHEET.itemType])),
        all(() => sb.from('plan_usage').select('feature, title, created_at, qb_sheet_purchase_id').eq('user_id', user.id).in('feature', PLAN_FEATURES)),
        all(() => sb.from('pdf_jobs').select('id').eq('user_id', user.id).eq('status', 'error').eq('hwp_ready', false).eq('pdf_delivered', false)),
    ]);
    const [offer, viewers] = await Promise.all([currentOffer(), recentViewers().catch(() => null)]);
    const until = passUntilFrom(buys || []);
    const active = !!until && until.getTime() > Date.now();
    const access = computeAccess(other || [], uses || [], new Set((failed || []).map(f => f.id)));
    return {
        ...access,
        unlimited: active || user.email === ADMIN_EMAIL || !paywallOn(),
        paywall: paywallOn(),
        admin: user.email === ADMIN_EMAIL,
        passUntil: active ? until!.toISOString() : null,
        freeLeft: access.freeExamLeft,
        freePerWeek: QB_PASS.freePerWeek,
        usedThisWeek: QB_PASS.freePerWeek - access.freeExamLeft,
        resetsAt: new Date(predictWindows().week + 7 * DAY).toISOString(),
        price: offer.price,
        days: QB_PASS.days,
        offer, viewers,
    };
}

/** 쓴 횟수 한 줄 — jobId 가 있으면 PDF 실패 때 빠진다. setHash 는 같은 묶음 다시 받기를 알아보는 표시 */
export async function recordPlanUse(user: { id: string; email?: string | null }, plan: PlanCharge, kind: UseKind, o: { jobId?: string; setHash?: string; questions?: number } = {}) {
    const { error } = await createAdminClient().from('feature_usage').insert({
        user_id: user.id, user_email: user.email ?? null, feature: planFeature(plan, kind), title: o.jobId ?? null, question_count: o.questions ?? null, set_hash: o.setHash ?? null,
    });
    if (error) console.error('[plan] 사용 기록 실패', error.code, error.message);
}

/** 저장 성공 뒤 한 줄. 실패해도 저장은 그대로 둔다(횟수 하나 덜 세는 쪽이 낫다). */
export async function recordUsage(userId: string, examId: string | null) {
    const { error } = await createAdminClient().from('qb_usage').insert({ user_id: userId, exam_id: examId });
    if (error) console.error('[qb_usage]', error.code, error.message);
}
