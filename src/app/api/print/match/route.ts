import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/server-admin';
import { readCrop } from '@/lib/print-vision';
import { generateEmbedding } from '@/lib/embeddings';
import { unitVariants, SUBJECT_UNITS } from '@/lib/curriculum';
import { findOriginals, screen, stemOf, type OriginalHit } from '@/lib/print-original';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const ALL_VARIANTS = Array.from(new Set(Object.values(SUBJECT_UNITS).flat().flatMap((u) => unitVariants(u))));

// 원본 찾기용 단원 발문 — 가장 큰 단원도 1MB·0.3초지만 같은 단원을 잇달아 자르므로 30분 담아 둔다(인스턴스 메모리)
const STMT_TTL = 30 * 60 * 1000;
const stmtCache: Map<string, { at: number; rows: [string, string, string?][] }> = (globalThis as any).__printStmt || new Map();
(globalThis as any).__printStmt = stmtCache;
async function stmtPool(admin: ReturnType<typeof createAdminClient>, units: string[]): Promise<[string, string, string?][]> {
    const key = [...units].sort().join('|');
    const hit = stmtCache.get(key);
    if (hit && Date.now() - hit.at < STMT_TTL) return hit.rows;
    const { data, error } = await admin.rpc('print_stmt_pool', { p_units: units });
    if (error) throw error;
    const rows = (Array.isArray(data) ? data : []) as [string, string, string?][];
    if (stmtCache.size > 40) stmtCache.clear();
    stmtCache.set(key, { at: Date.now(), rows });
    return rows;
}

// 단원 → 과목 역인덱스. 크롭에서 읽은 단원으로 과목을 되짚어 쿼리 텍스트에 넣는다.
const UNIT_TO_SUBJECT: Record<string, string> = {};
for (const [subj, units] of Object.entries(SUBJECT_UNITS)) {
    for (const u of units as string[]) if (!UNIT_TO_SUBJECT[u]) UNIT_TO_SUBJECT[u] = subj;
}

/**
 * DB 의 embedding 은 `[핵심개념태그: …]\n[과목: X] [학년: Y] 본문+해설 수식…` 형식으로 만들어져 있다
 * (scratch_batch_ai.ts). 그런데 여기서는 제미나이가 쓴 요약 한 문단만 임베딩하고 있었다.
 * 형식이 달라 벡터가 멀어지고, 같은 문제끼리도 유사도가 0.55 밖에 안 나왔다.
 * 같은 얼개로 감싸면 상위 8건의 단원 일치가 크게 올라간다(측정, 문항 5개 40칸):
 *   요약만 18/40 → 태그+과목 32/40, 유사도도 0.60 → 0.75 대.
 */
function buildQueryText(reading: { text: string; unit: string | null; concepts: string[] }): string {
    const tag = reading.concepts?.length ? `[핵심개념태그: ${reading.concepts.join(', ')}]\n` : '';
    const subj = reading.unit ? UNIT_TO_SUBJECT[reading.unit] : '';
    return `${tag}${subj ? `[과목: ${subj}] ` : ''}${reading.text}`;
}

/**
 * POST /api/print/match  { image: base64(데이터 접두사 제거), mimeType }
 * 크롭 문제 이미지 → Gemini 읽기 → OpenAI 임베딩 → match_predict 로 유사문제 후보 반환.
 * 가입회원 전용.
 */
