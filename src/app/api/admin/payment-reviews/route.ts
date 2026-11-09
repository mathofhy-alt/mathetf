import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/utils/admin-auth';
import { createAdminClient } from '@/utils/supabase/server-admin';
import { paymentIdPattern, verifyPaymentIdentity } from '@/lib/payments/order';
import { portone, readOrder, reconcileOrder, verifyLegacyPayment } from '@/lib/payments/reconcile';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
    const { authorized, response } = await requireAdmin();
    if (!authorized) return response;
    const sb = createAdminClient();
    const paymentId = req.nextUrl.searchParams.get('paymentId');
    try {
        if (paymentId) {
            if (!paymentIdPattern.test(paymentId)) return NextResponse.json({ message: '주문 번호를 확인해주세요.' }, { status: 400 });
            const order = await readOrder(sb, paymentId);
            const [payment, ledger, history, grants, debits, cancellation] = await Promise.all([
                order.amount > 0 ? portone(paymentId) : null,
                sb.rpc('payment_order_ledger_state', { p_payment_id: paymentId }),
                sb.from('payment_history').select('user_id,amount,points_added,status').eq('payment_id', paymentId),
                sb.from('purchased_items').select('user_id,item_id,item_type,title,price_paid').eq('payment_id', paymentId),
                sb.from('point_transactions').select('user_id,type,amount').eq('related_id', order.id),
                sb.from('payment_cancellations').select('*').eq('payment_id', paymentId).maybeSingle(),
            ]);
            if ([ledger, history, grants, debits, cancellation].some(result => result.error)) throw new Error('LEDGER_UNAVAILABLE');
            let internal = null;
            if (order.amount === 0) {
                const check = await sb.rpc('zero_payment_review_state', { p_payment_id: paymentId });
                if (check.error) throw new Error('LEDGER_UNAVAILABLE');
                internal = check.data;
            }
            let verified = false, missingIdentity = false;
            const legacy = order.legacy_reconciliation || order.legacy_resolution;
            try { if (legacy) verifyLegacyPayment(order, payment); else verifyPaymentIdentity(order, payment); verified = true; } catch { }
            if (!verified && legacy) { try { verifyLegacyPayment(order, payment, true); missingIdentity = true; } catch { } }
            return NextResponse.json({ order, provider: payment ? { id: payment.id, status: payment.status, amount: payment.amount, currency: payment.currency } : null,
                ledger: ledger.data, history: history.data, grants: grants.data, debits: debits.data, cancellation: cancellation.data, internal, verified, missingIdentity });
        }
        // Include unchecked legacy rows, not just those discovered by cron.
        // Keyset pagination avoids hiding older paid orders behind a fixed limit.
        const cursor = req.nextUrl.searchParams.get('cursor');
        let query = sb.from('payment_orders').select('*').or('and(legacy_reconciliation.eq.true,status.in.(pending,closed)),manual_review_required.eq.true,refund_status.eq.pending,review_reason.eq.bundle_entitlement_review')
            .order('payment_id', { ascending: true }).limit(100);
        if (cursor) {
            if (!paymentIdPattern.test(cursor)) return NextResponse.json({ message: '목록 위치를 확인해주세요.' }, { status: 400 });
            query = query.gt('payment_id', cursor);
        }
        const { data, error } = await query;
        if (error) throw error;
        return NextResponse.json({ orders: data, nextCursor: data?.length === 100 ? data[99].payment_id : null });
    } catch { return NextResponse.json({ message: '승인·지급 원장을 조회하지 못했습니다. 다시 확인해주세요.' }, { status: 503 }); }
}

export async function POST(req: NextRequest) {
    const { authorized, response, user } = await requireAdmin();
    if (!authorized || !user) return response;
    let paymentId: string | undefined;
    try {
        const body = await req.json();
        paymentId = body.paymentId;
        if (!paymentId || !paymentIdPattern.test(paymentId) || !['fulfill', 'refund', 'close_review'].includes(body.action)
            || typeof body.note !== 'string' || body.note.trim().length < 5 || body.note.length > 1000) {
            return NextResponse.json({ message: '주문·처리 방법·확인 근거(5자 이상)를 입력해주세요.' }, { status: 400 });
        }
        const sb = createAdminClient();
        const order = await readOrder(sb, paymentId);
        if (order.amount === 0) {
            if (body.action === 'close_review') return NextResponse.json({ message: '포인트 주문의 지급 확정 또는 취소를 선택해주세요.' }, { status: 400 });
            const { data, error } = await sb.rpc('resolve_zero_payment', {
                p_payment_id: paymentId, p_action: body.action, p_actor_id: user.id, p_note: body.note.trim(),
            });
            if (error) return NextResponse.json({ message: '내부 지급·포인트 원장을 안전하게 확정할 수 없습니다. 차감 증거를 확인해주세요.' }, { status: 409 });
            return NextResponse.json({ ...data, paymentId });
        }
        // Always re-fetch immediately before acting. Neither a stale inspection
        // nor the browser's supplied status/amount can authorize resolution.
        const payment = await portone(paymentId);
        if (!order.legacy_reconciliation && !order.legacy_resolution) verifyPaymentIdentity(order, payment);
        const evidence = verifyLegacyPayment(order, payment, body.confirmedOwner === true);
        if (body.action === 'close_review') {
            const { error } = await sb.rpc('close_payment_review', {
                p_payment_id: paymentId, p_actor_id: user.id, p_note: body.note.trim(),
                p_payment: evidence, p_confirmed_owner: body.confirmedOwner === true,
            });
            if (error) return NextResponse.json({ message: '취소 확정·포인트 반환·권한 회수를 확인한 뒤 검토를 종결할 수 있습니다.' }, { status: 409 });
            return NextResponse.json({ success: true, reviewClosed: true, paymentId });
        }
        const { error } = await sb.rpc('resolve_legacy_payment', {
            p_payment_id: paymentId, p_action: body.action, p_actor_id: user.id,
            p_note: body.note.trim(), p_payment: evidence, p_confirmed_owner: body.confirmedOwner === true,
        });
        if (error) return NextResponse.json({ message: '안전하게 확정할 수 없습니다. 승인 정보·포인트·지급 원장의 충돌 또는 잔액을 확인해주세요.' }, { status: 409 });
        return NextResponse.json(await reconcileOrder(sb, await readOrder(sb, paymentId)));
    } catch (error: any) {
        if (error?.message === 'PAYMENT_REFUNDED') return NextResponse.json({ success: true, refunded: true, paymentId });
        if (error?.message === 'PAYMENT_REFUND_PENDING') return NextResponse.json({ success: false, pending: true, message: '전액 취소를 요청했습니다. 자동 재확인이 계속됩니다.' }, { status: 202 });
        return NextResponse.json({ message: '결제사 확인에 실패했습니다. 주문을 다시 조회해주세요.' }, { status: 503 });
    }
}
