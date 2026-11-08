/**
 * 예상문제 한글은 강사 이용권 전용. 프린트는 유료 묶음도 허용(planBundles에서 판정).
 * 무료 체험은 로고 찍힌 PDF만 제공한다.
 * 대표 "오늘 12시부터" → 10/26(월) 0시(한국 시간)에 저절로 바뀐다. 그 전에는 예전처럼 모두 한글을 받는다.
 * 서버(/api/predict/hwp)와 화면(PredictClient·PrintTransformClient)이 같이 읽는다.
 */
export const HWP_PASS_ONLY_START = '2026-10-26T00:00:00+09:00';
export const hwpPassOnly = (now = Date.now()) => now >= new Date(HWP_PASS_ONLY_START).getTime();
