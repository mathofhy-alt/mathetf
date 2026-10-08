export type OrderItem = { item_id: string; item_type: string; title: string; price: number };
export type OrderQuote = { kind: 'cart' | 'topup'; amount: number; total: number; used_points: number; points: number; items: OrderItem[]; name: string };
export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function cartQuote(requested: unknown, materials: any[], usedPoints: unknown): OrderQuote {
    if (!Array.isArray(requested) || !requested.length || requested.length > 100) throw new Error('구매할 자료를 1~100개 선택해주세요.');
    const ids = requested.map(i => i?.item_id);
    if (ids.some(id => typeof id !== 'string' || !uuidPattern.test(id)) || new Set(ids).size !== ids.length) throw new Error('중복되거나 올바르지 않은 자료가 있습니다.');
    const map = new Map(materials.map(m => [m.id, m]));
    const items: OrderItem[] = requested.map(input => {
        const material = map.get(input.item_id);
        const types: Record<string,string> = { DB: 'PERSONAL_DB', HWP: 'HWP_DOC', PDF: 'MOCK_EXAM', PRIVATE: 'PRIVATE_DB', PASS: 'QB_PASS' };   // PASS: 시험지 만들기 이용권(10/7, lib/qbPass)   // PRIVATE: 회원 전용 개인DB(10/6, orders 라우트가 주인 확인 후 넘김)
        if (!material || !types[material.file_type] || !Number.isSafeInteger(material.price) || material.price < 0) throw new Error('판매 정보를 확인할 수 없는 자료입니다.');
        // Price, title and file entitlement come only from the server's material record.
        return { item_id: material.id, item_type: types[material.file_type], title: material.title, price: material.price };
    });
    const total = items.reduce((sum, item) => sum + item.price, 0);
    const used = usedPoints ?? 0;
    if (typeof used !== 'number' || !Number.isSafeInteger(used) || used < 0 || used > total || !Number.isSafeInteger(total)) throw new Error('사용할 포인트를 확인해주세요.');
    return { kind: 'cart', amount: total - used, total, used_points: used, points: 0, items, name: items.length === 1 ? items[0].title : `${items[0].title} 외 ${items.length - 1}건` };
}
// [10/8] READY = 결제창만 열고 카드 결제까지 안 간 주문. 예전엔 이것도 '진행 중'으로 보고 새 결제를 막아서,
//   창을 닫은 회원은 영영 다시 결제하지 못했다(라온 회원 — 서문여고). 10분 넘은 READY 는 '결제 안 됨'으로 본다.
export const READY_STALE_MS = 10 * 60 * 1000;
export function verifyPaidPayment(order: { payment_id: string; user_id: string; amount: number; created_at?: string }, payment: any): void {
    if (payment.status === 'READY' && order.created_at && Date.now() - new Date(order.created_at).getTime() > READY_STALE_MS) throw new Error('PAYMENT_NOT_PAID');
    if (['READY', 'PENDING', 'VIRTUAL_ACCOUNT_ISSUED'].includes(payment.status)) throw new Error('PAYMENT_PENDING');
    if (payment.status !== 'PAID') throw new Error('PAYMENT_NOT_PAID');
    if (payment.id !== order.payment_id || payment.currency !== 'KRW' || payment.amount?.total !== order.amount || payment.customer?.id !== order.user_id) throw new Error('PAYMENT_MISMATCH');
    let custom = payment.customData;
    if (typeof custom === 'string') { try { custom = JSON.parse(custom); } catch { throw new Error('PAYMENT_MISMATCH'); } }
    if (custom?.orderId !== order.payment_id) throw new Error('PAYMENT_MISMATCH');
}
