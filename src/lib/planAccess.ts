/**
 * 무료 체험·1회권·시험대비권 남은 횟수 계산. 예상문제는 한국 시간 하루 1회·월요일부터 주 3회.
 * 사용 기록은 feature_usage 의 plan_<요금>_<종류> 줄(새 표 없음). 시험지의 기존 qb_usage는 새 마이그레이션에서 중복 없이 이어 받는다.
 * 한글을 받지 못한 채 실패한 PDF(title = 작업 id)는 세지 않는다. failedJobs는 서버가 분류한다.
 */
import { FREE_TRIAL, PASS_EXAM, PASS_ONCE, PASS_SHEET } from './qbPassConfig';

export type UseKind = 'exam' | 'bundle' | 'predict';   // 기존 bundle 기록은 프린트로 유지
export type PlanCharge = 'free' | 'exam' | 'once' | 'sheet';
export type PlanUse = { feature: string; title?: string | null; created_at: string; qb_sheet_purchase_id?: string | null };
export type PlanBuy = { id?: string; item_type: string; created_at: string };
export type Access = { sheetLeft: number; sheetExpiresAt: string | null; freeExamLeft: number; freeBundleLeft: number; freePredictLeft: number; predictDayLeft: number; predictWeekLeft: number; examUntil: string | null; examStart: string | null; examGranted: number; examLeft: number; onceLeft: number; onceTotal: number };

const DAY = 86_400_000;
export const planFeature = (plan: PlanCharge, kind: UseKind) => `plan_${plan}_${kind}`;

/** 서버의 로컬 시간대와 무관하게 한국 자정·월요일 자정을 UTC 밀리초로 계산한다. */
export function predictWindows(now = Date.now()) {
    const kst = new Date(now + 9 * 3_600_000);
    const day = Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate()) - 9 * 3_600_000;
    return { day, week: day - ((kst.getUTCDay() + 6) % 7) * DAY };
}

export function computeAccess(buys: PlanBuy[], uses: PlanUse[], failedJobs: Set<string> = new Set(), now = Date.now()): Access {
    const live = uses.filter(u => !(u.title && failedJobs.has(u.title)));
    const count = (feature: string, from = 0) => live.filter(u => {
        const at = new Date(u.created_at).getTime();
        return u.feature === feature && at >= from && at <= now;
    }).length;
    // 시험대비권 — 기간 중에 또 사면 뒤로 이어 붙고 건수도 더한다. 끝난 묶음의 남은 건수는 사라진다.
    let until = 0, start = 0, granted = 0;
    for (const b of buys.filter(x => x.item_type === PASS_EXAM.itemType && Date.parse(x.created_at) <= now).sort((a, b) => a.created_at.localeCompare(b.created_at))) {
        const at = new Date(b.created_at).getTime();
        if (at >= until) { start = at; granted = 0; until = at; }
        until += PASS_EXAM.days * DAY; granted += PASS_EXAM.bundles;
    }
    const active = until > now;
    const examUsed = count(planFeature('exam', 'exam'), start) + count(planFeature('exam', 'bundle'), start);
    const windows = predictWindows(now);
    const predictDayLeft = Math.max(0, FREE_TRIAL.predictDaily - count(planFeature('free', 'predict'), windows.day));
    const predictWeekLeft = Math.max(0, FREE_TRIAL.predictWeekly - count(planFeature('free', 'predict'), windows.week));
    // 1장권은 구매별 30일. 먼저 만료되는 구매부터 사용하고, 사용한 구매는 영구히 제외한다.
    const spent = new Set(uses.filter(u => u.feature === 'plan_sheet_exam').map(u => u.qb_sheet_purchase_id));
    const sheets = buys.filter(b => b.item_type === PASS_SHEET.itemType && b.id && !spent.has(b.id)
        && Date.parse(b.created_at) <= now && Date.parse(b.created_at) + PASS_SHEET.days * DAY > now)
        .sort((a, b) => a.created_at.localeCompare(b.created_at));
    return {
        sheetLeft: sheets.length,
        sheetExpiresAt: sheets.length ? new Date(Date.parse(sheets[0].created_at) + PASS_SHEET.days * DAY).toISOString() : null,
        freeExamLeft: Math.max(0, FREE_TRIAL.exam - count(planFeature('free', 'exam'), windows.week)),
        freeBundleLeft: Math.max(0, FREE_TRIAL.bundle - count(planFeature('free', 'bundle'))),
        freePredictLeft: Math.min(predictDayLeft, predictWeekLeft),
        predictDayLeft, predictWeekLeft,
        examUntil: active ? new Date(until).toISOString() : null,
        examStart: active ? new Date(start).toISOString() : null,
        examGranted: active ? granted : 0,
        examLeft: active ? Math.max(0, granted - examUsed) : 0,
        onceLeft: Math.max(0, buys.filter(x => x.item_type === PASS_ONCE.itemType).length - count(planFeature('once', 'bundle'))),
        onceTotal: buys.filter(x => x.item_type === PASS_ONCE.itemType).length,
    };
}

/** 시험지·프린트는 시험대비권 합산 차감. 예상은 기간 중 무제한, 나머지는 무료 일/주 한도. */
export function chooseCharge(a: Access, kind: UseKind, paidOnly = false): PlanCharge | null {
    if (kind === 'predict') return paidOnly ? null : a.examUntil ? 'exam' : a.freePredictLeft > 0 ? 'free' : null;
    const free = kind === 'exam' ? a.freeExamLeft : a.freeBundleLeft;
    if (!paidOnly && free > 0) return 'free';
    if (a.examLeft > 0) return 'exam';
    if (kind === 'exam' && a.sheetLeft > 0) return 'sheet';
    if (kind === 'bundle' && a.onceLeft > 0) return 'once';
    return null;
}
