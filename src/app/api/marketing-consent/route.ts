import { NextResponse } from 'next/server';
import { MARKETING_CONSENT_VERSION } from '@/lib/consent';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/server-admin';

export const dynamic = 'force-dynamic';

// "새 기출 알림 받기" 옵트인 — 무료PDF 다운로드 직후 배너에서 호출.
// 가입 폼의 marketing_agreed와 같은 필드에 저장해 발송 대상 명단을 하나로 유지.
export async function POST() {
    const sb = createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ ok: false }, { status: 401 });

    const admin = createAdminClient();
    const { error } = await admin.auth.admin.updateUserById(user.id, {
        user_metadata: {
            ...(user.user_metadata || {}),
            marketing_agreed: true,
            // 이 배너의 안내 문구도 2026-09-05 개정본을 가리키므로 같은 버전을 남긴다.
            marketing_consent_version: MARKETING_CONSENT_VERSION,
        },
    });
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
}
