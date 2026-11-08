import { NextRequest } from 'next/server';
import { storageKey } from '@/lib/storage-key';
import { downloadError, downloadRedirect, safeFilename } from '@/lib/downloads';
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
    if (!slug || !k) return downloadError(400, '다운로드할 자료를 다시 선택해 주세요.');

    // 로그인 필수
    const sb = createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return downloadError(401, '로그인 후 무료 모의고사 자료를 다운로드하실 수 있습니다.');

    const admin = createAdminClient();
    const { data: row } = await admin.from('mock_exams').select('*').eq('slug', slug).maybeSingle();
    if (!row) return downloadError(404, '자료를 찾을 수 없습니다.');

    const path = storageKey((row as any)[k.col]);
    if (!path) return downloadError(404, '해당 파일이 아직 준비되지 않았습니다.');

    const ext = path.match(/\.([a-z0-9]{1,10})$/i)?.[1] || k.ext;
    const filename = safeFilename(`${row.title} ${k.label}.${ext}`);
    const { data: signed, error } = await admin.storage.from('mock-materials').createSignedUrl(path, 120, { download: filename });
    if (error || !signed?.signedUrl) return downloadError(503, '다운로드를 준비하지 못했습니다. 잠시 후 다시 시도해 주세요.');

    // 다운로드 로깅 — 사관·경대/전국연합 수요 측정 (free_pdf 와 동일 테이블, 실패해도 다운로드는 진행)
    try {
        await admin.from('feature_usage').insert({
            user_id: user.id,
            user_email: user.email ?? null,
            feature: 'mock_download',
            title: `${row.title} ${k.label}(${k.ext})`,
        });
    } catch { /* 로깅 실패 무시 */ }

    return downloadRedirect(signed.signedUrl, filename);
}
