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
    const { id, admin_reply } = await req.json().catch(() => ({}));
    if (typeof id !== 'string') return NextResponse.json({ error: 'id가 없습니다.' }, { status: 400 });
    const admin = createAdminClient();
    const { data: row } = await admin.from('exam_materials').select('description, content_type').eq('id', id).maybeSingle();
    if (!row || row.content_type !== '원본제보') return NextResponse.json({ error: '원본 제보를 찾지 못했습니다.' }, { status: 404 });
    let desc: Record<string, unknown> = {};
    try { desc = JSON.parse(row.description || '{}') || {}; } catch { desc = {}; }
    const text = String(admin_reply ?? '').trim().slice(0, 2000);
    desc.admin_reply = text || null;
    desc.replied_at = text ? new Date().toISOString() : null;
    const { error } = await admin.from('exam_materials').update({ description: JSON.stringify(desc) }).eq('id', id);
    if (error) return NextResponse.json({ error: '저장하지 못했습니다.' }, { status: 500 });
    return NextResponse.json({ ok: true, admin_reply: desc.admin_reply, replied_at: desc.replied_at });
}

/**
 * 무료 타이핑 완성 파일 (관리자, 10/8) — 회원이 보낸 원본을 한글 파일로 만들어 그 회원에게 돌려준다.
 * 회원은 마이페이지 › 내 요청에서 받는다(GET /api/original-report/typed). 파일은 서버를 거치지 않고
 * 서명된 업로드 주소로 저장소에 바로 올린다(서버 요청 크기 한도 4.5MB 를 넘는 한글 파일이 많다).
 *   { action:'typed-upload-url', id, filename } → { path, token }
 *   { action:'typed-attach', id, path, name, size } → 제보 description.typed_files 에 추가
 *   { action:'typed-remove', id, path }
 */
const TYPED_BUCKET = 'exam-materials';
export async function POST(req: NextRequest) {
    const { authorized, response } = await requireAdmin();
    if (!authorized) return response;
    const body = await req.json().catch(() => ({}));
    const id = typeof body?.id === 'string' ? body.id : '';
    if (!id) return NextResponse.json({ error: 'id가 없습니다.' }, { status: 400 });
    const admin = createAdminClient();
    const { data: row } = await admin.from('exam_materials').select('description, content_type').eq('id', id).maybeSingle();
    if (!row || row.content_type !== '원본제보') return NextResponse.json({ error: '원본 제보를 찾지 못했습니다.' }, { status: 404 });
    let desc: any = {};
    try { desc = JSON.parse(row.description || '{}') || {}; } catch { desc = {}; }
    const files: { name: string; path: string; size: number | null; at: string }[] = Array.isArray(desc.typed_files) ? desc.typed_files : [];
    const prefix = `typed/${id}/`;
    const save = async (next: typeof files) => {
        const { error } = await admin.from('exam_materials').update({ description: JSON.stringify({ ...desc, typed_files: next }) }).eq('id', id);
        return error;
    };

    if (body.action === 'typed-upload-url') {
        const name = String(body.filename || '').trim().slice(0, 150);
        const ext = (name.split('.').pop() || '').toLowerCase();
        if (!['hwp', 'hwpx', 'hml', 'pdf', 'zip'].includes(ext)) return NextResponse.json({ error: '한글(HWP·HWPX·HML)·PDF·ZIP 파일만 올릴 수 있습니다.' }, { status: 400 });
        const path = `${prefix}${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { data, error } = await admin.storage.from(TYPED_BUCKET).createSignedUploadUrl(path);
        if (error || !data) return NextResponse.json({ error: '업로드 주소를 만들지 못했습니다.' }, { status: 500 });
        return NextResponse.json({ path, token: data.token });
    }
    if (body.action === 'typed-attach') {
        const path = String(body.path || '');
        if (!path.startsWith(prefix)) return NextResponse.json({ error: '경로가 올바르지 않습니다.' }, { status: 400 });
        const { data: listed } = await admin.storage.from(TYPED_BUCKET).list(prefix.slice(0, -1), { limit: 100 });
        if (!(listed || []).some(o => `${prefix}${o.name}` === path)) return NextResponse.json({ error: '파일 업로드가 끝나지 않았습니다.' }, { status: 400 });
        const next = [...files.filter(f => f.path !== path), { name: String(body.name || '타이핑.hwp').slice(0, 150), path, size: Number(body.size) || null, at: new Date().toISOString() }];
        const error = await save(next);
        if (error) return NextResponse.json({ error: '저장하지 못했습니다.' }, { status: 500 });
        return NextResponse.json({ ok: true, typed_files: next });
    }
    if (body.action === 'typed-remove') {
        const path = String(body.path || '');
        if (!path.startsWith(prefix)) return NextResponse.json({ error: '경로가 올바르지 않습니다.' }, { status: 400 });
        await admin.storage.from(TYPED_BUCKET).remove([path]);
        const next = files.filter(f => f.path !== path);
        const error = await save(next);
        if (error) return NextResponse.json({ error: '저장하지 못했습니다.' }, { status: 500 });
        return NextResponse.json({ ok: true, typed_files: next });
    }
    return NextResponse.json({ error: '알 수 없는 요청입니다.' }, { status: 400 });
}
