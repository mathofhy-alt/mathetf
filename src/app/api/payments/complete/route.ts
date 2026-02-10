import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/server-admin';

export async function POST(req: NextRequest) {
    try {
        const { paymentId, orderId, amount, points, userId } = await req.json();

        if (!paymentId || !amount || !points || !userId) {
            return NextResponse.json({ success: false, message: 'Invalid Data' }, { status: 400 });
        }

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

        // 2. Double Check Amount
        if (paymentData.amount.total !== amount) {
            return NextResponse.json({ success: false, message: 'Amount mismatch' }, { status: 400 });
        }

        if (paymentData.status !== 'PAID') {
            return NextResponse.json({ success: false, message: 'Payment not paid' }, { status: 400 });
        }

        // 3. Update Database (Supabase)
        const supabase = createAdminClient();

        // Record History
        const { error: insertError } = await supabase.from('payment_history').insert({
            user_id: userId,
            payment_id: paymentId,
            merchant_uid: orderId || paymentId, // Fallback
            amount: amount,
            points_added: points, // Use specified points amount
            status: 'PAID'
        });

        if (insertError) {
            console.error('DB Insert Error:', insertError);
            return NextResponse.json({ success: false, message: 'DB Error' }, { status: 500 });
        }

        // Add Points Atomically
        const { error: rpcError } = await supabase.rpc('increment_points', {
            target_user_id: userId,
            amount: points // Use points for balance increment
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
