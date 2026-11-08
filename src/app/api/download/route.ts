import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/server-admin';
import { downloadError, materialDownload } from '@/lib/downloads';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    try {
        const { data: { user }, error } = await createClient().auth.getUser();
        if (error || !user) return downloadError(401, '로그인 후 자료를 다운로드하실 수 있습니다.');
        return await materialDownload(createAdminClient(), user, new URL(req.url).searchParams.get('item') || '');
    } catch {
        return downloadError(503, '다운로드를 준비하지 못했습니다. 잠시 후 다시 시도해 주세요.');
    }
}
