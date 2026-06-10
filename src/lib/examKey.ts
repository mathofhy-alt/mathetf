/**
 * exam_materials 한 행 → questions.source_db_id 키 생성.
 * questions 의 source_db_id 형식: `{학교}_{연도}_{학기}{중간|기말}_{과목}` (예: 오금고등학교_2025_1학기중간_공통수학1)
 *
 * 내신 중간/기말만 매칭 (모의고사 등은 형식이 달라 null → 호출부에서 표 생략).
 * ※ DB 변경 없이 즉석 매칭용. (검색·결제 등 기존 로직은 건드리지 않음)
 */
export function buildSourceDbId(row: {
    school?: string | null;
    exam_year?: number | string | null;
    semester?: number | string | null;
    exam_type?: string | null;
    subject?: string | null;
}): string | null {
    const et = row.exam_type || '';
    let examPart: string;
    if (et.includes('중간')) examPart = `${row.semester}학기중간`;
    else if (et.includes('기말')) examPart = `${row.semester}학기기말`;
    else return null; // 모의고사·수능 등은 source_db_id 형식이 달라 매칭 생략

    if (!row.school || row.exam_year == null || row.semester == null || !row.subject) return null;
    return `${row.school}_${row.exam_year}_${examPart}_${row.subject}`;
}
