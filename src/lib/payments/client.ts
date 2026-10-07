import type { User } from '@supabase/supabase-js';
const key = (userId: string, kind: string) => `mathetf_pending_payment_${userId}_${kind}`;
// [10/8] phone: 회원 정보에 휴대폰 번호가 없을 때 결제 창에서 받은 번호(포트원 카드 결제는 구매자 전화번호가 필수 — 비면 'phoneNumber' 오류)
export async function payOrder(user: User, input: { kind: 'cart'; [key: string]: unknown }, phone?: string) {
    const complete = async (paymentId: string) => {
        const res = await fetch('/api/payments/complete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ paymentId }) });
        const data = await res.json();
        if (!res.ok || !data.success) {
            if(data.code==='PAYMENT_NOT_PAID') {localStorage.removeItem(key(user.id,input.kind));throw Object.assign(new Error('결제가 완료되지 않은 주문입니다. 상품과 금액을 확인한 뒤 다시 결제를 시작할 수 있습니다.'),{notPaid:true});}
            throw new Error(`${data.message} 주문: ${paymentId}`);
        }
        localStorage.removeItem(key(user.id, input.kind));
        return data;
    };
    const pending = localStorage.getItem(key(user.id, input.kind));
    // Never initiate a second payment while completion is uncertain.
    // [10/8] 남은 주문이 '결제 안 됨'으로 확인되면(창을 닫았거나 실패) 멈추지 않고 새 결제로 — 예전엔 실패 뒤 첫 클릭이 늘 오류였다
    if (pending) {
        try { return await complete(pending); }
        catch (e: any) { if (!e?.notPaid) throw e; }
    }
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
            customer: { customerId: user.id, fullName: user.email?.split('@')[0] || 'User', email: user.email, phoneNumber: user.user_metadata?.phone || user.phone || phone },
        });
        if (response?.code != null) {
            // Verify even an SDK failure before allowing a fresh payment.
            // [10/8] 결제가 안 된 게 확인되면 포트원이 준 실제 이유(취소·카드 거절 등)를 보여 준다
            try { return await complete(order.paymentId); }
            catch (e: any) {
                if (e?.notPaid) throw new Error(response.code === 'FAILURE_TYPE_PG' || response.message ? `결제가 진행되지 않았어요. ${response.message || ''}`.trim() : '결제를 취소했어요.');
                throw e;
            }
        }
    }
    return complete(order.paymentId);
}