export async function POST(req: NextRequest) {
    const sb = createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

    try {
        const body = await req.json().catch(() => ({}));
        let image: string = body?.image || '';
        const mimeType: string = body?.mimeType || 'image/png';
        const want = Math.min(Math.max(Number(body?.count) || 8, 1), 12);
        if (!image) return NextResponse.json({ error: '이미지가 없습니다.' }, { status: 400 });
        // data URL 접두사 제거
        const comma = image.indexOf(',');
        if (image.startsWith('data:') && comma >= 0) image = image.slice(comma + 1);

        // 1) Gemini 로 크롭 읽기
        const reading = await readCrop(image, mimeType);
        if (!reading.text) return NextResponse.json({ error: '문제를 읽지 못했어요. 영역을 더 정확히 잘라보세요.' }, { status: 422 });

        // 2) OpenAI 임베딩 (DB 호환)
        const { embedding } = await generateEmbedding(buildQueryText(reading));
        const vecLit = '[' + embedding.join(',') + ']';

        // 3) match_predict 로 유사문제 검색 (단원 변형 포함, 단원 불명이면 전체)
        const admin = createAdminClient();
        // 난이도 밴드. 난이도를 안 보면 '대칭이동' 같은 단어만 겹치는 Lv.1~2 기본 문제가
        // 유사도 0.75 로 최상단에 올라온다(측정). 원본이 Lv.8 인데 기본 문제를 주면
        // 그건 변형문제가 아니다. 예측 난이도 ±2 로 좁히면 같은 급의 문제가 올라온다.
        const d = reading.difficulty;
        const minDiff = d ? Math.max(1, d - 2) : 1;
        const maxDiff = d ? Math.min(10, d + 2) : 10;

        const search = async (targetUnits: string[], lo = minDiff, hi = maxDiff, count = want * 3) => {
            const { data, error } = await admin.rpc('match_predict', {
                query_embedding: vecLit,
                target_units: targetUnits,
                min_diff: lo,
                max_diff: hi,
                exclude_school: null,
                match_count: count,
            });
            if (error) throw error;
            return data || [];
        };
        const units = reading.unit ? unitVariants(reading.unit) : ALL_VARIANTS;

        // [10/26 대표·회원 건의] 학교 프린트의 학력평가 문제가 DB 에 그대로 있으면 그 원본(풀이 포함)을 맨 앞에,
        //   숫자만 바꾼 같은 틀 기출을 그다음에 준다. 유사문제 검색과 동시에 돌리고, 실패해도 유사문제는 그대로 간다.
        //   ⚠ 처음엔 임베딩 가까운 40개만 대조했는데 원본이 그 안에 못 들어와 10개 중 3개만 찾았다(실측) →
        //     단원 전체 발문(question_statement)을 글자로 먼저 거르고, 상위 10개만 해설 뺀 발문으로 숫자까지 대조한다.
        const origTask = (async (): Promise<{ originals: OriginalHit[]; origRows: any[] }> => {
            try {
                if (!reading.verbatim) return { originals: [], origRows: [] };
                const tryUnits = async (us: string[]) => {
                    const top = screen(reading.verbatim, await stmtPool(admin, us), 10);
                    if (!top.length) return { originals: [] as OriginalHit[], origRows: [] as any[] };
                    const { data: xs } = await admin.from('questions')
                        .select('id, unit, difficulty, subject, grade, school, year, semester, question_number, source_db_id, key_concepts, content_xml')
                        .in('id', top).eq('work_status', 'sorted');
                    const rows = (xs || []) as any[];
                    return { originals: findOriginals(reading.verbatim, rows.map((x) => ({ id: x.id, stem: stemOf(x.content_xml || '') }))), origRows: rows.map(({ content_xml, ...r }) => r) };
                };
                const first = await tryUnits(units);
                if (first.originals.some((o) => o.kind === 'original') || !reading.unit) return first;
                // 크롭 단원을 잘못 읽으면(실측 10개 중 2개: 여러가지부등식→이차함수, 지수함수→로그) 원본을 못 찾는다 → 같은 과목 다른 단원
                const subj = UNIT_TO_SUBJECT[reading.unit];
                const sib = ((subj ? (SUBJECT_UNITS as Record<string, string[]>)[subj] : []) || []).flatMap((u) => unitVariants(u)).filter((u) => !units.includes(u));
                if (!sib.length) return first;
                const second = await tryUnits(sib);
                return second.originals.some((o) => o.kind === 'original') ? second : first;
            } catch (e) {
                console.error('[print/match] 원본 찾기 실패(무시):', String(e).slice(0, 120));
                return { originals: [], origRows: [] };
            }
        })();

        let data = await search(units);

        // 결과가 0건이면 '같은 과목의 다른 단원'까지만 넓힌다 — 전 과목으로 넓히면
        // 결이 안 맞는 문제가 섞인다(그래서 전체 폴백을 걷어냈다).
        // 0건이 되는 실제 경우: 난이도 밴드가 좁아 그 단원·그 난이도대에 문항이 없을 때.
        // (한때 '도형의이동 문항이 0건이라 그렇다'고 적어뒀는데 오진이었다 —
        //  그 단원엔 390문항이 있고, 당시 DB 장애로 쿼리가 실패한 걸 빈 결과로 읽은 것이었다.)
        let widened = false;
        if (data.length === 0 && reading.unit) {
            const subj = UNIT_TO_SUBJECT[reading.unit];
            const siblings = subj ? (SUBJECT_UNITS as Record<string, string[]>)[subj] : null;
            if (siblings?.length) {
                try {
                    data = await search(siblings.flatMap((u) => unitVariants(u)));
                    widened = true;
                } catch (e) {
                    console.error('[print/match] 같은 과목 폴백 실패(무시):', String(e).slice(0, 120));
                }
            }
        }

        // 원본·같은 틀을 맨 앞에(출처 편중 제한 밖) → 그 뒤에 유사문제 want 개(출처 편중 방지)
        const { originals, origRows } = await origTask;
        const byId = new Map(origRows.map((r: any) => [r.id, r]));
        const picked: any[] = originals.filter((o) => byId.has(o.id)).map((o) => ({ ...byId.get(o.id), match: o.kind }));
        const pinned = new Set(picked.map((q) => q.id));
        const perSource: Record<string, number> = {};
        for (const q of (data || [])) {
            if (pinned.has(q.id)) continue;
            const s = q.source_db_id || '?';
            if ((perSource[s] || 0) >= 2) continue;
            picked.push(q); perSource[s] = (perSource[s] || 0) + 1;
            if (picked.length >= want + pinned.size) break;
        }

        return NextResponse.json({
            reading: { unit: reading.unit, concepts: reading.concepts, difficulty: reading.difficulty },
            candidates: picked,
            // 넓혀서 찾았으면 화면에 알린다 — 같은 단원이 아니라는 걸 숨기면
            // '이상한 문제가 나온다'로만 보인다(8/22 사용자 제보의 실체).
            widened,
        });
    } catch (e: any) {
        // 업스트림(OpenAI·Gemini) 에러 문구를 그대로 내보내면 사용자 화면에
        // "429 You exceeded your current quota, please check your plan and billing details ..."
        // 같은 결제 안내가 노출된다(2026-08-07 ~ 08-21 실제로 노출돼 있었고 건의사항으로 접수됨).
        // 원문은 서버 로그에만 남기고, 사용자에게는 상황별 안내만 준다.
        const raw = String(e?.message || e || '');
        console.error('[print/match] 실패:', raw);
        const isQuota = /quota|billing|insufficient_quota|rate limit|429/i.test(raw);
        return NextResponse.json({
            error: isQuota
                ? '지금 변형문제 찾기가 일시적으로 막혀 있어요. 잠시 후 다시 시도해 주세요. (문제가 계속되면 건의사항으로 알려주세요)'
                : '변형문제를 찾지 못했어요. 영역을 다시 잘라 시도해 주세요.',
        }, { status: isQuota ? 503 : 500 });
    }
}
