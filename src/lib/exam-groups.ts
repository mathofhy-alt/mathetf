// 시험(회차) 그룹핑 단일 소스.
// /schools 목록의 '기출 N개'와 /school/[schoolName] 상세의 '총 N개'가
// 서로 다른 방식(해설 PDF 행수 vs 그룹수)으로 세면서 어긋나던 것을 통일한다.
// 시험 하나 = 같은 연도·학년·학기·시험종류·과목의 파일 묶음.

export interface ExamGroupSource {
    title?: string | null;
    exam_year?: number | string | null;
    grade?: number | string | null;
    semester?: number | string | null;
    exam_type?: string | null;
    subject?: string | null;
}

// 연도: 제목의 20xx 우선, 없으면 exam_year (school 상세 페이지와 동일 규칙)
export function examYearOf(item: ExamGroupSource): number {
    const titleYear = item.title?.match(/20\d{2}/)?.[0];
    return titleYear ? parseInt(titleYear) : Number(item.exam_year || 2024);
}

export function examGroupKey(item: ExamGroupSource): string {
    return `${examYearOf(item)}-${item.grade}-${item.semester}-${item.exam_type}-${item.subject || ''}`;
}

// 학교별 시험(그룹) 수 집계
export function countExamGroupsBySchool(rows: (ExamGroupSource & { school?: string | null })[]): Record<string, number> {
    const perSchool: Record<string, Set<string>> = {};
    for (const r of rows) {
        if (!r.school) continue;
        (perSchool[r.school] = perSchool[r.school] || new Set()).add(examGroupKey(r));
    }
    return Object.fromEntries(Object.entries(perSchool).map(([s, set]) => [s, set.size]));
}
