import { QB_PASS } from './qbPassConfig';
/** Free access ends at midnight Korea time after the stated final day. */
export const PERSONAL_DB_FREE_UNTIL = '2027-05-26';
export function isPersonalDbFree(at = new Date()): boolean {
    return at.getTime() < Date.parse(`${PERSONAL_DB_FREE_UNTIL}T23:59:59.999+09:00`) + 1;
}
export const PERSONAL_DB_FREE_MODE = isPersonalDbFree();
export const FREE_PDF_DAILY_LIMIT = 3;   // 10/7 사용자: 10 → 3
export const SAVED_EXAM_LIMIT = 20;
export const EXAM_QUESTION_LIMIT = 50;
// [10/7] 날짜(무료 종료일)는 화면에 쓰지 않는다 — 그 전에 유료화할 수도 있음(사용자 지시)
// [10/7 브랜치] 시험지 만들기 이용권 — 문구도 숫자를 따라간다(lib/qbPassConfig)
export const FREE_ACCESS_LABEL = `문항 고르기는 무료, 시험지 만들기는 한 주 ${QB_PASS.freePerWeek}회까지 무료예요. 더 만들려면 ${QB_PASS.days}일 이용권(${QB_PASS.price.toLocaleString()}원).`;
