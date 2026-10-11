import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/server-admin';
import { cachedFacets, isWholeCatalog, resolveRequestScope, wholeCatalogIneligible } from '@/lib/questions/fastScope';
import { hasFilter, likePattern, type ChatPlan, type ChatTurn, type ConceptCatalog } from '@/lib/questions/chatPlan';
import { buildFromChat } from '@/lib/questions/chatBuild';
import { uuidPattern } from '@/lib/payments/order';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * 시험지출제 'AI로 만들기' (2026-10-11) — 말로 한 요청 → 문항 id 목록.
 * 문항 본문은 주지 않는다(클라이언트가 기존 /api/questions/by-ids 로 받는다 — 자동 출제와 같은 길).
 * 조건 해석은 lib/questions/chatPlan.ts, 후보는 question_bank_topic(SQL 20261011_question_bank_topic.sql).
 */

// '과목|단원' 별 태그 수 — 등록 배치 때만 바뀐다. 인스턴스 메모리 1시간
let conceptCache: { at: number; value: Promise<ConceptCatalog> } | null = null;
function conceptCounts(): Promise<ConceptCatalog> {
    if (conceptCache && Date.now() - conceptCache.at < 3_600_000) return conceptCache.value;
    const value = (async () => {
        const { data, error } = await createAdminClient().rpc('question_bank_concept_counts');
        if (error) throw new Error(error.message);
        return (data || {}) as ConceptCatalog;
    })();
    conceptCache = { at: Date.now(), value };
    value.catch(() => { conceptCache = null; });
    return value;
}

// 한 사람이 짧은 시간에 몰아 부르면 AI 비용만 나간다 — 인스턴스 메모리로 10분 20회
const recent: Map<string, number[]> = (globalThis as any).__qb_chat_rate || new Map();
(globalThis as any).__qb_chat_rate = recent;
function tooMany(userId: string) {
    const now = Date.now(), list = (recent.get(userId) || []).filter(t => now - t < 600_000);
    list.push(now); recent.set(userId, list);
    return list.length > 20;
}

/** 이용 가능한 모든 출제자료 id — 자료 목록이 아직 안 불러와진 채 보낸 요청(빈 목록)도 전체로 찾는다(10/12) */
async function wholeIds(): Promise<string[]> {
    const { catalog } = await resolveRequestScope([]).catch(() => ({ catalog: [] as any[] }));
    return catalog.filter((db: any) => !db.availability && !db.private).map((db: any) => db.id);
}

/** 범위 준비(단원 목록·태그 수·전체에서 뺄 문항)를 한꺼번에. 서버가 새로 뜬 뒤 첫 요청이 17초 걸렸다(10/12 운영) */
async function prepare(selectedDbs: string[], includeOff: boolean) {
    const ids = selectedDbs.length ? selectedDbs : await wholeIds();
    const { catalog, scope } = await resolveRequestScope(ids);
    const whole = isWholeCatalog(catalog, ids);
    const [facets, counts, ineligible] = await Promise.all([
        scope.length ? cachedFacets(catalog, scope, whole, includeOff) : Promise.resolve([]),
        conceptCounts(),
        whole ? wholeCatalogIneligible(catalog) : Promise.resolve(null),
    ]);
    const concepts: ConceptCatalog = {};
    for (const f of facets as any[]) {
        if (!f?.subject || !f?.unit || (f.is_off_curriculum && !includeOff)) continue;
        const t = `${f.subject}|${f.unit}`;
        concepts[t] = { ...(concepts[t] || {}), ...(counts[t] || {}) };
    }
    return { scope, whole, ineligible, concepts };
}

/** 미리 데우기 — 시험지 만들기 화면이 열리면 부른다. AI 는 부르지 않는다(비용 0) */
export async function GET() {
    const t = Date.now();
    try { await prepare([], false); return NextResponse.json({ ok: true, ms: Date.now() - t }); }
    catch { return NextResponse.json({ ok: false }, { status: 200 }); }
}

