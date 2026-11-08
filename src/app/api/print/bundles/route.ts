import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/server-admin';

export const dynamic = 'force-dynamic';

export async function GET() {
    const { data: { user } } = await createClient().auth.getUser();
    if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    const admin = createAdminClient();
    const bundles: any[] = [];
    const now = new Date().toISOString();
    for (let from = 0; ; from += 1000) {
        const { data, error } = await admin.from('pdf_jobs').select('id, title, status, error, question_ids, created_at, retain_until, hwp_ready, pdf_delivered')
            .eq('user_id', user.id).eq('kind', 'print').in('plan_charge', ['exam', 'once', 'teacher'])
            .gt('retain_until', now).order('created_at', { ascending: false }).order('id').range(from, from + 999);
        if (error) return NextResponse.json({ error: '프린트 묶음을 불러오지 못했어요.' }, { status: 503 });
        // PDF 실패·한글 미수령 작업은 차감 대상이 아니므로 보관 목록에서 제외한다.
        bundles.push(...(data || []).filter(j => j.status !== 'error' || j.hwp_ready || j.pdf_delivered).map(j => ({
            id: j.id, title: j.title, status: j.status, createdAt: j.created_at, expiresAt: j.retain_until,
            questions: j.question_ids?.length ?? null,
        })));
        if ((data || []).length < 1000) break;
    }
    return NextResponse.json({ bundles }, { headers: { 'Cache-Control': 'no-store' } });
}
