import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/server-admin';

export const dynamic = 'force-dynamic';

// 무료 문제 PDF 발급 — 하루 상한을 서버에서 건다.
//
// [2026-09-02] 한 사용자가 하루에 32개교 177건을 받아갔다(그날 사이트 전체 활동 202건 중 181건).
// 무료 PDF 는 가입 유도용이지 통째로 퍼가라는 게 아니다.
// 예전엔 클라이언트가 exam_materials.free_pdf_url 을 직접 읽어 받았기 때문에
// 화면에서 막아도 소용이 없었다. 그래서 URL 발급 자체를 서버로 옮긴다.
const DAILY_LIMIT = 10;

// KST 기준 오늘 0시 (UTC ISO)
function kstDayStartUtc(): string {
    const nowKst = new Date(Date.now() + 9 * 3600_000);
    const y = nowKst.getUTCFullYear(), m = nowKst.getUTCMonth(), d = nowKst.getUTCDate();
    return new Date(Date.UTC(y, m, d) - 9 * 3600_000).toISOString();
}

export async function POST(req: NextRequest) {
    const sb = createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

    try {
        const body = await req.json().catch(() => ({}));
        const id = String(body?.id || '');
        const title = String(body?.title || '').slice(0, 200) || null;
        if (!id) return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });

        const admin = createAdminClient();

        const { count } = await admin
            .from('feature_usage')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', user.id)
            .eq('feature', 'free_pdf')
            .gte('created_at', kstDayStartUtc());

        const used = count ?? 0;
        if (used >= DAILY_LIMIT) {
            return NextResponse.json({
                error: `무료 문제 PDF는 하루 ${DAILY_LIMIT}개까지 받으실 수 있어요. 내일 다시 이용해주세요.`,
                limited: true, used, limit: DAILY_LIMIT,
            }, { status: 429 });
        }

        const { data: row } = await admin
            .from('exam_materials').select('free_pdf_url').eq('id', id).single();
        const url = row?.free_pdf_url;
        if (!url) return NextResponse.json({ error: '무료 PDF를 준비 중입니다.' }, { status: 404 });

        // 발급 시점에 서버가 직접 기록한다. 예전 클라이언트 로깅은 실패해도 무시라
        // 상한 계산의 근거로 쓰기엔 믿을 수 없었다.
        await admin.from('feature_usage').insert({
            user_id: user.id, user_email: user.email ?? null, feature: 'free_pdf', title,
        });

        return NextResponse.json({ url, used: used + 1, limit: DAILY_LIMIT });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
