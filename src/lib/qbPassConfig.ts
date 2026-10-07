// 화면에서도 쓰는 숫자라 서버 코드 없는 파일에 둔다 (qbPass.ts 는 서버 전용)
export const QB_PASS = {
    itemId: '7b0c6f2e-30da-4a5e-9c11-000000000030',   // 상품 고정 id (purchased_items.item_id)
    itemType: 'QB_PASS',
    title: '시험지 만들기 30일 이용권',
    price: 29_000,
    salePrice: 29_000,    // 결제 가격. [10/8] 줄 그은 정가(39,000) 표시는 뺐다 — 판 적 없는 가격을 할인처럼 보이면 가짜 할인 소지(사용자 결정)
    days: 30,
    freePerWeek: 2,       // 10/7 확정
} as const;

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
export const termTitle = (months: number) => `시험지 만들기 이용권 ${months}개월`;

/** [10/8] 이용권 혜택 — 한 시험지 문항 수·보관함 개수(사용자 제안: 이용권 50·100). 문항 100은 저장 시간 실측 뒤 확정 */
export const QB_LIMITS = {
    free: { questions: 50, saved: 20 },
    pass: { questions: 100, saved: 50 },
} as const;

/**
 * [10/8] 유료화 시작 시각(사용자 결정: 다음 주 월요일 0시). 그 전에는 시험지 만들기 제한 없이 무료·이용권 판매 안 함.
 * 이 시각이 지나면 배포 없이 저절로 주 2회 제한·이용권 판매가 켜진다. 미루려면 이 값만 바꿔 배포.
 */
export const QB_PAYWALL_START = '2026-10-12T00:00:00+09:00';
export const paywallOn = (now = Date.now()) => now >= new Date(QB_PAYWALL_START).getTime();
