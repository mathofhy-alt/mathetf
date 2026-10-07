import { createAdminClient } from '@/utils/supabase/server-admin';

/**
 * 시험지 만들기 이용권 (2026-10-07, 브랜치 redesign-2026 — 배포 시점은 사용자가 결제와 묶어 정한다)
 *
 * - 이용권: 30일, 29,000원. 결제는 기존 포트원 주문(item_type 'QB_PASS')을 그대로 쓴다 — 정기결제 계약이 필요 없다.
 *   이용 기간은 purchased_items 의 QB_PASS 줄을 시간순으로 이어 붙여 계산한다(기간 중에 또 사면 끝에 30일이 붙는다).
 * - 무료: 이용권이 없으면 한 주(월요일 0시, 한국 시간 기준)에 FREE_PER_WEEK 번까지 시험지 저장.
 *   횟수는 qb_usage 에 저장할 때마다 한 줄 — 시험지를 지워도 되돌아오지 않는다(보관함 20개 한도 때문에 다들 지운다).
 * - 숫자(가격·무료 횟수)는 qbPassConfig.ts 한 곳에서 바꾼다(사용자 고민 중).
 */
import { QB_PASS, passTerm, paywallOn } from './qbPassConfig';
export { QB_PASS };

const ADMIN_EMAIL = 'mathofhy@naver.com';
const DAY = 86_400_000;

/** 이번 주 시작(한국 시간 월요일 0시)의 UTC 시각 */
export function weekStart(now = new Date()): Date {
    const kst = new Date(now.getTime() + 9 * 3_600_000);
    const dow = (kst.getUTCDay() + 6) % 7;   // 월=0
    const mondayKst = Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate() - dow);
    return new Date(mondayKst - 9 * 3_600_000);
}

export type PassStatus = {
    unlimited: boolean;          // 이용권이 있거나 운영자, 또는 유료화 시작 전(누구나)
    paywall: boolean;            // 유료화가 켜졌나(QB_PAYWALL_START 이후)
    admin: boolean;
    passUntil: string | null;    // 이용권 끝나는 시각(ISO)
    freePerWeek: number;
    usedThisWeek: number;
    freeLeft: number;
    resetsAt: string;            // 다음 주 월요일 0시(한국 시간)
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
    const start = weekStart();
    const [{ data: buys }, { count, error }] = await Promise.all([
        sb.from('purchased_items').select('created_at, item_id').eq('user_id', user.id).eq('item_type', QB_PASS.itemType),
        sb.from('qb_usage').select('id', { count: 'exact', head: true }).eq('user_id', user.id).gte('created_at', start.toISOString()),
    ]);
    // 횟수 표를 못 읽으면 막지 않고 통과시킨다(강사가 저장을 못 하는 쪽이 더 나쁘다) — 대신 로그를 남긴다
    if (error) console.error('[qb_usage] 읽기 실패 — 무료 횟수를 세지 못함', error.code, error.message);
    const [offer, viewers] = await Promise.all([currentOffer(), recentViewers().catch(() => null)]);
    const until = passUntilFrom(buys || []);
    const active = !!until && until.getTime() > Date.now();
    const used = count ?? 0;
    return {
        unlimited: active || user.email === ADMIN_EMAIL || !paywallOn(),
        paywall: paywallOn(),
        admin: user.email === ADMIN_EMAIL,
        passUntil: active ? until!.toISOString() : null,
        freePerWeek: QB_PASS.freePerWeek,
        usedThisWeek: used,
        freeLeft: Math.max(0, QB_PASS.freePerWeek - used),
        resetsAt: new Date(start.getTime() + 7 * DAY).toISOString(),
        price: offer.price,
        days: QB_PASS.days,
        offer, viewers,
    };
}

/** 저장 성공 뒤 한 줄. 실패해도 저장은 그대로 둔다(횟수 하나 덜 세는 쪽이 낫다). */
export async function recordUsage(userId: string, examId: string | null) {
    const { error } = await createAdminClient().from('qb_usage').insert({ user_id: userId, exam_id: examId });
    if (error) console.error('[qb_usage]', error.code, error.message);
}
