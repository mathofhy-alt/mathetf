import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/server-admin';

/**
 * POST /api/predict/generate
 * body: { school?, grade?, semester?, units: string[], minDifficulty, maxDifficulty, count }
 *
 * 예상문제 세트 생성(메타데이터만 반환 — 문제 이미지는 별도 게이팅 조회).
 * - 학교의 출제 스타일 임베딩 평균 벡터로 코사인 유사한 다른 학교 기출 추출(match_predict).
 * - 학교 문항이 없으면(우리 DB 미보유 학교) 단원/난이도 필터 + 랜덤 폴백.
 * - 출처(source_db_id) 편중 방지(최대 2) + 요청 수량 슬라이스.
 */
function parseEmb(e: any): number[] | null {
    if (!e) return null;
    if (Array.isArray(e)) return e;
    if (typeof e === 'string') { try { return JSON.parse(e); } catch { return null; } }
    return null;
}

export async function POST(req: NextRequest) {
    try {
        const { school, grade, semester, units, minDifficulty, maxDifficulty, count } = await req.json();
        if (!Array.isArray(units) || units.length === 0) {
            return NextResponse.json({ error: '단원을 1개 이상 선택하세요.' }, { status: 400 });
        }
        const min = Number(minDifficulty) || 1;
        const max = Number(maxDifficulty) || 10;
        const want = Math.min(Math.max(Number(count) || 15, 1), 40);
        const supabase = createAdminClient();

        // 1) 학교 출제 스타일 벡터(평균 임베딩)
        let styleVec: number[] | null = null;
        if (school) {
            let sq = supabase.from('questions').select('embedding')
                .eq('school', school).eq('work_status', 'sorted').limit(200);
            if (semester) sq = sq.eq('semester', semester);
            if (grade) sq = sq.eq('grade', grade);
            const { data: srows } = await sq;
            let embs = (srows || []).map((r: any) => parseEmb(r.embedding)).filter(Boolean) as number[][];
            // 범위 내 문항이 없으면 학교 전체로 완화
            if (embs.length === 0) {
                const { data: s2 } = await supabase.from('questions').select('embedding')
                    .eq('school', school).eq('work_status', 'sorted').limit(200);
                embs = (s2 || []).map((r: any) => parseEmb(r.embedding)).filter(Boolean) as number[][];
            }
            if (embs.length) {
                const dim = embs[0].length;
                const avg = new Array(dim).fill(0);
                for (const v of embs) for (let i = 0; i < dim; i++) avg[i] += v[i];
                for (let i = 0; i < dim; i++) avg[i] /= embs.length;
                styleVec = avg;
            }
        }

        // 2) 후보 풀 추출
        let pool: any[] = [];
        if (styleVec) {
            const vecLit = '[' + styleVec.join(',') + ']';
            const { data, error } = await supabase.rpc('match_predict', {
                query_embedding: vecLit,
                target_units: units,
                min_diff: min,
                max_diff: max,
                exclude_school: school || null,
                match_count: Math.min(Math.max(want * 5, 120), 200), // 난이도 골고루 + 타임아웃 방지
            });
            if (error) throw error;
            pool = data || [];
        } else {
            // 폴백: 단원/난이도 필터 + 셔플
            const diffs: string[] = [];
            for (let d = min; d <= max; d++) diffs.push(String(d));
            let q = supabase.from('questions')
                .select('id, unit, difficulty, subject, grade, school, year, semester, question_number, source_db_id, key_concepts')
                .eq('work_status', 'sorted').in('unit', units).in('difficulty', diffs);
            if (school) q = q.neq('school', school);
            const { data } = await q.limit(Math.max(want * 12, 300));
            pool = data || [];
            for (let i = pool.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [pool[i], pool[j]] = [pool[j], pool[i]];
            }
        }

        // 3) 난이도 골고루(스트라티파이드) + 출처 편중 방지(최대 2)
        //    pool 은 (스타일 경로면) 유사도순. 난이도별로 묶어 라운드로빈 → 1~6 고르게 나옴.
        const byDiff: Record<string, any[]> = {};
        for (const q of pool) { const d = String(q.difficulty); (byDiff[d] = byDiff[d] || []).push(q); }
        const levels = Object.keys(byDiff).map(Number).filter((d) => d >= min && d <= max).sort((a, b) => a - b).map(String);

        const perSource: Record<string, number> = {};
        const pickedIds = new Set<string>();
        const picked: any[] = [];
        if (levels.length) {
            const cursor: Record<string, number> = {};
            levels.forEach((l) => (cursor[l] = 0));
            let progress = true;
            while (picked.length < want && progress) {
                progress = false;
                for (const l of levels) {
                    if (picked.length >= want) break;
                    const arr = byDiff[l];
                    let i = cursor[l];
                    while (i < arr.length) {
                        const q = arr[i]; i++;
                        if (pickedIds.has(q.id)) continue;
                        const s = q.source_db_id || '?';
                        if ((perSource[s] || 0) >= 2) continue;
                        picked.push(q); pickedIds.add(q.id); perSource[s] = (perSource[s] || 0) + 1;
                        progress = true; break;
                    }
                    cursor[l] = i;
                }
            }
        }
        // 부족분: 편중 제한 풀고 풀 순서대로 채움
        if (picked.length < want) {
            for (const q of pool) {
                if (pickedIds.has(q.id)) continue;
                picked.push(q); pickedIds.add(q.id);
                if (picked.length >= want) break;
            }
        }
        // 쉬움 → 어려움 순으로 정렬해서 시험지답게
        picked.sort((a, b) => (Number(a.difficulty) || 0) - (Number(b.difficulty) || 0));

        return NextResponse.json({
            questions: picked.slice(0, want),
            styleUsed: !!styleVec,
            poolSize: pool.length,
        });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