export async function POST(req: NextRequest) {
    const { data: { user } } = await createClient().auth.getUser();
    if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    if (tooMany(user.id)) return NextResponse.json({ error: '요청이 너무 잦아요. 잠시 뒤에 다시 해 주세요.' }, { status: 429 });

    const body = await req.json().catch(() => null);
    const messages: ChatTurn[] = Array.isArray(body?.messages) ? body.messages
        .filter((m: any) => (m?.role === 'user' || m?.role === 'assistant') && typeof m?.content === 'string')
        .map((m: any) => ({ role: m.role, content: m.content.slice(0, 1000) })).slice(-8) : [];
    if (!messages.length || messages[messages.length - 1].role !== 'user') return NextResponse.json({ error: '요청을 적어 주세요.' }, { status: 400 });
    const maxCount = Math.min(50, Math.max(1, Number(body?.maxCount) || 50));
    const excluded: string[] = Array.isArray(body?.excludedQuestionIds) ? body.excludedQuestionIds : [];
    if (excluded.length > 5000 || excluded.some(id => typeof id !== 'string' || !uuidPattern.test(id))) return NextResponse.json({ error: '제외할 문항 정보를 확인해주세요.' }, { status: 400 });
    const includeOff = body?.includeOffCurriculum === true;
    const lastPlan: ChatPlan | null = body?.lastPlan && typeof body.lastPlan === 'object' ? body.lastPlan : null;
    // [10/11 사용자 요청] 사람들이 챗봇에 쓴 말과 챗봇 반응을 다 남긴다 — 그래야 고친다(qb_chat_logs, 서버만 읽고 쓴다)
    const t0 = Date.now();
    const log = (row: Record<string, unknown>) => {
        void createAdminClient().from('qb_chat_logs').insert({
            user_id: user.id, request: messages[messages.length - 1].content, history: messages.slice(0, -1), ms: Date.now() - t0, ...row,
        }).then(({ error }) => { if (error) console.error('[chat-generate] log', error.message); });
    };

    try {
        const selected: string[] = Array.isArray(body?.selectedDbs) ? body.selectedDbs.filter((x: unknown) => typeof x === 'string') : [];
        const { scope, whole, ineligible, concepts } = await prepare(selected, includeOff);
        const tPrep = Date.now() - t0;
        if (!scope.length || !Object.keys(concepts).length) return NextResponse.json({ error: '출제할 자료를 불러오지 못했어요. 잠시 뒤에 다시 해 주세요.' }, { status: 503 });

        const useWhole = whole && ineligible !== null;   // '전체' 빠른길 함수가 없으면 범위 규칙 길로
        let dbMs = 0;
        const out = await buildFromChat(messages, concepts, maxCount, lastPlan, async (plan, targets, query) => {
            const td = Date.now();
            const { data, error } = await createAdminClient().rpc('question_bank_topic', {
                p_scope: scope, p_whole: useWhole, p_excluded: useWhole ? [...excluded, ...(ineligible || [])] : excluded,
                p_targets: targets, p_min: plan.minDifficulty, p_max: plan.maxDifficulty, p_include_off: includeOff,
                p_concepts: plan.concepts, p_patterns: plan.keywords.map(likePattern),
                p_query: query ? JSON.stringify(query) : null, p_limit: 600, ...(hasFilter(plan) ? { p_filter: plan.filters } : {}),
            });
            dbMs += Date.now() - td;
            if (error) throw new Error(error.message);
            return (data || []) as any[];
        }, async (ids) => {
            const m = new Map<string, string[]>();
            for (let i = 0; i < ids.length; i += 200) {
                const { data } = await createAdminClient().from('questions').select('id,key_concepts').in('id', ids.slice(i, i + 200));
                for (const r of data || []) m.set(r.id, r.key_concepts || []);
            }
            return m;
        });
        // 단계별 시간(ms) — 느린 곳을 숫자로 찾으려고. ai = AI 조건 해석 + 임베딩(나머지)
        const total = Date.now() - t0;
        log({ plan: { ...out.plan, _ms: { prep: tPrep, db: dbMs, ai: total - tPrep - dbMs, total } }, reply: out.reply, by: out.by, question_ids: out.chosen.map(c => c.id) });
        return NextResponse.json({ reply: out.reply, plan: out.plan, by: out.by, questions: out.chosen.map(c => ({ id: c.id, difficulty: c.difficulty })) });
    } catch (e) {
        console.error('[chat-generate]', (e as Error).message);
        log({ error: (e as Error).message.slice(0, 500) });
        return NextResponse.json({ error: '시험지를 만들지 못했어요. 잠시 뒤에 다시 해 주세요.' }, { status: 500 });
    }
}
