// 화면에서도 쓰는 숫자라 서버 코드 없는 파일에 둔다 (qbPass.ts 는 서버 전용)
export const QB_PASS = {
    itemId: '7b0c6f2e-30da-4a5e-9c11-000000000030',   // 상품 고정 id (purchased_items.item_id)
    itemType: 'QB_PASS',
    title: '시험지 만들기 30일 이용권',
    price: 29_000,
    days: 30,
    freePerWeek: 2,   // ⚠ 사용자 고민 중(주 2회 / 주 5회) — 정해지면 이 숫자만
} as const;
