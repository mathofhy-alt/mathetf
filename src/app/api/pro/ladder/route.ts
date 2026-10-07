import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/server-admin';

export const dynamic = 'force-dynamic';

/**
 * POST /api/pro/ladder  { id: string, perStep?: 1|2|3, exclude?: string[] }
 *
 * 목표 문항 하나를 받아 **가르치는 순서대로 쌓은 3단 사다리**를 돌려준다.
 *   1단 기초 → 2단 유형 → 3단 목표 문항
 *
 * [왜]
 * 사용자(현직 수학 강사)의 설명(2026-08-30):
 *   시험 직후에 필요한 건 '숫자 변형 재시험', 숙제로 내주는 건 '비슷한 문제',
 *   그리고 **수업을 구성할 때 필요한 건 쉬운 것부터 올라가는 사다리**다.
 *
 * [10/7 정교화 — 사용자: "단계별 개수 선택·문항 교체·추천 방식 더 정교하게"]
 *   예전: 같은 단원에서 **정렬 없이 아무 400개**만 가져와(큰 단원은 3,353개) 개념 태그가 겹치는 것 1개씩.
 *   지금:
 *   - 후보 = 같은 단원 **전체**(목표보다 쉬운 것만), 같은 과목 우선.
 *   - 점수 = 개념 태그 겹침(Jaccard + 개수) + 비슷한 풀이(해설 유사도) + 비슷한 발문(발문 유사도)
 *            + 단계 난이도 구간 중앙에 가까움 + 같은 과목.
 *     유사도는 미리 계산된 question_similar(목표 문항의 상위 50개, statement·solution) 를 쓴다.
 *     기초 단계는 '같은 개념·같은 풀이 방법' 쪽, 유형 단계는 '비슷한 문제 모양' 쪽에 무게를 더 준다.
 *   - 다양성: 한 사다리 안에서 같은 시험지(source_db_id)에서 두 개를 뽑지 않는다.
 *     목표와 발문이 사실상 같은 문항(유사도 0.97 초과 — 다른 학교가 그대로 낸 문제)은 뺀다.
 *   - 단계마다 고른 문항(perStep 개) + 교체 후보(alternates, 점수순)를 같이 준다 → 화면에서 바로 바꾼다.
 */

type Row = { id: string; unit: string | null; difficulty: any; key_concepts: any; subject: string | null; source_db_id: string | null };

