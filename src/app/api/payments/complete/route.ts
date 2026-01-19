import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/server-admin';

export async function POST(req: NextRequest) {
    try {
        const { paymentId, orderId, amount, userId } = await req.json();

        if (!paymentId || !amount || !userId) {
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
            points_added: amount, // 1:1 Ratio
            status: 'PAID'
        });

        if (insertError) {
            console.error('DB Insert Error:', insertError);
            return NextResponse.json({ success: false, message: 'DB Error' }, { status: 500 });
        }

        // Add Points
        // We use rpc or direct update. Since we have admin client, direct update is fine.
        // First get current points
        const { data: profile } = await supabase.from('profiles').select('purchased_points').eq('id', userId).single();

        if (profile) {
            await supabase.from('profiles').update({
                purchased_points: (profile.purchased_points || 0) + amount,
                // points: profile.points + amount, // Deprecated
                updated_at: new Date().toISOString()
            }).eq('id', userId);
        }

        return NextResponse.json({ success: true });

    } catch (e: any) {
        console.error('Payment Error:', e);
        return NextResponse.json({ success: false, message: e.message }, { status: 500 });
    }
}
