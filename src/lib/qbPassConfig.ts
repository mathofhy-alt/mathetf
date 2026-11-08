// 화면에서도 쓰는 숫자라 서버 코드 없는 파일에 둔다 (qbPass.ts 는 서버 전용)
export const QB_PASS = {
    itemId: '7b0c6f2e-30da-4a5e-9c11-000000000030',   // 상품 고정 id (purchased_items.item_id)
    itemType: 'QB_PASS',
    title: '강사 이용권 30일',
    price: 29_000,
    salePrice: 29_000,    // 결제 가격. [10/8] 줄 그은 정가(39,000) 표시는 뺐다 — 판 적 없는 가격을 할인처럼 보이면 가짜 할인 소지(사용자 결정)
    days: 30,
    freePerWeek: 2,
} as const;

/** 시험지는 주 2회, 프린트는 평생 체험, 예상문제는 한국 시간 일/주 한도. */
export const FREE_TRIAL = { exam: QB_PASS.freePerWeek, bundle: 2, predictDaily: 1, predictWeekly: 3, questions: 30 } as const;
export const BUNDLE_KEEP_DAYS = 30;
export const PASS_SHEET = { itemId: '7b0c6f2e-30da-4a5e-9c11-000000000050', itemType: 'QB_SHEET', title: '시험지 1장권', price: 2_900, days: 30 } as const;
export const PASS_ONCE = { itemId: '7b0c6f2e-30da-4a5e-9c11-000000000001', itemType: 'QB_ONCE', title: '1회권', price: 2_900 } as const;
export const PASS_EXAM = { itemId: '7b0c6f2e-30da-4a5e-9c11-000000000014', itemType: 'QB_EXAM', title: '시험대비권 14일', price: 9_900, days: 14, bundles: 10 } as const;

/**
 * [10/8] 몇 개월 살지 고르기(사용자 요청). 개월마다 상품 번호가 따로 있다 — 한 주문에 같은 상품을 여러 줄 넣을 수 없어서.
 * 가격 = 한 달 가격 × 개월(할인 없음). 기간은 결제 줄을 이어 붙여 계산할 때 이 표의 days 를 쓴다(qbPass.passUntilFrom).
 */
export const QB_PASS_TERMS = [
    { months: 1, days: 30, itemId: '7b0c6f2e-30da-4a5e-9c11-000000000030' },
    { months: 3, days: 90, itemId: '7b0c6f2e-30da-4a5e-9c11-000000000090' },
    { months: 6, days: 180, itemId: '7b0c6f2e-30da-4a5e-9c11-000000000180' },
    { months: 12, days: 360, itemId: '7b0c6f2e-30da-4a5e-9c11-000000000360' },
] as const;
export const passTerm = (itemId: string) => QB_PASS_TERMS.find(t => t.itemId === itemId);
export const termPrice = (months: number) => QB_PASS.salePrice * months;
export const termTitle = (months: number) => `강사 이용권 ${months}개월`;

/** [10/8] 이용권 혜택 — 한 시험지 문항 수·보관함 개수(사용자 제안: 이용권 50·100). 문항 100은 저장 시간 실측 뒤 확정 */
export const QB_LIMITS = {
    free: { questions: 50, saved: 20 },
    pass: { questions: 100, saved: 50 },
} as const;

/**
 * [11/5 대표] 이용권 3단 — 받는 양·파일 형식으로 나눈다(가입 역할은 본인이 고르는 값이라 직업으로 못 막는다).
 */
export const SHEET_PLAN = { id: 'sheet', name: PASS_SHEET.title, price: PASS_SHEET.price, unit: '1장', itemId: PASS_SHEET.itemId, fit: '시험지 한 장을 더 만들 때', example: '이번 주 무료 횟수를 모두 쓴 뒤 시험지를 한 장 더 저장할 때',
    lines: [`새 시험지 1장 저장 · 최대 ${QB_LIMITS.free.questions}문항`, '한글·PDF 둘 다 · 로고 없음', `구매 후 ${PASS_SHEET.days}일 안에 사용 (이후 소멸)`, `만든 시험지는 만든 뒤 ${BUNDLE_KEEP_DAYS}일 동안 다시 받기`, '이번 주 무료 횟수를 먼저 사용 · 여러 장 구매하면 누적'] } as const;
