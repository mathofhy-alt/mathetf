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
