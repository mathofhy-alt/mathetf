export type OrderItem = { item_id: string; item_type: string; title: string; price: number; reward_user_id?: string; submission_id?: string };
export type OrderQuote = { kind: 'cart' | 'topup'; amount: number; total: number; used_points: number; points: number; items: OrderItem[]; name: string };
export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function cartQuote(requested: unknown, materials: any[], usedPoints: unknown): OrderQuote {
    if (!Array.isArray(requested) || !requested.length || requested.length > 100) throw new Error('구매할 자료를 1~100개 선택해주세요.');
    const ids = requested.map(i => i?.item_id);
    if (ids.some(id => typeof id !== 'string' || !uuidPattern.test(id)) || new Set(ids).size !== ids.length) throw new Error('중복되거나 올바르지 않은 자료가 있습니다.');
    const map = new Map(materials.map(m => [m.id, m]));
    const items: OrderItem[] = requested.map(input => {
        const material = map.get(input.item_id);
        const types: Record<string,string> = { DB: 'PERSONAL_DB', HWP: 'HWP_DOC', PDF: 'MOCK_EXAM' };
        if (!material || !types[material.file_type] || !Number.isSafeInteger(material.price) || material.price < 0) throw new Error('판매 정보를 확인할 수 없는 자료입니다.');
        // Price, title and file entitlement come only from the server's material record.
        return { item_id: material.id, item_type: types[material.file_type], title: material.title, price: material.price };
    });
    const total = items.reduce((sum, item) => sum + item.price, 0);
    const used = usedPoints ?? 0;
    if (typeof used !== 'number' || !Number.isSafeInteger(used) || used < 0 || used > total || !Number.isSafeInteger(total)) throw new Error('사용할 포인트를 확인해주세요.');
    return { kind: 'cart', amount: total - used, total, used_points: used, points: 0, items, name: items.length === 1 ? items[0].title : `${items[0].title} 외 ${items.length - 1}건` };
}
export function verifyPaidPayment(order: { payment_id: string; user_id: string; amount: number }, payment: any): void {
    if (['READY', 'PENDING', 'VIRTUAL_ACCOUNT_ISSUED'].includes(payment.status)) throw new Error('PAYMENT_PENDING');
    if (payment.status !== 'PAID') throw new Error('PAYMENT_NOT_PAID');
    if (payment.id !== order.payment_id || payment.currency !== 'KRW' || payment.amount?.total !== order.amount || payment.customer?.id !== order.user_id) throw new Error('PAYMENT_MISMATCH');
    let custom = payment.customData;
    if (typeof custom === 'string') { try { custom = JSON.parse(custom); } catch { throw new Error('PAYMENT_MISMATCH'); } }
    if (custom?.orderId !== order.payment_id) throw new Error('PAYMENT_MISMATCH');
}
