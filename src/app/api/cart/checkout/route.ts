import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/server-admin';

export async function POST(req: NextRequest) {
    try {
        const { paymentId, amount, userId, items } = await req.json();

        if (!paymentId || amount === undefined || !userId || !items || !Array.isArray(items)) {
            return NextResponse.json({ success: false, message: 'Invalid Data' }, { status: 400 });
        }

        // 1. Verify Payment with PortOne V2 API
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

        // 3. Update Database (Supabase Admin)
        const supabase = createAdminClient();

        // 3.1 Record Payment History
        const { error: insertHistoryError } = await supabase.from('payment_history').insert({
            user_id: userId,
            payment_id: paymentId,
            merchant_uid: paymentId,
            amount: amount,
            points_added: 0, // Direct purchase, no points
            status: 'PAID'
        });

        if (insertHistoryError) {
            console.error('DB History Insert Error:', insertHistoryError);
            return NextResponse.json({ success: false, message: 'DB Error writing history' }, { status: 500 });
        }

        // 3.2 Insert Purchased Items to grant ownership
        const recordsToInsert = items.map((item: any) => ({
            user_id: userId,
            payment_id: paymentId,
            item_type: item.item_type,
            item_id: item.item_id,
            title: item.title,
            price_paid: item.price
        }));

        if (recordsToInsert.length > 0) {
            const { error: insertItemsError } = await supabase.from('purchased_items').insert(recordsToInsert);
            
            if (insertItemsError) {
                console.error('DB Purchased Items Insert Error:', insertItemsError);
                return NextResponse.json({ success: false, message: 'DB Error writing purchased items' }, { status: 500 });
            }
        }

        return NextResponse.json({ success: true });

    } catch (e: any) {
        console.error('Cart Checkout Error:', e);
        return NextResponse.json({ success: false, message: e.message }, { status: 500 });
    }
}