const concepts = (q: Row): Set<string> => {
    const k = q.key_concepts;
    const arr = Array.isArray(k) ? k : typeof k === 'string' ? [k] : [];
    return new Set(arr.map((x: any) => String(x).replace(/^#/, '').trim()).filter(Boolean));
};
const diff = (q: Row) => Number(q.difficulty) || 0;
const PAGE = 1000;
const ALTERNATES = 8;
const COLS = 'id, unit, difficulty, key_concepts, subject, source_db_id';

export async function POST(req: NextRequest) {
    let body: any;
    try { body = await req.json(); } catch { return NextResponse.json({ success: false, error: 'Invalid body' }, { status: 400 }); }
    const id = typeof body?.id === 'string' ? body.id : '';
    if (!id) return NextResponse.json({ success: false, error: '문항 id가 없습니다.' }, { status: 400 });
    const perStep = Math.min(3, Math.max(1, Number(body?.perStep) || 1));
    const exclude = new Set<string>(Array.isArray(body?.exclude) ? body.exclude.filter((x: unknown) => typeof x === 'string').slice(0, 200) : []);

    const supabase = createAdminClient();
    const { data: target, error: e1 } = await supabase.from('questions').select(COLS).eq('id', id).eq('work_status', 'sorted').single();
    if (e1 || !target) return NextResponse.json({ success: false, error: '문항을 찾을 수 없습니다.' }, { status: 404 });

    const t = target as Row;
    const td = diff(t);
    const tc = concepts(t);
    if (!t.unit || td < 3) {
        return NextResponse.json({ success: true, steps: [], reason: '이 문항은 단원·난이도 정보가 부족해 사다리를 만들 수 없습니다.' });
    }

    // 같은 단원 · 목표보다 쉬운 것 전부 (큰 단원도 3~4번이면 끝난다) + 목표의 유사도 목록
    const [poolRes, simRes] = await Promise.all([
        (async () => {
            const out: Row[] = [];
            for (let from = 0; from < 8000; from += PAGE) {
                const { data, error } = await supabase.from('questions').select(COLS)
                    .eq('work_status', 'sorted').eq('unit', t.unit).neq('id', t.id).lt('difficulty', String(td))
                    .order('id').range(from, from + PAGE - 1);
                if (error) throw error;
                out.push(...((data || []) as Row[]));
                if ((data || []).length < PAGE) break;
            }
            return out;
        })(),
        supabase.from('question_similar').select('basis, neighbors').eq('question_id', t.id),
    ]).catch((e) => [null, e] as const);
    if (!poolRes) return NextResponse.json({ success: false, error: '후보 문항을 불러오지 못했습니다.' }, { status: 500 });
    const pool = poolRes as Row[];
    const sim = { statement: new Map<string, number>(), solution: new Map<string, number>() };
    for (const r of ((simRes as any)?.data || []) as { basis: 'statement' | 'solution'; neighbors: [string, number][] }[]) {
        const m = sim[r.basis]; if (!m) continue;
        for (const [nid, s] of Array.isArray(r.neighbors) ? r.neighbors : []) m.set(nid, Number(s) || 0);
    }

    // 목표 난이도를 둘로: [1 ~ a) 기초, [a ~ td) 유형
    const a = Math.max(2, Math.round(td * 0.45));
    const bands = [
        { label: '기초', lo: 1, hi: a, wConcept: 1.2, wSol: 1.2, wStmt: 0.6 },
        { label: '유형', lo: a, hi: td, wConcept: 1.0, wSol: 1.0, wStmt: 1.4 },
    ];
    const boost = (s: number, from: number) => Math.max(0, (s - from) / (1 - from));   // from 아래는 0, 1 이면 1

    const used = new Set<string>();
    const usedSource = new Set<string>(t.source_db_id ? [t.source_db_id] : []);
    const steps: any[] = [];
    for (const b of bands) {
        const scored = pool
            .filter(q => !exclude.has(q.id) && diff(q) >= b.lo && diff(q) < b.hi && (sim.statement.get(q.id) ?? 0) <= 0.97)
            .map(q => {
                const qc = concepts(q);
                const ov = [...qc].filter(c => tc.has(c)).length;
                const union = new Set([...qc, ...tc]).size || 1;
                const sStmt = sim.statement.get(q.id) ?? 0;
                const sSol = sim.solution.get(q.id) ?? 0;
                const mid = (b.lo + b.hi - 1) / 2, half = Math.max(1, (b.hi - b.lo) / 2);
                const fit = 1 - Math.min(1, Math.abs(diff(q) - mid) / (half + 1));
                const score = b.wConcept * (2 * ov / union + Math.min(ov, 3) / 3)
                    + b.wSol * 2 * boost(sSol, 0.6) + b.wStmt * 2 * boost(sStmt, 0.6)
                    + 0.5 * fit + (q.subject && q.subject === t.subject ? 0.4 : 0);
                const reasons: string[] = [];
                if (ov) reasons.push(`개념 ${ov}개 겹침`);
                if (sSol >= 0.7) reasons.push('비슷한 풀이');
                if (sStmt >= 0.75) reasons.push('비슷한 문제');
                // 개념도 유사도도 없으면 같은 단원이라도 사다리로 쓰지 않는다
                return { q, score, reasons, ok: ov > 0 || sSol >= 0.7 || sStmt >= 0.75 };
            })
            .filter(x => x.ok)
            .sort((x, y) => y.score - x.score);
        const picks: any[] = [], alternates: any[] = [];
        for (const x of scored) {
            if (used.has(x.q.id)) continue;
            const src = x.q.source_db_id || '';
            const item = { id: x.q.id, difficulty: diff(x.q), reasons: x.reasons, score: Math.round(x.score * 100) / 100 };
            if (picks.length < perStep && !(src && usedSource.has(src))) { picks.push(item); used.add(x.q.id); if (src) usedSource.add(src); }
            else if (alternates.length < ALTERNATES + perStep) alternates.push(item);   // 교체 후보(같은 시험지 것도 후보로는 둔다)
            if (picks.length >= perStep && alternates.length >= ALTERNATES + perStep) break;
        }
        if (picks.length) steps.push({ label: b.label, picks, alternates: alternates.filter(x => !used.has(x.id)).slice(0, ALTERNATES) });
    }
    steps.push({ label: '목표', picks: [{ id: t.id, difficulty: td, reasons: [] }], alternates: [] });

    return NextResponse.json({ success: true, steps, targetDifficulty: td, unit: t.unit, poolSize: pool.length });
}
