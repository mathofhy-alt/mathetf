import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/server-admin';

export const dynamic = 'force-dynamic';

// 클라이언트 행동 로깅 (feature_usage) — RLS 때문에 서버 경유
// 현재 용도: 무료 문제 PDF 다운로드 (활성화율 측정의 핵심 행동인데 기록이 없었음)
const ALLOWED = new Set(['free_pdf']);

export async function POST(req: NextRequest) {
    const sb = createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ ok: false }, { status: 401 });

    try {
        const body = await req.json().catch(() => ({}));
        const feature = String(body?.feature || '');
        if (!ALLOWED.has(feature)) return NextResponse.json({ ok: false }, { status: 400 });
        const title = String(body?.title || '').slice(0, 200) || null;

        await createAdminClient().from('feature_usage').insert({
            user_id: user.id,
            user_email: user.email ?? null,
            feature,
            title,
        });
    } catch { /* 로깅 실패는 무시 — 다운로드 UX에 영향 없음 */ }

    return NextResponse.json({ ok: true });
}
