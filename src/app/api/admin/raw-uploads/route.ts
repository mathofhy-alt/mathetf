import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/utils/admin-auth';
import { createAdminClient } from '@/utils/supabase/server-admin';

export const dynamic = 'force-dynamic';

/**
 * 원본 제보 삭제 (관리자). [10/6]
 * 예전엔 관리자 화면이 브라우저에서 저장소·exam_materials 를 직접 지웠는데, 권한 규칙(RLS)에 막혀
 * 아무것도 안 지워지면서 오류는 확인하지 않아 '삭제됐다'고 떴다(새로고침하면 다시 나타남, 포천고 제보).
 * 서버에서 관리자 확인 후 지우고, 원본 제보 행만 지울 수 있게 한다.
 */
export async function DELETE(req: NextRequest) {
    const { authorized, response } = await requireAdmin();
    if (!authorized) return response;
    const { id } = await req.json().catch(() => ({}));
    if (typeof id !== 'string' || !id) return NextResponse.json({ error: 'id가 없습니다.' }, { status: 400 });

    const admin = createAdminClient();
    const { data: row, error } = await admin.from('exam_materials')
        .select('id, content_type, file_path, description').eq('id', id).maybeSingle();
    if (error) return NextResponse.json({ error: '제보를 불러오지 못했습니다.' }, { status: 500 });
    if (!row || row.content_type !== '원본제보') return NextResponse.json({ error: '원본 제보만 여기서 지울 수 있습니다.' }, { status: 404 });

    let files: string[] = [];
    try { const d = JSON.parse(row.description || '{}'); if (Array.isArray(d.files)) files = d.files.filter((f: unknown) => typeof f === 'string'); } catch { /* 옛 제보는 description 이 JSON 이 아니다 */ }
    if (!files.length && row.file_path) files = [row.file_path];

    if (files.length) {
        const { error: storageError } = await admin.storage.from('exam-materials').remove(files);
        if (storageError) return NextResponse.json({ error: `파일을 지우지 못했습니다: ${storageError.message}` }, { status: 500 });
    }
    const { error: deleteError } = await admin.from('exam_materials').delete().eq('id', id);
    if (deleteError) return NextResponse.json({ error: `제보 기록을 지우지 못했습니다: ${deleteError.message}` }, { status: 500 });
    return NextResponse.json({ ok: true, files: files.length });
}
