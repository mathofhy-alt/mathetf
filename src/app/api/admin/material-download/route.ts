import { requireAdmin } from '@/utils/admin-auth';
import { createAdminClient } from '@/utils/supabase/server-admin';
import { DOWNLOAD_TTL, downloadError, downloadRedirect, safeFilename } from '@/lib/downloads';
import { storageKey } from '@/lib/storage-key';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    const { authorized, response } = await requireAdmin();
    if (!authorized) return downloadError(response?.status || 403, '관리자 계정으로 로그인해 주세요.');
    const query = new URL(req.url).searchParams;
    const path = storageKey(query.get('path'));
    if (!path) return downloadError(400, '파일 정보를 확인해 주세요.');
    const filename = safeFilename(query.get('name') || path.split('/').pop() || '자료');
    const { data, error } = await createAdminClient().storage.from('exam-materials').createSignedUrl(path, DOWNLOAD_TTL, { download: filename });
    if (error || !data?.signedUrl) return downloadError(404, '파일을 찾지 못했습니다. 다시 시도해 주세요.');
    return downloadRedirect(data.signedUrl, filename);
}
