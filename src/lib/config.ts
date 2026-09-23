/** Free access ends at midnight Korea time after the stated final day. */
export const PERSONAL_DB_FREE_UNTIL = '2027-05-26';
export function isPersonalDbFree(at = new Date()): boolean {
    return at.getTime() < Date.parse(`${PERSONAL_DB_FREE_UNTIL}T23:59:59.999+09:00`) + 1;
}
export const PERSONAL_DB_FREE_MODE = isPersonalDbFree();
export const FREE_PDF_DAILY_LIMIT = 10;
export const SAVED_EXAM_LIMIT = 20;
export const EXAM_QUESTION_LIMIT = 50;
export const FREE_ACCESS_LABEL = `문항 선택·시험지 제작 ${PERSONAL_DB_FREE_UNTIL}까지 무료`;
