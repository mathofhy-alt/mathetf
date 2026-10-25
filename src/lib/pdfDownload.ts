'use client';

/**
 * PDF 받기 (2026-10-25) — /api/pdf 에 작업을 걸고, 서버(아이윈브 한글)가 다 만들 때까지 2초마다 확인한 뒤 내려받는다.
 * 30문항 기준 40초 안팎. onStatus 로 화면에 '만드는 중… n초' 를 보여 준다. 4분 넘으면 포기.
 */
export async function downloadPdf(ids: string[], title: string, source: 'predict' | 'print', onStatus?: (text: string) => void): Promise<void> {
    const r = await fetch('/api/pdf', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids, title, source }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok && !(r.status === 429 && j.id)) throw new Error(j.error || 'PDF 요청 실패');
    const id: string = j.id;
    const started = Date.now();
    while (Date.now() - started < 4 * 60_000) {
        await new Promise((ok) => setTimeout(ok, 2000));
        const s = await fetch(`/api/pdf/${id}`, { cache: 'no-store' }).then((x) => x.json()).catch(() => null);
        if (!s) continue;
        if (s.status === 'done' && s.url) {
            const a = document.createElement('a'); a.href = s.url; a.rel = 'noopener';
            document.body.appendChild(a); a.click(); a.remove();
            return;
        }
        if (s.status === 'error') throw new Error(s.error || 'PDF를 만들지 못했습니다.');
        const sec = Math.round((Date.now() - started) / 1000);
        onStatus?.(s.ahead ? `앞에 ${s.ahead}개 기다리는 중… ${sec}초` : `PDF 만드는 중… ${sec}초`);
    }
    throw new Error('PDF가 오래 걸리고 있어요. 잠시 후 다시 시도해 주세요.');
}
