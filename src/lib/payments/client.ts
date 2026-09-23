import type { User } from '@supabase/supabase-js';
const key = (userId: string, kind: string) => `mathetf_pending_payment_${userId}_${kind}`;
export async function payOrder(user: User, input: { kind: 'cart'; [key: string]: unknown }) {
    const complete = async (paymentId: string) => {
        const res = await fetch('/api/payments/complete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ paymentId }) });
        const data = await res.json();
        if (!res.ok || !data.success) {
            if(data.code==='PAYMENT_NOT_PAID') {localStorage.removeItem(key(user.id,input.kind));throw new Error('결제가 완료되지 않은 주문입니다. 상품과 금액을 확인한 뒤 다시 결제를 시작할 수 있습니다.');}
            throw new Error(`${data.message} 주문: ${paymentId}`);
        }
        localStorage.removeItem(key(user.id, input.kind));
        return data;
    };
    const pending = localStorage.getItem(key(user.id, input.kind));
    if (pending) return complete(pending); // Never initiate a second payment while completion is uncertain.
    const prepared = await fetch('/api/payments/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
    const order = await prepared.json();
    if (!prepared.ok) throw new Error(order.message);
    if (order.amount>0 && !(window as any).PortOne) throw new Error('결제 모듈을 불러오는 중입니다. 잠시 후 다시 시도해주세요.');
    localStorage.setItem(key(user.id, input.kind), order.paymentId);
    if (order.amount>0) {
        const response = await (window as any).PortOne.requestPayment({
            storeId: process.env.NEXT_PUBLIC_PORTONE_STORE_ID, channelKey: process.env.NEXT_PUBLIC_PORTONE_CHANNEL_KEY,
            paymentId: order.paymentId, orderName: order.name, totalAmount: order.amount, currency: 'CURRENCY_KRW', payMethod: 'CARD',
            products:order.products, customData: { orderId: order.paymentId },
            redirectUrl: `${window.location.origin}/payments/return`,
            customer: { customerId: user.id, fullName: user.email?.split('@')[0] || 'User', email: user.email, phoneNumber: user.user_metadata?.phone || user.phone },
        });
        if (response?.code != null) {
            return complete(order.paymentId); // Verify even an SDK failure before allowing a fresh payment.
        }
    }
    return complete(order.paymentId);
}
