import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/server-admin';

export const dynamic = 'force-dynamic';

// 클라이언트 행동 로깅 (feature_usage) — RLS 때문에 서버 경유
// 현재 용도: 무료 문제 PDF 다운로드 (활성화율 측정의 핵심 행동인데 기록이 없었음)
//
// [시험지출제 퍼널] 2026-08-26 추가.
// 그전까지 기록되던 건 전부 '성공한 행동'뿐이라, 몇 명이 만들려다 그만뒀는지 알 수 없었다.
// (98건이 저장된 건 알지만 몇 명이 시도했는지를 몰라, 유입을 늘려야 할지 화면을 고쳐야 할지
//  정반대의 처방을 구분하지 못했다.) 진입→DB선택→검색→담기→저장 5단계를 남긴다.
const QB_FUNNEL = ['qb_enter', 'qb_db_select', 'qb_search', 'qb_cart_add', 'qb_save', 'qb_save_fail'];
const ALLOWED = new Set(['free_pdf', 'teacher_cta', 'youtube_guide', ...QB_FUNNEL]);

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
