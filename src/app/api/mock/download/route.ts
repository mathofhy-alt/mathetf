import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/server-admin';

export const dynamic = 'force-dynamic';

const KINDS: Record<string, { col: string; label: string; ext: string }> = {
    'original-pdf': { col: 'original_pdf_path', label: '원본', ext: 'pdf' },
    'original-hwp': { col: 'original_hwp_path', label: '원본', ext: 'hwp' },
    'variant-pdf': { col: 'variant_pdf_path', label: '변형', ext: 'pdf' },
    'variant-hwp': { col: 'variant_hwp_path', label: '변형', ext: 'hwp' },
};

export async function GET(req: NextRequest) {
    const slug = req.nextUrl.searchParams.get('slug') || '';
    const kind = req.nextUrl.searchParams.get('kind') || '';
    const k = KINDS[kind];
    if (!slug || !k) return new NextResponse('잘못된 요청입니다.', { status: 400 });

    // 로그인 필수
    const sb = createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) {
        return NextResponse.redirect(new URL(`/login?message=${encodeURIComponent('로그인 후 다운로드할 수 있어요.')}`, req.url));
    }

    const admin = createAdminClient();
    const { data: row } = await admin.from('mock_exams').select('*').eq('slug', slug).maybeSingle();
    if (!row) return new NextResponse('자료를 찾을 수 없습니다.', { status: 404 });

    const path = (row as any)[k.col] as string | null;
    if (!path) return new NextResponse('해당 파일이 없습니다.', { status: 404 });

    const filename = `${row.title} ${k.label}.${k.ext}`.replace(/[\\/<>:"|?*]/g, '_');
    const { data: signed, error } = await admin.storage.from('mock-materials').createSignedUrl(path, 120, { download: filename });
    if (error || !signed?.signedUrl) return new NextResponse('다운로드 링크 생성 실패', { status: 500 });

    return NextResponse.redirect(signed.signedUrl);
}
