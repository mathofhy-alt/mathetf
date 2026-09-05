/**
 * [익명 구간 계측] 로그인 전 행동을 세션당 1회만 남긴다.
 *
 * 왜: /api/log/feature 가 비로그인이면 401 이라 **로그인 전 행동이 한 건도 없었다.**
 *     방문자 수는 Vercel 로 알지만, 그 사람들이 무엇을 보고 어디서 돌아섰는지 몰라서
 *     '가입 화면이 문제인가, 거기까지 오지도 않는가'를 구분할 수 없었다.
 *
 * 세션당 1회 규칙은 시험지출제 퍼널(qb_*)과 같다 — 같은 사람이 새로고침을 반복해도
 * 인원 집계가 부풀지 않아야 단계별 이탈률을 읽을 수 있다.
 * sessionStorage 를 쓰므로 탭을 닫으면 다시 1회 기록된다(방문 단위 집계).
 */
export type AnonEvent = 'anon_cta_view' | 'anon_cta_click' | 'signup_start';

export function logAnon(feature: AnonEvent, title?: string | null) {
    if (typeof window === 'undefined') return;
    const key = `mathetf_anon_${feature}`;
    try {
        if (sessionStorage.getItem(key)) return;
        sessionStorage.setItem(key, '1');
    } catch {
        // 사파리 프라이빗 모드 등에서 sessionStorage 가 던진다 — 그때는 중복을 감수하고 보낸다.
    }
    fetch('/api/log/feature', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feature, title: title ? String(title).slice(0, 200) : null }),
        keepalive: true,   // 클릭 직후 페이지가 넘어가도 요청이 살아남게
    }).catch(() => { });
}
