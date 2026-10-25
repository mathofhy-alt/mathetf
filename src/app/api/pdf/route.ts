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
 * POST /api/pdf  { ids: string[], title?: string, source?: 'predict' | 'print' }  → { id }
 * [2026-10-25 대표 "pdf 받기"] 버셀은 한글을 못 돌린다. 한글 파일은 지금처럼 여기서 만들고(buildPredictHml — 한글 받기와 같은 내용),
 * 저장소 pdf-jobs/<id>.hml 에 올린 뒤 pdf_jobs 에 작업을 넣는다. 아이윈브 윈도우 서버(tools/pdf_worker)가 가져가 PDF 로 바꾼다.
 * 화면은 GET /api/pdf/<id> 로 끝났는지 본다. 파일을 먼저 올리고 작업을 넣는다(일꾼이 빈 파일을 집지 않게).
 */
export async function POST(req: NextRequest) {
    const { data: { user } } = await createClient().auth.getUser();
    if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    try {
        const body = await req.json().catch(() => ({}));
        const ids: string[] = (Array.isArray(body?.ids) ? body.ids : []).filter((x: any) => typeof x === 'string' && UUID_RE.test(x)).slice(0, 50);
        const title = (body?.title || '예상문제').toString().slice(0, 100);
        const source = body?.source === 'print' ? 'print' : 'predict';
        if (ids.length === 0) return NextResponse.json({ error: '문항이 없습니다.' }, { status: 400 });

        const admin = createAdminClient();
        // 한 사람이 동시에 여러 개를 걸어 서버를 막지 않게 — 3분 안에 끝나지 않은 작업이 있으면 기다리게 한다
        const since = new Date(Date.now() - 3 * 60_000).toISOString();
        const { data: busy } = await admin.from('pdf_jobs').select('id').eq('user_id', user.id).in('status', ['pending', 'working']).gte('created_at', since).limit(1);
        if (busy?.length) return NextResponse.json({ error: '앞서 요청한 PDF를 만드는 중이에요. 끝난 뒤 다시 눌러 주세요.', id: busy[0].id }, { status: 429 });

        const hml = await buildPredictHml(ids, title);
        const id = crypto.randomUUID();
        const up = await admin.storage.from('pdf-jobs').upload(`${id}.hml`, Buffer.from(hml, 'utf8'), { contentType: 'application/octet-stream', upsert: true });
        if (up.error) throw new Error('파일을 올리지 못했습니다.');
        // [10/25 대표] 무료 회원 PDF 에는 로고(오른쪽 위 수학ETF · 아래 가운데 mathetf.com) — 서버 일꾼이 찍는다
        let stamp = true;
        try { const ps = await passStatus(user); stamp = !ps.passUntil && !ps.admin; } catch { /* 확인 실패면 찍는다 */ }
        const { error } = await admin.from('pdf_jobs').insert({ id, user_id: user.id, kind: source, title, stamp });
        if (error) throw new Error('PDF 작업을 만들지 못했습니다.');

        try {
            await admin.from('feature_usage').insert({ user_id: user.id, user_email: user.email ?? null, feature: `${source}_pdf`, title, question_count: ids.length });
        } catch { /* 로깅 실패 무시 */ }
        return NextResponse.json({ id });
    } catch (e: any) {
        return NextResponse.json({ error: e.message || 'PDF 요청 실패' }, { status: 500 });
    }
}
