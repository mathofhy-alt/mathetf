import { requireAdmin } from '@/utils/admin-auth';
import { createAdminClient } from '@/utils/supabase/server-admin';
import { attachment, downloadError } from '@/lib/downloads';
import { materialArchive } from '@/lib/material-archive';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: Request) {
    const { authorized, response } = await requireAdmin();
    if (!authorized) return downloadError(response?.status || 403, '관리자 계정으로 로그인해 주세요.');
    try {
        if (Number(req.headers.get('content-length')) > 128 * 1024) return downloadError(400, '한 번에 최대 100개까지 선택해 주세요.');
        const form = await req.formData();
        const value = String(form.get('files') || '');
        if (value.length > 128 * 1024) throw Error('Too many files');
        const bytes = await materialArchive(createAdminClient(), JSON.parse(value));
        return new Response(new Uint8Array(bytes), { headers: {
            'Content-Type': 'application/zip', 'Content-Disposition': attachment('원본자료_전체.zip'),
            'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
        } });
    } catch {
        return downloadError(400, '전체 파일을 준비하지 못했습니다. 100개·100MB 이하로 나누거나 개별 받기를 이용해 주세요.');
    }
}
