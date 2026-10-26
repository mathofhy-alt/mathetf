/**
 * 프린트변형 「원본 문항」 찾기 (10/26 대표 — 회원 건의: 학교 프린트의 학력평가 문제는 원본·풀이를 먼저 주고 유사문제를 더하자).
 * 크롭 받아쓰기(verbatim)와 기출 발문(해설 뺀 content_xml)을 숫자 묶음·한글 3글자 묶음으로 양방향 비교(Dice)한다.
 * 10/25 시험: 원본 12개는 숫자 1.0·글자 0.917 이상으로 전부 1위, DB 에 없는 숫자 변형 10개는 숫자 최고 0.846·글자 0.98~1.0.
 *   → 원본 = 숫자 0.9↑ + 글자 0.85↑ / 같은 틀(숫자만 바뀐 기출) = 글자 0.9↑ 인데 숫자는 원본 기준 미달.
 */
const NUM = /\d+(?:\.\d+)?/g;

type Bag = Map<string, number>;
const bag = (items: string[]): Bag => {
    const m: Bag = new Map();
    for (const x of items) m.set(x, (m.get(x) || 0) + 1);
    return m;
};
const size = (b: Bag) => { let n = 0; b.forEach((v) => { n += v; }); return n; };
function dice(a: Bag, b: Bag): number {
    let common = 0;
    a.forEach((v, k) => { common += Math.min(v, b.get(k) || 0); });
    const total = size(a) + size(b);
    return total ? (2 * common) / total : 0;
}
const nums = (t: string) => bag(t.match(NUM) || []);
const grams = (t: string) => {
    const h = t.replace(/[^가-힣]/g, '');
    const out: string[] = [];
    for (let i = 0; i + 3 <= h.length; i++) out.push(h.slice(i, i + 3));
    return bag(out);
};

const unescape = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

/** content_xml 에서 해설(ENDNOTE)을 뺀 발문 — 수식(SCRIPT)은 숫자 비교에 필요해서 남긴다 */
export function stemOf(xml: string): string {
    const s = (xml || '').replace(/<ENDNOTE\b[\s\S]*?<\/ENDNOTE>/gi, '');
    const withEq = s.replace(/<EQUATION\b[\s\S]*?<SCRIPT>([\s\S]*?)<\/SCRIPT>[\s\S]*?<\/EQUATION>/gi, (_, m) => ` ${m} `);
    return unescape(withEq.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

export type OriginalKind = 'original' | 'sameFrame';
export interface OriginalHit { id: string; kind: OriginalKind; numScore: number; textScore: number }

/** 후보 발문들 중 원본 1개(있으면)와 같은 틀(숫자 변형) 최대 2개 */
export function findOriginals(verbatim: string, stems: { id: string; stem: string }[]): OriginalHit[] {
    if (!verbatim || verbatim.length < 10) return [];
    const nv = nums(verbatim), gv = grams(verbatim);
    // 글이 거의 없는 계산 문제(「…의 값은? ①…」)는 글자 비교가 무의미 → 숫자만, 대신 더 엄격하게(숫자 6개 이상·0.95↑)
    const shortText = size(gv) < 5;
    if (shortText && size(nv) < 6) return [];
    const scored = stems.map(({ id, stem }) => ({ id, numScore: dice(nv, nums(stem)), textScore: shortText ? 0 : dice(gv, grams(stem)) }))
        .sort((a, b) => (b.numScore + b.textScore) - (a.numScore + a.textScore));
    const out: OriginalHit[] = [];
    const orig = scored.find((s) => shortText ? s.numScore >= 0.95 : s.numScore >= 0.9 && s.textScore >= 0.85);
    if (orig) out.push({ ...orig, kind: 'original' });
    if (shortText) return out;   // 숫자만 다른 짧은 계산 문제는 '같은 틀'을 가릴 근거가 없다
    for (const s of scored) {
        if (out.filter((x) => x.kind === 'sameFrame').length >= 2) break;
        if (s.id === orig?.id) continue;
        // 글이 충분히 길고(짧은 상투 발문끼리 겹치는 것 방지) 숫자도 일부는 겹쳐야 같은 틀(10/25 숫자 변형 10개: 숫자 0.36~0.85)
        if (s.textScore >= 0.9 && s.numScore >= 0.3 && size(gv) >= 12) out.push({ ...s, kind: 'sameFrame' });
    }
    return out;
}

/** 단원 전체 발문 [id, 글(수식 없음), 수식 숫자] 중 받아쓰기와 가까운 순 n개 id — 숫자 대조 전 1차 거르기.
 *  글이 있으면 한글 3글자 겹침, 글이 거의 없으면 숫자 겹침으로 고른다. */
export function screen(verbatim: string, pool: [string, string, string?][], n: number): string[] {
    const gv = grams(verbatim), nv = nums(verbatim);
    const byText = size(gv) >= 5;
    if (!byText && size(nv) < 6) return [];
    return pool.map(([id, text, ns]) => ({ id, s: byText ? dice(gv, grams(text || '')) : dice(nv, bag((ns || '').split(' ').filter(Boolean))) }))
        .filter((x) => x.s >= (byText ? 0.5 : 0.6))
        .sort((a, b) => b.s - a.s).slice(0, n).map((x) => x.id);
}
