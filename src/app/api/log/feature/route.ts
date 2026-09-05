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

// [익명 구간 계측] 2026-09-06 추가.
// 그전까지 이 라우트는 비로그인이면 401 이었다. 그래서 **로그인 전 행동이 한 건도 없었다** —
// 방문자 119명 중 무엇을 보고 어디서 돌아섰는지 한 글자도 모르는 상태였고,
// '가입 화면이 문제인가, 거기까지 오지도 않는가'를 구분할 방법이 없었다.
// (가입 폼 자체는 도달자의 92%가 끝낸다 — phone_verifications 잔여 행으로 확인)
//
// 아래 3종만 비로그인으로 허용한다. user_id 는 NULL 로 들어간다(컬럼이 nullable 인 것을 확인).
//   anon_cta_view  : 무료PDF 가입 유도 배너가 실제로 화면에 보임
//   anon_cta_click : 그 배너의 가입 버튼을 누름
//   signup_start   : 가입 페이지에 도달
// → 방문 → 배너 노출 → 클릭 → 가입 시작 → 가입 완료 가 처음으로 이어져 보인다.
const ANON_ALLOWED = new Set(['anon_cta_view', 'anon_cta_click', 'signup_start']);

/** 같은 사이트에서 온 요청인지 — 인증이 없는 구간이라 최소한의 문지기를 둔다. */
function sameOrigin(req: NextRequest): boolean {
    const host = req.headers.get('host');
    if (!host) return false;
    const src = req.headers.get('origin') || req.headers.get('referer') || '';
    if (!src) return false;
    try { return new URL(src).host === host; } catch { return false; }
}

export async function POST(req: NextRequest) {
    const sb = createClient();
    const { data: { user } } = await sb.auth.getUser();

    try {
        const body = await req.json().catch(() => ({}));
        const feature = String(body?.feature || '');
        const title = String(body?.title || '').slice(0, 200) || null;

        if (!user) {
            // 비로그인: 익명 3종만, 그리고 우리 사이트에서 온 요청만 받는다.
            if (!ANON_ALLOWED.has(feature)) return NextResponse.json({ ok: false }, { status: 401 });
            if (!sameOrigin(req)) return NextResponse.json({ ok: false }, { status: 403 });
            await createAdminClient().from('feature_usage').insert({
                user_id: null, user_email: null, feature, title,
            });
            return NextResponse.json({ ok: true });
        }

        // 로그인: 기존 목록 + 익명 3종(로그인 상태로 가입 페이지에 가는 경우 등도 남긴다)
        if (!ALLOWED.has(feature) && !ANON_ALLOWED.has(feature)) {
            return NextResponse.json({ ok: false }, { status: 400 });
        }
        await createAdminClient().from('feature_usage').insert({
            user_id: user.id,
            user_email: user.email ?? null,
            feature,
            title,
        });
    } catch { /* 로깅 실패는 무시 — 다운로드 UX에 영향 없음 */ }

    return NextResponse.json({ ok: true });
}
