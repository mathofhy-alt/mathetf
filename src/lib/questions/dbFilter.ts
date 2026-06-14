/**
 * 선택된 DB(exam_materials 메타데이터) 목록을 questions 검색용 PostgREST .or() 조건으로 변환.
 *
 * 이전엔 이 로직이 search/facets/FilterSidebar 등에 복붙돼 있다가 서로 갈라져서
 * (모의고사 분기 누락 등) 사이드바 필터와 검색결과가 어긋나는 버그가 있었음.
 * → 단일 소스로 통합. search 와 facets 가 모두 이 함수를 사용.
 *
 * 보안: school/subject 등 값은 클라이언트가 보낸 것이므로, PostgREST 특수문자를
 *       이스케이프(이중따옴표 + 백슬래시)해 .or() 구문 인젝션을 방지.
 */

const MOCK_SELECT_SUBJECTS = ['기하와벡터', '미적분II', '확률과통계', '확률과 통계'];

// PostgREST 필터 값 이스케이프: 특수문자(쉼표/괄호/점/따옴표)가 포함돼도 안전하게.
function quoteVal(v: unknown): string {
    const s = String(v ?? '');
    return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

export interface DbDescriptor {
    school?: string;
    grade?: string | number;
    year?: string | number;
    exam_year?: string | number;
    semester?: string | number;
    exam_type?: string;
    subject?: string;
    title?: string;
}

/**
 * 각 DB를 `and(school.eq.."..",grade.eq.."..",...)` 형태 문자열로 변환한 배열 반환.
 * 호출 측에서 `query.or(result.join(','))` 로 사용.
 */
export function buildDbOrConditions(selectedDbs: DbDescriptor[]): string[] {
    return (selectedDbs || []).map((db) => {
        let gradeVal: string | number | undefined = db.grade;
        if (db.grade && ['1', '2', '3'].includes(String(db.grade).replace('고', ''))) {
            gradeVal = `고${String(db.grade).replace('고', '')}`;
        }

        const titleYear = db.title?.match(/20\d{2}/)?.[0];
        const yearVal = titleYear ? titleYear : (db.exam_year || db.year);

        const parts: string[] = [`school.eq.${quoteVal(db.school)}`];
        if (gradeVal) parts.push(`grade.eq.${quoteVal(gradeVal)}`);
        if (yearVal) parts.push(`year.eq.${quoteVal(yearVal)}`);

        if (db.exam_type === '입학시험') {
            // 사관학교·경찰대 입학시험: semester 가 '입학시험' (월/학기 아님)
            parts.push(`semester.eq.${quoteVal('입학시험')}`);
        } else if (db.exam_type === '모의고사' || db.exam_type === '수능') {
            // 모의고사/수능: semester 가 '월' 단위
            parts.push(`semester.in.(${quoteVal(`${db.semester}월`)},${quoteVal(`${db.semester}월 모의고사`)})`);
        } else if (db.semester && db.exam_type) {
            const semNum = String(db.semester).replace('학기', '');
            const typeShort = db.exam_type.includes('중간') ? '중간' : (db.exam_type.includes('기말') ? '기말' : '');
            if (typeShort) parts.push(`semester.eq.${quoteVal(`${semNum}학기${typeShort}`)}`);
        } else if (db.semester) {
            const semNum = String(db.semester).replace('학기', '').replace(/[^0-9]/g, '');
            if (semNum) parts.push(`semester.ilike.${quoteVal(`${semNum}학기%`)}`);
        }

        if (db.subject && db.subject !== '전과정') {
            // 모의고사·수능·입학시험(사관/경찰대) 의 선택과목 DB는 공통(대수/미적분I)을 함께 끌어온다.
            const isMockSelect = (db.exam_type === '모의고사' || db.exam_type === '수능' || db.exam_type === '입학시험')
                && MOCK_SELECT_SUBJECTS.includes(db.subject);
            if (isMockSelect) {
                // 선택과목 DB: 공통(대수/미적분I) + 선택과목 함께 조회 (1~22 공통 + 23~30 선택)
                parts.push(`subject.in.(${quoteVal('대수')},${quoteVal('미적분I')},${quoteVal(db.subject)})`);
            } else {
                parts.push(`subject.eq.${quoteVal(db.subject)}`);
            }
        }

        return `and(${parts.join(',')})`;
    });
}
