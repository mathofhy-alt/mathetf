import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/server-admin';
import { buildPredictHml } from '@/lib/predict-hml';
import { passStatus } from '@/lib/qbPass';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/predict/hwp  { ids: string[], title?: string }
 * 예상문제 세트를 HWP(.hml)로 즉석 생성해 바로 다운로드(저장 목록에 쌓지 않음).
 * 이용권 회원·운영자 전용(10/25부터 — 무료 회원은 PDF). 문항 조립은 기존 generateHmlFromTemplate 재사용.
 */
export async function POST(req: NextRequest) {
    const sb = createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return new NextResponse('로그인이 필요합니다.', { status: 401 });
    // [10/25 대표] 예상문제·프린트변형의 한글(HWP)은 이용권 회원만 — 무료 회원은 로고가 찍힌 PDF(/api/pdf).
    //   한글을 주면 로고를 지우고 자기 자료로 만든다. 강사는 고쳐 쓰려면 이용권, 학생·학부모는 PDF 로 충분.
    try {
        const ps = await passStatus(user);
        if (!ps.passUntil && !ps.admin) return NextResponse.json({ error: '한글(HWP) 파일은 이용권 회원만 받을 수 있어요. 무료로는 PDF로 받을 수 있어요.', needPass: true }, { status: 402 });
    } catch { return NextResponse.json({ error: '이용권 확인에 실패했어요. 잠시 후 다시 시도해 주세요.' }, { status: 503 }); }

    try {
        const body = await req.json().catch(() => ({}));
        const ids: string[] = (Array.isArray(body?.ids) ? body.ids : []).filter((x: any) => typeof x === 'string' && UUID_RE.test(x)).slice(0, 50);
        const title = (body?.title || '예상문제').toString();
        const source = body?.source === 'print' ? 'print' : 'predict';
        if (ids.length === 0) return NextResponse.json({ error: '문항이 없습니다.' }, { status: 400 });

        const hmlContent = await buildPredictHml(ids, title);

        // 사용 로그 (실패해도 다운로드엔 영향 없음)
        // set_hash: 같은 문항 세트를 반복 다운로드하는지 판별용 (반복 다운로드 조사)
        try {
            const setHash = crypto.createHash('sha1')
                .update([...ids].sort().join(','))
                .digest('hex').slice(0, 12);
            const base = {
                user_id: user.id,
                user_email: user.email ?? null,
                feature: source,
                title,
                question_count: ids.length,
            };
            const admin = createAdminClient();
            const { error } = await admin.from('feature_usage').insert({ ...base, set_hash: setHash });
            // set_hash 컬럼 마이그레이션 전이면 컬럼 없이 재시도 (로깅 끊김 방지)
            if (error) await admin.from('feature_usage').insert(base);
        } catch { /* 로깅 실패 무시 */ }

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
