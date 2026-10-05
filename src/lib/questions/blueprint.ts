import { createAdminClient } from '@/utils/supabase/server-admin';
import { resolveScope, toScopeRule, type CatalogDb } from './scope';
import { NOT_A_SCHOOL } from '@/lib/stats';

/**
 * [10/5] 실제 시험 한 회차의 구성(문항 수·문항별 단원·난이도·객관식/서술형)을 그대로 따라
 * 다른 학교 기출로 채운 연습 시험지. 기출 없는 학교 페이지(NEIS)의 '연습 시험지' 버튼이 쓴다.
 * 누를 때마다 같은 구성의 다른 문항이 나온다(동점 후보는 섞어서 고른다).
 */
type Q = { id: string; school: string | null; question_number: number; unit: string | null; difficulty: number | null; question_type: string | null; subject: string | null };
const COLS = 'id,question_number,subject,grade,school,year,semester,difficulty,key_concepts,unit,work_status,source_db_id,question_type,is_off_curriculum';

async function candidates(scope: unknown[], excluded: string[], subject?: string): Promise<Q[]> {
    const sb = createAdminClient();
    const out: Q[] = [];
    for (let from = 0; from < 20000; from += 1000) {
        let q = sb.rpc('question_bank_candidates', { p_scope: scope, p_excluded: excluded }).select(COLS).eq('is_off_curriculum', false);
        if (subject) q = q.eq('subject', subject);
        const { data, error } = await q.order('id').range(from, from + 999);
        if (error) throw error;
        const rows = (Array.isArray(data) ? data : []) as Q[];
        out.push(...rows);
        if (rows.length < 1000) break;
    }
    return out;
}

export async function buildBlueprintExam(catalog: CatalogDb[], blueprintId: string, poolDbIds: string[], subject?: string) {
    const bp = catalog.find(d => d.id === blueprintId && !d.availability);
    if (!bp) throw new Error('기준 시험지를 찾지 못했습니다.');
    const base = (await candidates([toScopeRule(bp)], [])).sort((a, b) => a.question_number - b.question_number);
    if (!base.length) throw new Error('기준 시험지의 문항 정보가 아직 준비되지 않았습니다.');
    // 내신 연습이라 학교 중간·기말 기출로만 채운다 — 모의고사·수능·사관·경찰대 문항이 섞이던 것(10/5 확인)
    const naesin = (d: CatalogDb | undefined) => !!d && ['중간고사', '기말고사'].includes(d.exam_type || '') && !NOT_A_SCHOOL.has(d.school || '');
    const byId = new Map(catalog.map(d => [d.id, d]));
    const poolScope = resolveScope(catalog, poolDbIds.filter(id => id !== bp.id && naesin(byId.get(id))));
    const pool = (poolScope.length ? await candidates(poolScope, base.map(q => q.id), subject || bp.subject || undefined) : [])
        .filter(q => !NOT_A_SCHOOL.has(q.school || ''));
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }

    // 문항마다: 같은 단원 > 같은 유형(객관식·서술형) > 난이도 차이 작은 순. 한 번 쓴 문항은 다시 안 쓴다.
    const used = new Set<string>();
    const picked: Q[] = [];
    let exactUnit = 0;
    for (const b of base) {
        let best: Q | null = null, bestCost = Infinity;
        for (const c of pool) {
            if (used.has(c.id)) continue;
            const cost = (c.unit === b.unit ? 0 : 100) + (c.question_type === b.question_type ? 0 : 10)
                + Math.abs((c.difficulty ?? 5) - (b.difficulty ?? 5));
            if (cost < bestCost) { best = c; bestCost = cost; if (cost === 0) break; }
        }
        if (!best) break;
        used.add(best.id); picked.push(best);
        if (best.unit === b.unit) exactUnit++;
    }
    return { blueprint: bp, questions: picked, baseCount: base.length, exactUnit };
}
