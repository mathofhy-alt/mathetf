'use client';

// [10/23 대표] GA4 핵심 이벤트 — 유입 경로·첫 페이지별로 가입·출제·제보·결제가 얼마나 나오는지 GA 에서 보려고.
//   예전엔 GA 에 시험지출제(qb_*) 이벤트만 있고 가입 이벤트가 없어 채널별 전환을 계산할 수 없었다.
//   운영 도메인에서만 보낸다(로컬·미리보기 배포 숫자가 섞이지 않게). 실패해도 화면 동작에는 영향 없음.
export function gaEvent(name: string, params: Record<string, string | number | undefined> = {}): void {
    try {
        if (typeof window === 'undefined' || !['mathetf.com', 'www.mathetf.com'].includes(window.location.hostname)) return;
        const gtag = (window as any).gtag;
        if (gtag) gtag('event', name, { site: 'mathetf', ...params });
    } catch { /* 분석 실패는 무시 */ }
}
