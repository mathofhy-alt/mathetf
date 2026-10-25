/**
 * [2026-10-25 대표] 예상문제·프린트변형의 한글(HWP)은 이용권 회원만 — 무료 회원은 로고 찍힌 PDF.
 * 대표 "오늘 12시부터" → 10/26(월) 0시(한국 시간)에 저절로 바뀐다. 그 전에는 예전처럼 모두 한글을 받는다.
 * 서버(/api/predict/hwp)와 화면(PredictClient·PrintTransformClient)이 같이 읽는다.
 */
export const HWP_PASS_ONLY_START = '2026-10-26T00:00:00+09:00';
export const hwpPassOnly = (now = Date.now()) => now >= new Date(HWP_PASS_ONLY_START).getTime();
