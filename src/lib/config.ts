/** Free access ends at midnight Korea time after the stated final day. */
export const PERSONAL_DB_FREE_UNTIL = '2027-05-26';
export function isPersonalDbFree(at = new Date()): boolean {
    return at.getTime() < Date.parse(`${PERSONAL_DB_FREE_UNTIL}T23:59:59.999+09:00`) + 1;
}
export const PERSONAL_DB_FREE_MODE = isPersonalDbFree();
export const FREE_PDF_DAILY_LIMIT = 3;   // 10/8 사용자: 10 → 3 (화면엔 횟수를 미리 쓰지 않고, 넘길 때 서버 안내로 알린다)
export const SAVED_EXAM_LIMIT = 20;
export const EXAM_QUESTION_LIMIT = 50;
// [10/7] 무료 종료일(날짜)은 화면에 쓰지 않는다 — 그 전에 유료화할 수도 있음(사용자 지시). '런칭 기념'으로 통일.
export const FREE_ACCESS_LABEL = '문항 선택·시험지 제작 런칭 기념 무료';
