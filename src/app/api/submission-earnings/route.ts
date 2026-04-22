import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET(req: NextRequest) {
    try {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();

        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // 현재 사용자의 제보 수익 내역
        const { data, error } = await supabase
            .from('submission_earnings')
            .select(`
                id,
                sale_amount,
                earnings_amount,
                created_at,
                submission:submission_id (
                    id,
                    title,
                    school,
                    exam_year,
                    grade,
                    semester,
                    exam_type,
                    subject
                ),
                db_item:db_item_id (
                    id,
                    title,
                    school
                )
            `)
            .eq('submitter_id', session.user.id)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Submission earnings fetch error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ earnings: data || [] });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
