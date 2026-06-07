import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/server-admin';
import { createClient } from '@/utils/supabase/server';

export async function POST(req: NextRequest) {
    try {
        const { paymentId, orderId, amount } = await req.json();

        if (!paymentId) {
            return NextResponse.json({ success: false, message: 'Invalid Data' }, { status: 400 });
        }

        // [보안] 사용자 식별은 서버 세션에서만. body의 userId/points 는 신뢰하지 않음 (위조·타인계정 적립 방지).
        const supabaseAuth = createClient();
        const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ success: false, message: '로그인이 필요합니다.' }, { status: 401 });
        }
        const userId = user.id;

        // 1. Verify Payment with PortOne V2 API
        // Docs: https://developers.portone.io/api/rest-v2/payment
        const secret = process.env.PORTONE_API_SECRET;

        const response = await fetch(`https://api.portone.io/payments/${paymentId}`, {
            headers: {
                'Authorization': `PortOne ${secret}`,
                'Content-Type': 'application/json',
            },
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('PortOne Verification Failed:', errorText);
            return NextResponse.json({ success: false, message: 'Payment verification failed' }, { status: 400 });
        }

        const paymentData = await response.json();

        if (paymentData.status !== 'PAID') {
            return NextResponse.json({ success: false, message: 'Payment not paid' }, { status: 400 });
        }

        // [보안] 포인트는 '실제 결제된 금액'으로 서버에서 산정 (body의 points 무시).
        // 충전 정책: 결제액 = 포인트 × 1.1 (VAT 10%) → 포인트 = 결제액 / 1.1
        const paidTotal = paymentData.amount?.total;
        if (typeof paidTotal !== 'number' || paidTotal <= 0) {
            return NextResponse.json({ success: false, message: 'Invalid payment amount' }, { status: 400 });
        }
        // (선택) 클라이언트가 보낸 amount 와 실제 결제액 교차검증
        if (amount !== undefined && paidTotal !== amount) {
            return NextResponse.json({ success: false, message: 'Amount mismatch' }, { status: 400 });
        }
        const points = Math.round(paidTotal / 1.1);

        // 3. Update Database (Supabase)
        const supabase = createAdminClient();

        // [보안] 멱등성: 이미 적립된 결제면 재적립 금지 (동일 paymentId replay 방지)
        const { data: existing } = await supabase
            .from('payment_history')
            .select('id')
            .eq('payment_id', paymentId)
            .maybeSingle();
        if (existing) {
            return NextResponse.json({ success: true, message: 'Already processed' });
        }

        // Record History
        const { error: insertError } = await supabase.from('payment_history').insert({
            user_id: userId,
            payment_id: paymentId,
            merchant_uid: orderId || paymentId, // Fallback
            amount: paidTotal,
            points_added: points,
            status: 'PAID'
        });

        if (insertError) {
            console.error('DB Insert Error:', insertError);
            return NextResponse.json({ success: false, message: 'DB Error' }, { status: 500 });
        }

        // Add Points Atomically
        const { error: rpcError } = await supabase.rpc('increment_points', {
            target_user_id: userId,
            amount: points
        });

        if (rpcError) {
            console.error('Point Increment Error:', rpcError);
            // Even if point increment fails, history is recorded.
            // Ideally we should use a transaction, but RPC is a good start.
        }

        return NextResponse.json({ success: true });

    } catch (e: any) {
        console.error('Payment Error:', e);
        return NextResponse.json({ success: false, message: e.message }, { status: 500 });
    }
}
