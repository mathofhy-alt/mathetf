import { randomUUID } from 'node:crypto';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/server-admin';
import { NextResponse } from 'next/server';
import { registerMaterial, uploadProof } from '@/lib/material-registration';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
    const { data: { user } } = await createClient().auth.getUser();
    if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    const body = await req.json().catch(() => null);
    const secret = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    if (body?.action === 'register') {
        try {
            await registerMaterial(createAdminClient(), user, body, secret);
            return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'private, no-store' } });
        } catch {
            return NextResponse.json({ error: '업로드와 자료 정보를 확인해 주세요. 이미 등록했다면 목록을 새로고침해 주세요.' }, { status: 400 });
        }
    }
    if (!secret) return NextResponse.json({ error: '업로드를 준비하지 못했습니다.' }, { status: 503 });
    const ext = String(body?.name || '').split('.').pop()?.toLowerCase();
    if (!ext || !['pdf','hwp','hwpx','hml','jpg','jpeg','png','webp','heic','heif'].includes(ext) || !Number.isSafeInteger(body?.size) || body.size <= 0 || body.size > 50 * 1024 * 1024)
        return NextResponse.json({ error: 'PDF·한글·사진 파일을 50MB 이하로 올려 주세요.' }, { status: 400 });
    const path = `${user.id}/${Date.now()}_${randomUUID()}.${ext}`;
    const { data, error } = await createAdminClient().storage.from('exam-materials').createSignedUploadUrl(path);
    if (error || !data) return NextResponse.json({ error: '업로드를 준비하지 못했습니다.' }, { status: 503 });
    return NextResponse.json({ path, token: data.token, proof: uploadProof(user.id, path, body.size, secret) }, { headers: { 'Cache-Control': 'private, no-store' } });
}
