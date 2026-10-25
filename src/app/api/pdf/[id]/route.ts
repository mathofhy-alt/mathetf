import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/server-admin';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/pdf/<id> → { status: 'pending'|'working'|'done'|'error', ahead?, url? }
 * 본인 작업만. done 이면 2분짜리 내려받기 주소(파일 이름 = 제목.pdf). ahead = 내 앞에 기다리는 작업 수.
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
    const { data: { user } } = await createClient().auth.getUser();
    if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    if (!UUID_RE.test(params.id)) return NextResponse.json({ error: '잘못된 요청' }, { status: 400 });
    const admin = createAdminClient();
    const { data: job } = await admin.from('pdf_jobs').select('id, user_id, status, title, error, created_at').eq('id', params.id).single();
    if (!job || job.user_id !== user.id) return NextResponse.json({ error: '찾을 수 없습니다.' }, { status: 404 });
    if (job.status === 'done') {
        const name = `${(job.title || '문제').replace(/[\\/<>:"|?*]/g, '_').trim() || '문제'}.pdf`;
        const { data, error } = await admin.storage.from('pdf-jobs').createSignedUrl(`${job.id}.pdf`, 120, { download: name });
        if (error || !data) return NextResponse.json({ status: 'error', error: 'PDF 파일을 찾지 못했습니다.' });
        return NextResponse.json({ status: 'done', url: data.signedUrl });
    }
    if (job.status === 'error') return NextResponse.json({ status: 'error', error: 'PDF를 만들지 못했습니다. 잠시 후 다시 시도해 주세요.' });
    let ahead = 0;
    if (job.status === 'pending') {
        const { count } = await admin.from('pdf_jobs').select('id', { count: 'exact', head: true }).in('status', ['pending', 'working']).lt('created_at', job.created_at);
        ahead = count || 0;
    }
    return NextResponse.json({ status: job.status, ahead });
}
