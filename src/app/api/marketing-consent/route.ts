import { NextResponse } from 'next/server';
import { MARKETING_CONSENT_VERSION } from '@/lib/consent';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/server-admin';

export const dynamic = 'force-dynamic';

// "새 기출 알림 받기" 옵트인 — 무료PDF 다운로드 직후 배너에서 호출.
// 가입 폼의 marketing_agreed와 같은 필드에 저장해 발송 대상 명단을 하나로 유지.
export async function POST(req: Request) {
    const sb = createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ ok: false }, { status: 401 });

    // 본문이 없으면 예전처럼 '켜기'로 본다(무료PDF 직후 배너가 빈 POST 를 보낸다).
    // 마이페이지 수신설정은 { agreed: false } 로 끄기도 보낸다 — 동의문이 약속한 '수신 거부 방법'이다.
    const body = await req.json().catch(() => ({} as any));
    const agreed = body?.agreed === undefined ? true : !!body.agreed;

    const admin = createAdminClient();
    const { error } = await admin.auth.admin.updateUserById(user.id, {
        user_metadata: {
            ...(user.user_metadata || {}),
            marketing_agreed: agreed,
            // 이 배너의 안내 문구도 2026-09-05 개정본을 가리키므로 같은 버전을 남긴다.
            marketing_consent_version: MARKETING_CONSENT_VERSION,
        },
    });
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
}
