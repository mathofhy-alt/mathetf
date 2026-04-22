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

            // 4. Revenue Sharing Logic for Personal DBs (Original Exam Crowdsourcing - 70%)
            for (const item of items) {
                if (item.item_type === 'PERSONAL_DB' || item.item_type === 'DB' || item.item_type === '개인DB') {
                    try {
                        // 4.1 Fetch DB item with source_submission_id (직접 연결 방식)
                        const { data: dbItem } = await supabase
                            .from('exam_materials')
                            .select('source_submission_id, uploader_id, school, grade, semester, exam_type, subject, exam_year')
                            .eq('id', item.item_id)
                            .single();

                        if (!dbItem) continue;

                        let submitterId: string | null = null;
                        let submissionId: string | null = null;

                        // 4.2 Method 1: source_submission_id 직접 참조 (정확함)
                        if (dbItem.source_submission_id) {
                            const { data: submission } = await supabase
                                .from('exam_materials')
                                .select('submitter_id')
                                .eq('id', dbItem.source_submission_id)
                                .single();
                            
                            if (submission?.submitter_id) {
                                submitterId = submission.submitter_id;
                                submissionId = dbItem.source_submission_id;
                            }
                        }

                        // 4.3 Method 2: Fallback - metadata 매칭 (source_submission_id 없을 때)
                        if (!submitterId) {
                            const { data: originals } = await supabase
                                .from('exam_materials')
                                .select('id, submitter_id, uploader_id')
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
                                const orig = originals[0];
                                submitterId = orig.submitter_id || orig.uploader_id;
                                submissionId = orig.id;
                            }
                        }

                        // 4.4 수익 배분 (제보자 != DB 제작자(관리자) && 제보자 != 구매자)
                        if (submitterId && submitterId !== dbItem.uploader_id && submitterId !== userId) {
                            const reward = Math.floor(Number(item.price) * 0.7); // 70% 배분
                            if (reward > 0) {
                                // 4.5 earned_points 적립
                                const { data: profile } = await supabase
                                    .from('profiles')
                                    .select('earned_points')
                                    .eq('id', submitterId)
                                    .single();

                                if (profile) {
                                    await supabase
                                        .from('profiles')
                                        .update({ earned_points: (profile.earned_points || 0) + reward })
                                        .eq('id', submitterId);
                                }

                                // 4.6 submission_earnings 내역 기록
                                await supabase
                                    .from('submission_earnings')
                                    .insert({
                                        submission_id: submissionId,
                                        db_item_id: item.item_id,
                                        purchase_id: paymentId,
                                        buyer_id: userId,
                                        submitter_id: submitterId,
                                        sale_amount: Number(item.price),
                                        earnings_amount: reward
                                    });

                                // 4.7 point_logs 기록
                                await supabase
                                    .from('point_logs')
                                    .insert({
                                        user_id: submitterId,
                                        amount: reward,
                                        point_type: 'EARNED',
                                        reason: `[${item.title}] 원본 시험지 제보 수익 배분 (70%)`,
                                        reference_id: paymentId
                                    });
                            }
                        }
                    } catch (revenueErr) {
                        // 수익 배분 실패해도 구매 자체는 완료 처리
                        console.error('[Revenue Share Error] Item:', item.item_id, revenueErr);
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
