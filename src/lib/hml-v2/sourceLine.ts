/**
 * [11/11 대표] 시험지 만들기 「출처 표시」 — 문항마다 문제 바로 위에 번호 없는 [출처] 줄.
 *   서식은 10/31 대표 확정(scratch/predict-hml-src.ts): 출처 문단은 CHOICE 서식(번호 없음)으로 맨 앞,
 *   번호는 문제 첫 문단(QUESTION). 원래 QUESTION 문단이 없으면 첫 문단을 QUESTION 으로 바꾼다.
 *   ⚠ question_number 를 시험지 번호로 덮어쓰기 '전에' 불러야 원본 번호가 들어간다.
 */
type Src = { source_db_id?: string | null; school?: string | null; year?: string | number | null; grade?: string | null;
    semester?: string | null; subject?: string | null; question_number?: number | string | null };

const MOCK = new Set(['전국연합', '평가원', '수능']);
const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function sourceLabel(q: Src): string {
    const no = q.question_number != null && String(q.question_number).trim() ? ` ${q.question_number}번` : '';
    const school = String(q.school || '').trim();
    const year = Number(q.year);
    const month = String(q.semester || '').replace(/\s*모의고사$/, '').trim();   // '11월 모의고사' → '11월'
    if (MOCK.has(school) && year) {
        // 선택과목 회차면 과목을 붙인다(공통·전과목은 생략): 수능_2025_11월 모의고사_확률과 통계 → '확률과 통계'
        const tail = String(q.source_db_id || '').split('_').slice(3).join(' ').trim();
        const subj = tail && !/공통|전과목/.test(tail) ? ` ${tail}` : '';
        // DB 연도 = 시행 연도. 수능·평가원은 학년도(시행 연도+1)로 부른다 — 2025년 11월 수능 = 2026학년도 수능
        if (school === '수능') return `[출처] ${year + 1}학년도 수능${subj}${no}`;
        if (school === '평가원') return `[출처] ${year + 1}학년도 ${month} 평가원${subj}${no}`;
        return `[출처] ${year} ${q.grade || ''} ${month} 전국연합${subj}${no}`.replace(/\s+/g, ' ');
    }
    // 학교 기출: 방산고등학교_2023_2학기기말_수학II → 방산고등학교 2023 2학기 기말 수학II / 교재: 'A > B > C' → 'A B C'
    const raw = String(q.source_db_id || school || '').trim();
    const text = raw.replace(/\s*>\s*/g, ' ').replace(/_/g, ' ').replace(/학기(중간|기말)/, '학기 $1').replace(/\s+/g, ' ').trim();
    return text ? `[출처] ${text}${no}` : '';
}

export function withSourceLine(contentXml: string, q: Src): string {
    const label = sourceLabel(q);
    const i = contentXml.search(/<P[\s>]/);   // <PICTURE 등은 건너뛴다
    if (!label || i < 0) return contentXml;
    let body = contentXml.slice(i);
    if (!/data-hml-style="QUESTION"/.test(body))
        body = body.replace(/^<P\b[^>]*>/, (tag: string) => tag.replace(/\sdata-hml-style="[^"]*"/, '').replace(/>$/, ' data-hml-style="QUESTION">'));
    return contentXml.slice(0, i) + `<P data-hml-style="CHOICE"><TEXT><CHAR>${esc(label)}</CHAR></TEXT></P>` + body;
}
