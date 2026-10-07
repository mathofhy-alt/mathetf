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

/**
 * 원본 제보 운영자 안내 (관리자, 10/7) — 회원 마이페이지 › 내 요청 › 원본 제보에 보인다.
 * 표를 늘리지 않으려고 제보 행 description(JSON: files·note·neis)에 admin_reply·replied_at 을 덧붙인다.
 */
export async function PATCH(req: NextRequest) {
    const { authorized, response } = await requireAdmin();
    if (!authorized) return response;
    const { id, admin_reply, reject } = await req.json().catch(() => ({}));
    if (typeof id !== 'string') return NextResponse.json({ error: 'id가 없습니다.' }, { status: 400 });
    const admin = createAdminClient();
    const { data: row } = await admin.from('exam_materials').select('description, content_type').eq('id', id).maybeSingle();
    if (!row || row.content_type !== '원본제보') return NextResponse.json({ error: '원본 제보를 찾지 못했습니다.' }, { status: 404 });
    let desc: Record<string, unknown> = {};
    try { desc = JSON.parse(row.description || '{}') || {}; } catch { desc = {}; }
    const text = String(admin_reply ?? '').trim().slice(0, 2000);
    desc.admin_reply = text || null;
    desc.replied_at = text ? new Date().toISOString() : null;
    // [10/8] 반려 — 사유(안내)는 남기고, 올린 파일은 지우고, 같은 시험을 다시 신청할 수 있게 연다(examsOf 가 rejected 를 건너뜀)
    if (reject === true) {
        if (!text) return NextResponse.json({ error: '반려 사유를 회원 안내 칸에 적어 주세요.' }, { status: 400 });
        const files: string[] = Array.isArray(desc.files) ? (desc.files as unknown[]).filter((f): f is string => typeof f === 'string') : [];
        if (files.length) {
            const { error: rmErr } = await admin.storage.from('exam-materials').remove(files);
            if (rmErr) return NextResponse.json({ error: `파일을 지우지 못했습니다: ${rmErr.message}` }, { status: 500 });
        }
        desc.rejected = true;
        desc.rejected_at = new Date().toISOString();
        desc.removed_files = files.length;
        desc.files = [];
    }
    const { error } = await admin.from('exam_materials').update({ description: JSON.stringify(desc) }).eq('id', id);
    if (error) return NextResponse.json({ error: '저장하지 못했습니다.' }, { status: 500 });
    return NextResponse.json({ ok: true, admin_reply: desc.admin_reply, replied_at: desc.replied_at, rejected: desc.rejected === true, description: JSON.stringify(desc) });
}
