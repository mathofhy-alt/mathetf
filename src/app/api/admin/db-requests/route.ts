import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/utils/admin-auth';
import { createAdminClient } from '@/utils/supabase/server-admin';

export const dynamic = 'force-dynamic';

/** 개인DB 요청 목록·상태 변경·삭제 (관리자). db_requests 는 서버만 읽고 쓴다(20261006_db_requests.sql). */
export async function GET() {
    const { authorized, response } = await requireAdmin();
    if (!authorized) return response;
    const { data, error } = await createAdminClient().from('db_requests').select('*').order('created_at', { ascending: false }).limit(500);
    if (error) return NextResponse.json({ error: '요청 목록을 불러오지 못했습니다.' }, { status: 500 });
    return NextResponse.json({ requests: data || [] });
}

export async function PATCH(req: NextRequest) {
    const { authorized, response } = await requireAdmin();
    if (!authorized) return response;
    const { id, status } = await req.json().catch(() => ({}));
    if (typeof id !== 'string' || !['접수', '처리중', '완료', '반려'].includes(status)) return NextResponse.json({ error: '상태를 확인해주세요.' }, { status: 400 });
    const { error } = await createAdminClient().from('db_requests').update({ status }).eq('id', id);
    if (error) return NextResponse.json({ error: '상태를 바꾸지 못했습니다.' }, { status: 500 });
    return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
    const { authorized, response } = await requireAdmin();
    if (!authorized) return response;
    const { id } = await req.json().catch(() => ({}));
    if (typeof id !== 'string') return NextResponse.json({ error: 'id가 없습니다.' }, { status: 400 });
    const admin = createAdminClient();
    const { data: row } = await admin.from('db_requests').select('files').eq('id', id).maybeSingle();
    if (!row) return NextResponse.json({ error: '요청을 찾지 못했습니다.' }, { status: 404 });
    const paths = (Array.isArray(row.files) ? row.files : []).map((f: any) => f?.path).filter((p: unknown) => typeof p === 'string');
    if (paths.length) {
        const { error } = await admin.storage.from('exam-materials').remove(paths);
        if (error) return NextResponse.json({ error: `파일을 지우지 못했습니다: ${error.message}` }, { status: 500 });
    }
    const { error } = await admin.from('db_requests').delete().eq('id', id);
    if (error) return NextResponse.json({ error: `요청을 지우지 못했습니다: ${error.message}` }, { status: 500 });
    return NextResponse.json({ ok: true, files: paths.length });
}
