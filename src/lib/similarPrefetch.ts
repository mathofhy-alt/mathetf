'use client';

/**
 * 유사문항 결과 미리 받기 (2026-10-01).
 * '유사' 버튼에 마우스를 올리거나 손가락을 대는 순간 요청을 시작해 두고,
 * 모달이 열리면 같은 요청을 이어받는다. 같은 문항을 다시 열 때도 다시 받지 않는다.
 * 실패한 요청은 지워서 다음에 다시 시도하게 한다.
 */

export type SimilarResult = { ok: boolean; json: any };

const metaCache = new Map<string, Promise<SimilarResult>>();
const imageCache = new Map<string, Promise<Record<string, any[]>>>();
const MAX_ENTRIES = 60;

function remember<T>(map: Map<string, Promise<T>>, key: string, make: () => Promise<T>, keep: (v: T) => boolean): Promise<T> {
    const hit = map.get(key);
    if (hit) return hit;
    const p = make().then(v => { if (!keep(v)) map.delete(key); return v; }, e => { map.delete(key); throw e; });
    map.set(key, p);
    if (map.size > MAX_ENTRIES) map.delete(map.keys().next().value as string);
    return p;
}

export const DEFAULT_SIMILAR_BASIS: 'statement' | 'solution' = 'statement';

export function fetchSimilarMeta(id: string, basis: 'statement' | 'solution' = DEFAULT_SIMILAR_BASIS): Promise<SimilarResult> {
    return remember(metaCache, `${id}|${basis}`,
        () => fetch(`/api/pro/similar-questions?id=${id}&limit=10&meta=1&basis=${basis}`)
            .then(async r => ({ ok: r.ok, json: await r.json().catch(() => ({})) })),
        v => v.ok && v.json?.success);
}

export function fetchSimilarImages(ids: string[]): Promise<Record<string, any[]>> {
    if (ids.length === 0) return Promise.resolve({});
    return remember(imageCache, ids.join(','),
        () => fetch('/api/questions/images', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }) })
            .then(async r => { const j = await r.json(); if (!r.ok || !j.success) throw new Error('이미지 요청 실패'); return j.images || {}; }),
        () => true);
}

/** 버튼에 올리거나 누르기 시작할 때 부른다. 결과와 그 이미지까지 미리 받아 둔다. */
export function prefetchSimilar(id: string | undefined, basis: 'statement' | 'solution' = DEFAULT_SIMILAR_BASIS) {
    if (!id) return;
    fetchSimilarMeta(id, basis)
        .then(({ ok, json }) => { if (ok && json?.success) fetchSimilarImages((json.data || []).map((q: any) => q.id)).catch(() => { }); })
        .catch(() => { });
}
