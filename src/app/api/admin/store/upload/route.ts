import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/utils/admin-auth';
import { createAdminClient } from '@/utils/supabase/server-admin';

export async function POST(req: NextRequest) {
    const auth = await requireAdmin();
    if (!auth.authorized) return auth.response;
    try {
        if (Number(req.headers.get('content-length')) > 6 * 1024 * 1024) throw new Error('이미지는 5MB 이하로 올려 주세요.');
        const form = await req.formData();
        const file = form.get('file');
        const kind = form.get('kind') === 'sample' ? 'samples' : 'covers';
        if (!(file instanceof File) || file.size < 12 || file.size > 5 * 1024 * 1024) throw new Error('5MB 이하 PNG·JPG·WebP 이미지를 선택해 주세요.');
        const bytes = new Uint8Array(await file.arrayBuffer());
        const png = [137, 80, 78, 71, 13, 10, 26, 10].every((b, i) => bytes[i] === b);
        const jpg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
        const webp = String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
        const extension = png ? 'png' : jpg ? 'jpg' : webp ? 'webp' : null;
        if (!extension) throw new Error('PNG·JPG·WebP 형식만 올릴 수 있습니다.');
        const path = `store/${kind}/${crypto.randomUUID()}.${extension}`;
        const sb = createAdminClient();
        const { error } = await sb.storage.from('hwpx').upload(path, bytes, { contentType: `image/${extension === 'jpg' ? 'jpeg' : extension}`, upsert: false });
        if (error) throw new Error('이미지를 올리지 못했습니다. 기존 hwpx 버킷 설정을 확인해 주세요.');
        return NextResponse.json({ path, url: sb.storage.from('hwpx').getPublicUrl(path).data.publicUrl });
    } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : '업로드에 실패했습니다.' }, { status: 400 }); }
}
