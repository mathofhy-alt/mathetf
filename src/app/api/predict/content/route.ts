import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/server-admin';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/predict/content  { ids: string[] }
 * 예상문제 미리보기용 content_xml 공급.
 * 게이팅: 비로그인은 최대 3개(맛보기), 로그인은 최대 40개.
 * (content_xml 엔 문제+해설이 함께 있으나, 클라이언트는 displayMode='question'으로 문제만 표시)
 */
export async function POST(req: NextRequest) {
    const body = await req.json().catch(() => ({}));
    let ids = (Array.isArray(body?.ids) ? body.ids : []).filter((x: any) => typeof x === 'string' && UUID_RE.test(x));

    const sb = createClient();
    let isLoggedIn = false;
    try { const { data: { user } } = await sb.auth.getUser(); isLoggedIn = !!user; } catch { }

    ids = isLoggedIn ? ids.slice(0, 40) : ids.slice(0, 3);
    if (ids.length === 0) return NextResponse.json({ content: {}, locked: !isLoggedIn });

    try {
        const admin = createAdminClient();
        const { data, error } = await admin.from('questions').select('id, content_xml').in('id', ids);
        if (error) throw error;
        const content: Record<string, string> = {};
        for (const r of (data || [])) content[r.id] = r.content_xml || '';
        return NextResponse.json({ content, locked: !isLoggedIn });
    } catch (e: any) {
        return NextResponse.json({ content: {}, error: e.message }, { status: 500 });
    }
}
