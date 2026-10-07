import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/server-admin';

export const dynamic = 'force-dynamic';

/**
 * 무료 타이핑 완성 파일 받기 (10/8) — 제보한 본인만. GET ?id=<제보 id>&i=<파일 순서>
 * 2분짜리 서명 주소로 넘겨 준다(파일 주소를 화면에 남기지 않는다).
 */
export async function GET(req: NextRequest) {
    const { data: { user } } = await createClient().auth.getUser();
    if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    const id = req.nextUrl.searchParams.get('id') || '';
    const i = Number(req.nextUrl.searchParams.get('i') || 0);
    const admin = createAdminClient();
    const { data: row } = await admin.from('exam_materials').select('description, content_type, uploader_id').eq('id', id).maybeSingle();
    if (!row || row.content_type !== '원본제보' || row.uploader_id !== user.id) return NextResponse.json({ error: '받을 수 있는 파일이 없습니다.' }, { status: 404 });
    let d: any = {};
    try { d = JSON.parse(row.description || '{}') || {}; } catch { }
    const f = Array.isArray(d.typed_files) ? d.typed_files[i] : null;
    if (!f?.path) return NextResponse.json({ error: '받을 수 있는 파일이 없습니다.' }, { status: 404 });
    const { data, error } = await admin.storage.from('exam-materials').createSignedUrl(f.path, 120, { download: f.name || 'typing.hwp' });
    if (error || !data) return NextResponse.json({ error: '파일을 준비하지 못했습니다.' }, { status: 500 });
    return NextResponse.redirect(data.signedUrl, 302);
}
