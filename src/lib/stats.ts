import { createAdminClient } from '@/utils/supabase/server-admin';

/**
 * 사이트 규모 통계 (기출 문항 수 · 기출 보유 학교 수).
 *
 * ⚠ PostgREST 는 한 요청에 최대 1,000행만 준다. `.limit(5000)` 을 써도 1,000행에서 잘린다.
 *   그걸 모르고 "받아온 행에서 학교를 세는" 코드가 두 군데 있었고, 실제와 크게 어긋났다(2026-08-29 발견).
 *     /api/questions/facets : questions 14,394행 중 1,000행만 보고 → **학교 8개**로 표시 (실제 121)
 *     /teacher              : exam_materials 1,565행 중 1,000행만 보고 → 학교 120개 (실제 121)
 *   시험지 출제 도구 첫 화면이 "학교 기출 8" 이라고 띄우고 있었다. 강사를 설득해야 할 자리다.
 *   → 세는 일은 전부 여기로 모으고, 반드시 range 로 끝까지 훑는다.
 *
 * 학교 수는 questions 가 아니라 exam_materials 를 센다. 행이 1/9 수준(1,565 vs 14,394)이라
 * 요청이 2번이면 끝나고, '기출 보유 학교' 라는 표현에도 그쪽이 맞다.
 */

// 학교가 아니라 시험 종류. '기출 보유 학교' 수에 넣으면 안 된다.
const NOT_A_SCHOOL = new Set(['경찰대학교', '사관학교', '전국연합', '평가원', '수능', 'DELETED']);

const PAGE = 1000;

export type SiteStats = { questionCount: number; schoolCount: number; topSchools: string[] };

export async function getSiteStats(): Promise<SiteStats> {
    const supabase = createAdminClient();
    const empty: SiteStats = { questionCount: 0, schoolCount: 0, topSchools: [] };

    try {
        const { count } = await supabase
            .from('questions')
            .select('id', { count: 'exact', head: true })
            .eq('work_status', 'sorted');

        // range 로 끝까지. 1,565행이면 2번이면 끝난다.
        const bySchool: Record<string, number> = {};
        for (let from = 0; from < 20000; from += PAGE) {
            const { data, error } = await supabase
                .from('exam_materials')
                .select('school')
                .neq('school', 'DELETED')
                .range(from, from + PAGE - 1);
            if (error) throw error;
            const rows = data || [];
            for (const m of rows as any[]) {
                if (m.school && !NOT_A_SCHOOL.has(m.school)) {
                    bySchool[m.school] = (bySchool[m.school] || 0) + 1;
                }
            }
            if (rows.length < PAGE) break;
        }

        return {
            questionCount: count ?? 0,
            schoolCount: Object.keys(bySchool).length,
            topSchools: Object.entries(bySchool)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 12)
                .map(([s]) => s),
        };
    } catch (e) {
        console.error('[getSiteStats]', e);
        return empty;
    }
}
