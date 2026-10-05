/** 원본 시험지 제보 채택 보상(포인트). 제보 창·운영자 제보 확인 화면·지급 API 가 모두 이 값을 쓴다. */
export const REPORT_REWARD_POINTS = 5000;   // 10/5 사용자 결정(10,000 → 5,000)
export const REPORT_REWARD_LABEL = `${REPORT_REWARD_POINTS.toLocaleString('ko-KR')}P`;

/** 제보받는 가장 이른 시험 연도 — 2022학년도부터 올린다(10/5 사용자 결정). 제보 창 연도 목록·서버 검증이 같이 쓴다. */
export const REPORT_MIN_YEAR = 2022;
