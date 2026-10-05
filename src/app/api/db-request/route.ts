import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/server-admin';

export const dynamic = 'force-dynamic';

/**
 * 개인DB 요청 (2026-10-06) — 회원이 개인DB로 만들고 싶은 자료 파일을 운영자에게 보낸다.
 * 시중 교재는 공개 판매하지 않고, 이미 만든 DB 를 요청한 회원의 시험지 만들기 목록에만 넣어 준다(유료, 운영자가 처리).
 * 파일은 서명 업로드로 저장소에 바로 올리고(Vercel 본문 4.5MB 제한), 요청은 db_requests 표에 한 줄로 남긴다.
 *
 * POST { action: 'sign', files: [{ name, size }] } → { uploads: [{ path, token }] }
 * POST { action: 'submit', paths, names, note }    → { ok: true, id }
 */
const BUCKET = 'exam-materials';
const MAX_FILES = 20;
const MAX_BYTES = 50 * 1024 * 1024;   // Supabase 프로젝트 업로드 한도(10/6 실측: 60MB 부터 413)
const OK_EXT = new Set(['pdf', 'hwp', 'hwpx', 'jpg', 'jpeg', 'png', 'heic', 'heif', 'webp', 'zip']);
const extOf = (name: string) => (name.split('.').pop() || '').toLowerCase();

export async function POST(req: NextRequest) {
    const { data: { user } } = await createClient().auth.getUser();
    if (!user) return NextResponse.json({ error: '로그인 후 요청할 수 있습니다.' }, { status: 401 });
    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: '요청을 읽지 못했습니다.' }, { status: 400 });
    const admin = createAdminClient();

    if (body.action === 'sign') {
        const files = Array.isArray(body.files) ? body.files : [];
        if (files.length < 1 || files.length > MAX_FILES) return NextResponse.json({ error: `파일은 1~${MAX_FILES}개까지 올릴 수 있어요.` }, { status: 400 });
        for (const f of files) {
            if (!OK_EXT.has(extOf(String(f?.name || '')))) return NextResponse.json({ error: `${f?.name || '파일'}: PDF·한글(HWP)·사진·ZIP 파일만 올릴 수 있어요.` }, { status: 400 });
            if (!(f.size > 0) || f.size > MAX_BYTES) return NextResponse.json({ error: `${f?.name || '파일'}: 한 파일에 50MB까지 올릴 수 있어요. 더 크면 나눠서 올려주세요.` }, { status: 400 });
        }
        const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const uploads = [];
        for (let i = 0; i < files.length; i++) {
            const path = `${user.id}/dbreq_${stamp}_${String(i + 1).padStart(2, '0')}.${extOf(files[i].name)}`;
            const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path);
            if (error || !data) return NextResponse.json({ error: '업로드 준비에 실패했습니다. 잠시 후 다시 시도해주세요.' }, { status: 500 });
            uploads.push({ path: data.path, token: data.token });
        }
        return NextResponse.json({ uploads });
    }

    if (body.action === 'submit') {
        const paths: string[] = Array.isArray(body.paths) ? body.paths.filter((p: unknown) => typeof p === 'string') : [];
        const names: string[] = Array.isArray(body.names) ? body.names.map((n: unknown) => String(n ?? '').slice(0, 200)) : [];
        const note = String(body.note || '').trim().slice(0, 300);
        if (paths.length < 1 || paths.length > MAX_FILES || paths.some(p => !p.startsWith(`${user.id}/dbreq_`)))
            return NextResponse.json({ error: '올린 파일 정보를 확인할 수 없습니다. 다시 시도해주세요.' }, { status: 400 });
        const { data: listed } = await admin.storage.from(BUCKET).list(user.id, { limit: 1000, search: 'dbreq_' });
        const sizes = new Map((listed || []).map(o => [`${user.id}/${o.name}`, (o.metadata as any)?.size ?? null]));
        if (paths.some(p => !sizes.has(p))) return NextResponse.json({ error: '파일 업로드가 끝나지 않았어요. 다시 시도해주세요.' }, { status: 400 });

        const displayName = user.user_metadata?.display_name || user.user_metadata?.full_name || user.email?.split('@')[0] || null;
        const { data: row, error } = await admin.from('db_requests').insert({
            user_id: user.id, user_email: user.email, user_name: displayName,
            files: paths.map((path, i) => ({ path, name: names[i] || path.split('/').pop(), size: sizes.get(path) })),
            note: note || null,
        }).select('id').single();
        if (error) {
            console.error('[db-request] insert', error);
            return NextResponse.json({ error: '요청을 저장하지 못했습니다. 잠시 후 다시 시도해주세요.' }, { status: 500 });
        }
        return NextResponse.json({ ok: true, id: row.id });
    }
    return NextResponse.json({ error: '알 수 없는 요청입니다.' }, { status: 400 });
}
