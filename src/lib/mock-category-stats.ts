import { createAdminClient } from '@/utils/supabase/server-admin';

/**
 * 모의고사 카테고리(사관학교·경찰대·전국연합) 페이지에 실을 실측 분석.
 *
 * [왜 — 2026-08-29 실측]
 * 네이버 서치어드바이저 7일: '사관학교 기출' 노출 273 · 클릭 4 · CTR 1.5%.
 * 우리 유기 순위가 12등(2페이지)이다. 다른 검색어는 CTR 20~75% 인데 여기만 1.5% 인 이유가 순위다.
 * 키워드도구 월 검색량: 사관학교기출 6,650 · 사관학교1차시험 1,630 · 사관학교기출문제 1,180 · 경찰대기출 860.
 * 우리가 가진 단일 키워드 중 수요가 가장 크고, 사관·경찰대 5개년은 경쟁사(내신판)에 아예 없다.
 * 그런데 /mock/사관학교 페이지 본문이 981자로 사이트에서 제일 얇았다.
 *
 * ※ 순위가 오른다는 보장은 못 한다. 네이버 웹문서 순위 기준은 공개된 게 거의 없다.
 *   확실한 건 이 페이지가 우리 기준으로도 제일 얇았다는 것뿐이다.
 *
 * [무엇을 싣나]
 * 전부 우리가 분류한 데이터다 — 연도별 문항수·과목 분포·단원 분포·난이도.
 * 문제 원문이 아니라 우리 분류 통계라 저작권 문제가 없다.
 * (8/29 발문 노출 건과 성격이 정반대다. lib/subject-hub.ts 주석 참고)
 */

/** 카테고리 이름 → questions.school 값 */
const SCHOOL_OF: Record<string, string> = {
    '사관학교': '사관학교',
    '경찰대': '경찰대학교',
    '전국연합': '전국연합',
};

export type MockStats = {
    total: number;
    years: { year: string; count: number }[];
    bySubject: { subject: string; count: number }[];
    byUnit: { unit: string; count: number }[];
    avgDifficulty: number;
    easy: number; mid: number; hard: number;
};

const PAGE = 1000;

export async function getMockCategoryStats(category: string): Promise<MockStats | null> {
    const school = SCHOOL_OF[category];
    if (!school) return null;
    const supabase = createAdminClient();

    try {
        // ⚠ PostgREST 는 한 요청에 1,000행만 준다. 전국연합은 3,464문항이라 range 로 훑는다.
        const rows: any[] = [];
        for (let from = 0; from < 20000; from += PAGE) {
            const { data, error } = await supabase
                .from('questions')
                .select('subject, unit, difficulty, year')
                .eq('work_status', 'sorted')
                .eq('school', school)
                .range(from, from + PAGE - 1);
            if (error) throw error;
            const got = data || [];
            rows.push(...got);
            if (got.length < PAGE) break;
        }
        if (rows.length === 0) return null;

        const yearMap: Record<string, number> = {};
        const subjMap: Record<string, number> = {};
        const unitMap: Record<string, number> = {};
        let sum = 0, n = 0, easy = 0, mid = 0, hard = 0;

        for (const q of rows) {
            const y = String(q.year ?? '');
            if (y) yearMap[y] = (yearMap[y] || 0) + 1;
            if (q.subject) subjMap[q.subject] = (subjMap[q.subject] || 0) + 1;
            if (q.unit) unitMap[q.unit] = (unitMap[q.unit] || 0) + 1;
            const d = Number(q.difficulty) || 0;
            if (d > 0) { sum += d; n++; }
            // exam 상세·과목 허브와 같은 구간 보정
            if (d <= 2) easy++; else if (d <= 4) mid++; else hard++;
        }

        return {
            total: rows.length,
            years: Object.entries(yearMap).map(([year, count]) => ({ year, count }))
                .sort((a, b) => b.year.localeCompare(a.year)),
            bySubject: Object.entries(subjMap).map(([subject, count]) => ({ subject, count }))
                .sort((a, b) => b.count - a.count),
            byUnit: Object.entries(unitMap).map(([unit, count]) => ({ unit, count }))
                .sort((a, b) => b.count - a.count).slice(0, 12),
            avgDifficulty: n > 0 ? sum / n : 0,
            easy, mid, hard,
        };
    } catch (e) {
        console.error('[getMockCategoryStats]', category, e);
        return null;
    }
}
