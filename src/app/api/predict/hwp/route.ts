import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { buildPredictHml } from '@/lib/predict-hml';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/predict/hwp  { ids: string[], title?: string }
 * 예상문제 세트를 HWP(.hml)로 즉석 생성해 바로 다운로드(저장 목록에 쌓지 않음).
 * 가입회원 전용(무료). 문항 조립은 기존 generateHmlFromTemplate 재사용.
 */
export async function POST(req: NextRequest) {
    const sb = createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return new NextResponse('로그인이 필요합니다.', { status: 401 });

    try {
        const body = await req.json().catch(() => ({}));
        const ids: string[] = (Array.isArray(body?.ids) ? body.ids : []).filter((x: any) => typeof x === 'string' && UUID_RE.test(x)).slice(0, 50);
        const title = (body?.title || '예상문제').toString();
        if (ids.length === 0) return NextResponse.json({ error: '문항이 없습니다.' }, { status: 400 });

        const hmlContent = await buildPredictHml(ids, title);

        const titleStr = title.replace(/[\\/<>:"|?*]/g, '_').trim() || '예상문제';
        const filenameAscii = 'yesang_munje.hml';
        const filenameUtf8 = encodeURIComponent(`${titleStr}.hml`);
        return new NextResponse(hmlContent, {
            status: 200,
            headers: {
                'Content-Type': 'application/x-hwp; charset=utf-8',
                'Content-Disposition': `attachment; filename="${filenameAscii}"; filename*=UTF-8''${filenameUtf8}`,
                'Cache-Control': 'no-store',
            },
        });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
