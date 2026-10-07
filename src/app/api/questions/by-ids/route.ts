import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/server-admin';
import { canSeeSolutions, trimQuestionImages } from '@/lib/questions/imageAccess';
import { stripPrivate } from '@/lib/questions/privateDb';

export const dynamic = 'force-dynamic';

/**
 * POST /api/questions/by-ids   { ids: string[] }
 *
 * 특정 ID의 문제들을 조회 (장바구니 복원 / 시험지 재편집용).
 * RLS 잠금 후 클라이언트가 questions를 직접 못 읽으므로 서버 경유.
 *
 * [보안] content_xml(편집 가능한 원본)은 반환하지 않음.
 *  - 카드 표시는 100% 캡쳐 이미지로 이루어지고, 저장/생성은 ID로 서버가 재조회하므로
 *    클라이언트는 content_xml 이 필요 없음. → 원본 대량 추출(스크래핑) 경로 차단.
 *  - ID를 이미 알아야 하고, 개수 상한 + IP 속도제한으로 대량 덤프 방지.
 */
const MAX_IDS = 200;

// 경량 IP 속도제한 (search 라우트와 동일 정책)
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 40;
const hits: Map<string, { count: number; resetAt: number }> = (globalThis as any).__qbyids_hits || new Map();
(globalThis as any).__qbyids_hits = hits;
function rateLimited(ip: string): boolean {
    const now = Date.now();
    const rec = hits.get(ip);
    if (!rec || now > rec.resetAt) {
        hits.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
        return false;
    }
    rec.count++;
    return rec.count > RATE_MAX;
}

const SELECT_COLS = 'id, question_number, subject, grade, school, year, semester, difficulty, key_concepts, unit, work_status, source_db_id, question_type, question_images(question_id, data, id, original_bin_id, format)';

export async function POST(req: NextRequest) {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
    if (rateLimited(ip)) {
        return NextResponse.json({ success: false, error: '잠시 후 다시 시도해주세요. (요청이 너무 많습니다)' }, { status: 429 });
    }

    let body: any;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ success: false, error: 'Invalid body' }, { status: 400 });
    }

    const ids = Array.isArray(body?.ids) ? body.ids.slice(0, MAX_IDS) : [];
    // [2026-08-30] src 모드 — 시험지 상세(/exam/[id])에서 '이 문항으로 시험지 만들기' 로 올 때.
    // 유입의 대부분이 네이버 정확매칭 검색으로 시험지 상세에 곧장 떨어지는데, 거기서 출제 도구로
    // 가는 길이 없어 빈 화면에서 검색부터 다시 시작해야 했다(도구 완주율 20%).
    // 회차 하나의 문항은 그 페이지에 이미 미리보기로 공개돼 있으므로 새로 열리는 것이 없다.
    // ids 모드와 같은 컬럼·같은 속도제한을 쓴다.
    const src = typeof body?.src === 'string' ? body.src.slice(0, 200) : '';
    if (ids.length === 0 && !src) {
        return NextResponse.json({ success: true, data: [] });
    }

    const supabase = createAdminClient();

    // [2026-10-06] similar1 모드 — 무료PDF 팝업의 '유사문제 풀기' 버튼. 회차의 각 문항을 유사 1순위로 바꾼 시험지.
    //   기준은 시험지출제 화면의 유사문항 버튼과 같다(미리계산 question_similar · 발문 기준 · 같은 단원 · sorted).
    //   원본 회차 문항과 이미 고른 문항은 건너뛰고 다음 순위를 쓴다. 후보가 없으면 그 문항은 뺀다(missing 으로 알림).
    if (src && body?.variant === 'similar1') {
        const { data: base, error: baseErr } = await supabase.from('questions')
            .select('id, unit').eq('source_db_id', src).eq('work_status', 'sorted')
            .order('question_number', { ascending: true }).limit(MAX_IDS);
        if (baseErr) return NextResponse.json({ success: false, error: baseErr.message }, { status: 500 });
        const baseRows = base || [];
        const { data: sims } = baseRows.length
            ? await supabase.from('question_similar').select('question_id, neighbors')
                .in('question_id', baseRows.map(r => r.id)).eq('basis', 'statement')
            : { data: [] as any[] };
        const TOP = 8;   // 원본별 상위 몇 개까지 후보로 볼지 — 중복·단원 불일치로 1순위를 못 쓸 때 대비
        const nbrs = new Map<string, string[]>((sims || []).map((s: any) =>
            [s.question_id, (Array.isArray(s.neighbors) ? s.neighbors : []).filter(([, sim]: [string, number]) => sim > 0.5).slice(0, TOP).map(([id]: [string, number]) => id)]));
        const candIds = Array.from(new Set(Array.from(nbrs.values()).flat()));
        const { data: cands } = candIds.length
            ? await supabase.from('questions').select('id, unit').in('id', candIds).eq('work_status', 'sorted')
            : { data: [] as any[] };
        const unitOf = new Map((cands || []).map((c: any) => [c.id, c.unit]));
        const used = new Set<string>(baseRows.map(r => r.id));
        const picked: string[] = [];
        for (const r of baseRows) {
            const pick = (nbrs.get(r.id) || []).find(id => unitOf.has(id) && !used.has(id) && (!r.unit || unitOf.get(id) === r.unit));
            if (pick) { used.add(pick); picked.push(pick); }
        }
        const [withSolutions, { data: rows, error }] = await Promise.all([
            canSeeSolutions(),
            picked.length ? supabase.from('questions').select(SELECT_COLS).in('id', picked) : Promise.resolve({ data: [] as any[], error: null }),
        ]);
        if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
        const byId = new Map((rows || []).map((r: any) => [r.id, r]));
        const data = picked.map(id => byId.get(id)).filter(Boolean)
            .map((r: any) => ({ ...r, question_images: trimQuestionImages(r.question_images || [], withSolutions) }));
        return NextResponse.json({ success: true, data, missing: baseRows.length - data.length });
    }

    let q = supabase.from('questions').select(SELECT_COLS);
    q = src
        ? q.eq('source_db_id', src).eq('work_status', 'sorted').order('question_number', { ascending: true }).limit(MAX_IDS)
        : q.in('id', ids).in('work_status', ['sorted', 'private']);   // [10/7] 등록 대기(pending) 문항은 id 를 알아도 안 준다 — 시중교재가 연결 전 pending 으로 있다
    // [보안 2026-10-02] 해설 캡쳐는 로그인한 사람에게만 (이미지 API 와 같은 규칙: lib/questions/imageAccess)
    const [withSolutions, { data: rows, error }] = await Promise.all([canSeeSolutions(), q]);
    // 회원 전용 개인DB 문항은 쓸 수 있는 사람에게만 (10/6)
    const data = (await stripPrivate((rows || []) as any[])).map((r: any) => ({ ...r, question_images: trimQuestionImages(r.question_images || [], withSolutions) }));

    if (error) {
        console.error('[questions/by-ids] error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true, data: data || [] });
}
