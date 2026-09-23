import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/server-admin';
import { uuidPattern, verifyPaidPayment } from './order';

async function removePurchasedCartItems(sb: ReturnType<typeof createAdminClient>, order: any) {
    if (order.kind !== 'cart') return;
    const ids = [...new Set((Array.isArray(order.items) ? order.items : [])
        .map((item: any) => item?.item_id)
        .filter((id: unknown): id is string => typeof id === 'string' && uuidPattern.test(id)))];
    if (!ids.length) return;
    try {
        const { error } = await sb.from('cart_items').delete().eq('user_id', order.user_id).in('item_id', ids);
        if (error) console.error('[Order cart cleanup]', error.code);
    } catch (error) {
        console.error('[Order cart cleanup]', error);
    }
}

export async function completeOrder(req: NextRequest, kind?: 'cart' | 'topup') {
    const { data: { user } } = await createClient().auth.getUser();
    if (!user) return NextResponse.json({ success: false, message: '로그인 후 결제 결과를 다시 확인해주세요.' }, { status: 401 });
    try {
        const { paymentId } = await req.json();
        if (typeof paymentId !== 'string' || !/^order-[a-f0-9]{32}$/.test(paymentId)) return NextResponse.json({ success: false, message: '서버에서 생성한 주문이 필요합니다.' }, { status: 400 });
        const sb = createAdminClient();
        const { data: order, error: readError } = await sb.from('payment_orders').select('*').eq('payment_id', paymentId).eq('user_id', user.id).single();
        if (readError || !order || (kind && order.kind !== kind)) return NextResponse.json({ success: false, message: '본인의 주문을 찾을 수 없습니다.' }, { status: 404 });
        if (order.status === 'completed') {
            await removePurchasedCartItems(sb, order);
            return NextResponse.json({ success: true, alreadyProcessed: true, kind: order.kind, points: order.points });
        }
        if (order.amount > 0) {
            if (!process.env.PORTONE_API_SECRET) throw new Error('PAYMENT_CONFIG');
            const response = await fetch(`https://api.portone.io/payments/${encodeURIComponent(paymentId)}`, {
                headers: { Authorization: `PortOne ${process.env.PORTONE_API_SECRET}` }, cache: 'no-store', signal: AbortSignal.timeout(15000),
            });
            if(response.status===404) throw new Error('PAYMENT_NOT_PAID');
            if (!response.ok) throw new Error('PAYMENT_UNAVAILABLE');
            verifyPaidPayment(order, await response.json());
        }
        const { data, error } = await sb.rpc('complete_payment_order', { p_payment_id: paymentId, p_user_id: user.id });
        if (error) { console.error('[Order completion]', error.code); throw new Error('ORDER_RETRY'); }
        await removePurchasedCartItems(sb, order);
        return NextResponse.json({ success: true, ...data, kind: order.kind, points: order.points });
    } catch (error: any) {
        const unpaid = error.message === 'PAYMENT_NOT_PAID';
        const pending = error.message === 'PAYMENT_PENDING';
        return NextResponse.json({ success: false, code: pending ? 'PAYMENT_PENDING' : unpaid ? 'PAYMENT_NOT_PAID' : 'ORDER_RETRY', message: pending ? '결제가 아직 진행 중입니다. 새 결제를 시작하지 말고 잠시 후 같은 주문의 결과를 다시 확인해주세요.' : unpaid ? '결제가 완료되지 않았습니다.' : '결제 결과를 확정하지 못했습니다. 다시 결제하지 말고 같은 주문의 결과 확인을 눌러주세요.' }, { status: pending || unpaid ? 409 : 503 });
    }
}
