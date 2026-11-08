import { NextRequest, NextResponse } from 'next/server';
import { stripPrivate } from '@/lib/questions/privateDb';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/server-admin';
import { previewAccess } from '@/lib/predictAccess';
import { BundleError } from '@/lib/planBundles';
import { questionPreview } from '@/lib/bundlePolicy';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/predict/content  { ids: string[] }
 * 예상문제 미리보기용 content_xml 공급.
 * 로그인·이용 가능 횟수 또는 본인 수령 묶음을 확인. 미리보기는 서버에서 해설을 제거한다.
 */
export async function POST(req: NextRequest) {
    const body = await req.json().catch(() => ({}));
    let ids = (Array.isArray(body?.ids) ? body.ids : []).filter((x: any) => typeof x === 'string' && UUID_RE.test(x));

    const sb = createClient();
    const { data: { user } } = await sb.auth.getUser();

    // [10/26 대표] 비로그인 맛보기(3문항) 폐지 — 비로그인은 아무것도 못 받는다
    if (!user) return NextResponse.json({ error: '로그인이 필요합니다.', content: {}, locked: true }, { status: 401 });
    ids = ids.slice(0, 40);
    ids = [...new Set(ids.map((id: string) => id.toLowerCase()))];
    if (ids.length === 0) return NextResponse.json({ content: {}, locked: false });

    try {
        await previewAccess(user, 'predict', ids, body);
        const admin = createAdminClient();
        const { data, error } = await admin.from('questions').select('id, content_xml, work_status, source_db_id').in('id', ids).in('work_status', ['sorted', 'private']);   // [10/7] 대기(pending) 문항은 안 줌
        if (error) throw error;
        const content: Record<string, string> = {};
        for (const r of await stripPrivate(data || [])) content[r.id] = questionPreview(r.content_xml || '');
        return NextResponse.json({ content, locked: false });
    } catch (e: any) {
        return NextResponse.json({ content: {}, locked: true, error: e.message, needPass: e instanceof BundleError && e.needPass }, { status: e instanceof BundleError ? e.status : 503 });
    }
}