export const PASS_PLANS = [
    { id: 'once', name: '1회권', price: PASS_ONCE.price, unit: '1건', itemId: PASS_ONCE.itemId, fit: '이번 한 번만 필요한 분께 맞아요', example: '내일 볼 프린트와 비슷한 문제만 풀어 보고 싶을 때',
      lines: [`프린트 변형 1건 (PDF·한글, ${BUNDLE_KEEP_DAYS}일 동안 다시 받기)`, `건당 최대 ${FREE_TRIAL.questions}문항`, '로고 없음', '사용 전 기간 제한 없음 · 시험지 만들기·예상문제에는 쓸 수 없어요'] },
    { id: 'exam', name: '시험대비권', price: PASS_EXAM.price, unit: `${PASS_EXAM.days}일`, itemId: PASS_EXAM.itemId, fit: '시험 전 2주, 시험지와 학교 프린트를 함께 준비할 때 맞아요', example: '기말 2주 전, 반별 시험지와 학교 프린트 비슷한 문제를 같이 준비할 때',
      lines: [`시험지 만들기·프린트 변형 합쳐 ${PASS_EXAM.bundles}건 · 한글/PDF · ${BUNDLE_KEEP_DAYS}일 다시 받기 · 예상문제 제한 없음`, `시험지 최대 ${QB_LIMITS.free.questions}문항 · 프린트 건당 최대 ${FREE_TRIAL.questions}문항`, `만든 뒤 ${BUNDLE_KEEP_DAYS}일 동안 다시 받기 (추가 차감 없음)`, '로고 없음', `시험지는 주 무료 ${FREE_TRIAL.exam}회 → 시험대비권 → 시험지 1장권 순서로 사용`, '예상문제는 이용 기간 중 횟수 제한 없음 (PDF) · 건수 차감 없음', `${Math.ceil(PASS_EXAM.price / PASS_ONCE.price)}건 이상 쓰신다면 1회권보다 유리해요`] },
    { id: 'teacher', name: '강사 이용권', price: QB_PASS.salePrice, unit: `${QB_PASS.days}일`, itemId: QB_PASS.itemId, fit: '수업 자료를 자주 만들고 고쳐 쓰는 분께 맞아요', example: '반별 시험지와 숙제를 매주 만들 때', lines: [] as string[] },
] as const;
export type PassPlanId = (typeof PASS_PLANS)[number]['id'] | 'sheet';

/**
 * [10/8] 유료화 시작 시각(사용자 결정: 다음 주 월요일 0시). 그 전에는 시험지 만들기 제한 없이 무료·이용권 판매 안 함.
 * 이 시각이 지나면 배포 없이 저절로 주 2회 제한·이용권 판매가 켜진다. 미루려면 이 값만 바꿔 배포.
 */
export const QB_PAYWALL_START = '2026-10-12T00:00:00+09:00';
export const paywallOn = (now = Date.now()) => now >= new Date(QB_PAYWALL_START).getTime();

export const PLAN_COPY = {
    expired: `만든 지 ${BUNDLE_KEEP_DAYS}일이 지나 다시 받을 수 없어요.`,
    exhausted: `시험지 1장권 ${PASS_SHEET.price.toLocaleString('ko-KR')}원·시험대비권 ${PASS_EXAM.price.toLocaleString('ko-KR')}원(${PASS_EXAM.days}일, 시험지·프린트 합쳐 ${PASS_EXAM.bundles}건)·강사 이용권 ${QB_PASS.salePrice.toLocaleString('ko-KR')}원으로 계속 만들 수 있어요. 원본 제보로 포인트도 받을 수 있어요.`,
    predict: `무료 예상문제는 한국 시간 기준 하루 ${FREE_TRIAL.predictDaily}회·주 ${FREE_TRIAL.predictWeekly}회(월요일 0시 시작)까지 받을 수 있어요. 기간 중인 시험대비권·강사 이용권 회원은 횟수 제한이 없어요. 1회권은 해당하지 않아요.`,
};
