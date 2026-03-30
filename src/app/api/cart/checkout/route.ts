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

            // 4. Revenue Sharing Logic for Personal DBs (Original Exam Crowdsourcing)
            for (const item of items) {
                if (item.item_type === 'PERSONAL_DB' || item.item_type === 'DB' || item.item_type === '개인DB') {
                    // 4.1 Fetch DB metadata and its uploader (admin)
                    const { data: dbItem } = await supabase
                        .from('exam_materials')
                        .select('school, grade, semester, exam_type, subject, exam_year, uploader_id')
                        .eq('id', item.item_id)
                        .single();

                    if (dbItem) {
                        // 4.2 Find original uploader (First person to submit '원본제보' with same metadata)
                        const { data: originals } = await supabase
                            .from('exam_materials')
                            .select('uploader_id')
                            .eq('school', dbItem.school)
                            .eq('grade', dbItem.grade)
                            .eq('semester', dbItem.semester)
                            .eq('exam_type', dbItem.exam_type)
                            .eq('subject', dbItem.subject)
                            .eq('exam_year', dbItem.exam_year)
                            .eq('content_type', '원본제보')
                            .order('created_at', { ascending: true })
                            .limit(1);

                        if (originals && originals.length > 0) {
                            const originalUploaderId = originals[0].uploader_id;
                            
                            // 4.3 Prevent giving revenue to the DB creator (admin) and the buyer themselves
                            if (originalUploaderId !== dbItem.uploader_id && originalUploaderId !== userId) {
                                // Lookup Uploader's current points
                                const { data: profile } = await supabase
                                    .from('profiles')
                                    .select('earned_points')
                                    .eq('id', originalUploaderId)
                                    .single();

                                if (profile) {
                                    const reward = Math.floor(Number(item.price) * 0.3); // 30% distribution
                                    if (reward > 0) {
                                        // 4.4 Add to earned_points
                                        await supabase
                                            .from('profiles')
                                            .update({ earned_points: (profile.earned_points || 0) + reward })
                                            .eq('id', originalUploaderId);

                                        // 4.5 Log the point transaction
                                        await supabase
                                            .from('point_logs')
                                            .insert({
                                                user_id: originalUploaderId,
                                                amount: reward,
                                                point_type: 'EARNED',
                                                reason: `[${item.title}] 원본 자료 제공 수익 분배 (30%)`,
                                                reference_id: paymentId
                                            });
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        return NextResponse.json({ success: true });

    } catch (e: any) {
        console.error('Cart Checkout Error:', e);
        return NextResponse.json({ success: false, message: e.message }, { status: 500 });
    }
}
