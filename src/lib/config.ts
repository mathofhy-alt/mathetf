import { QB_PASS, FREE_TRIAL, PASS_SHEET, PASS_EXAM, QB_LIMITS, BUNDLE_KEEP_DAYS } from './qbPassConfig';
/** Free access ends at midnight Korea time after the stated final day. */
export const PERSONAL_DB_FREE_UNTIL = '2027-05-26';
export function isPersonalDbFree(at = new Date()): boolean {
    return at.getTime() < Date.parse(`${PERSONAL_DB_FREE_UNTIL}T23:59:59.999+09:00`) + 1;
}
export const PERSONAL_DB_FREE_MODE = isPersonalDbFree();
export const FREE_PDF_DAILY_LIMIT = 3;   // 10/7 사용자: 10 → 3
// [10/16 대표 결정] 30일 상한 20건 — 60일 실측: 818명 중 34명(4%)만 걸리고 그들이 다운로드의 21%, 결제자는 108명 중 6명만 걸림
export const FREE_PDF_MONTHLY_LIMIT = 20;
export const FREE_PDF_MONTH_DAYS = 30;
export const SAVED_EXAM_LIMIT = QB_LIMITS.free.saved;
export const EXAM_QUESTION_LIMIT = QB_LIMITS.free.questions;   // 시험지 무료·1장권 최대 50문항 (프린트·예상은 별도 30문항)
// [10/7] 날짜(무료 종료일)는 화면에 쓰지 않는다 — 그 전에 유료화할 수도 있음(사용자 지시)
// [10/7 브랜치] 시험지 만들기 이용권 — 문구도 숫자를 따라간다(lib/qbPassConfig)
export const FREE_ACCESS_LABEL = `문항 고르기는 무료이고, 시험지는 무료 주 ${FREE_TRIAL.exam}회(월요일 0시 리셋)·${QB_LIMITS.free.questions}문항·한글/PDF로 만들 수 있고, 시험지 1장권 ${PASS_SHEET.price.toLocaleString('ko-KR')}원은 구매 후 ${PASS_SHEET.days}일 안에 쓸 수 있어요. 저장한 시험지는 보관함에서 추가 차감 없이 다시 받을 수 있어요. 프린트 변형은 평생 ${FREE_TRIAL.bundle}건 무료 체험이에요. 1회권은 프린트 변형 1건 전용이에요. 시험대비권 ${PASS_EXAM.price.toLocaleString('ko-KR')}원/${PASS_EXAM.days}일은 시험지 만들기·프린트 변형 합쳐 ${PASS_EXAM.bundles}건 · 한글/PDF · ${BUNDLE_KEEP_DAYS}일 다시 받기 · 예상문제 제한 없음이에요. 시험지는 주 무료 ${FREE_TRIAL.exam}회 → 시험대비권 → 시험지 1장권 순서로 사용해요. 예상문제는 무료 하루 ${FREE_TRIAL.predictDaily}회·주 ${FREE_TRIAL.predictWeekly}회(한국 시간, 월요일 0시 시작)이며, 기간 중인 시험대비권·강사 이용권 회원은 횟수 제한이 없어요. 프린트 1회권·시험지 1장권은 예상문제 무제한에 해당하지 않아요.`;
