/**
 * 프린트 변형 「음절 순서 찾기」 (11/5 대표 — 시험지 만들기에서 한 글자씩 키워드로 찾으면 거의 바로 뜬다, 안 찾아지면 음절을 몇 개 지우고 다시).
 * DB 발문(question_statement)은 수식이 빠져 '인 실수 에 대하여'처럼 토막 나 있어 구절로는 못 찾는다.
 * 받아쓴 원문의 한글을 순서대로 맞춰 보고, 몇 음절이 달라도(교재가 문장을 바꾼 경우) 잡도록 최장 공통 부분수열로 잰다.
 * 실측(11/5, 교재·시험지 22문제): 출처 있는 9문제 모두 6위 안, 임베딩 방식이 놓친 원본 2개를 찾음.
 */
const NOT_HANGUL = /[^가-힣]/g;

/** 받아쓴 원문 → 비교할 한글. 교재의 문제 번호·출처 줄과 선지·(단, …)는 뺀다 */
export function syllableQuery(verbatim: string): string {
    const body = (verbatim || '').split('\n').filter((l) => !/기출|학력평가|모의평가|학년도|^\s*\d{3,4}\s*$/.test(l)).join('\n');
    return body.split(/[①②③④⑤]/)[0].replace(/\(단[^)]*\)?/g, '').replace(NOT_HANGUL, '');
}

// 받아쓰기에서 뺀 (단, …)는 DB 발문에서도 빼야 같은 문제가 같은 점수를 받는다(11/5 평가원 문제가 0.77로 떨어졌음)
const stemHangul = (t: string) => (t || '').split(/[①②③④⑤]/)[0].replace(/\(단[^)]*\)?/g, '').replace(NOT_HANGUL, '');
const pairs = (s: string) => { const o = new Set<string>(); for (let i = 0; i + 2 <= s.length; i++) o.add(s.slice(i, i + 2)); return o; };

function lcs(a: string, b: string): number {
    let prev = new Uint16Array(b.length + 1), cur = new Uint16Array(b.length + 1);
    for (let i = 1; i <= a.length; i++) {
        for (let j = 1; j <= b.length; j++) {
            cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]);
        }
        [prev, cur] = [cur, prev];
    }
    return prev[b.length];
}

type Row = [string, string, string?];
interface Prepared { id: string; z: string; p: Set<string> }
// 풀은 route 가 30분 담아 두므로 전처리도 풀 배열마다 한 번만 한다
const prepared = new WeakMap<Row[], Prepared[]>();
function prepare(pool: Row[]): Prepared[] {
    let out = prepared.get(pool);
    if (!out) {
        out = pool.map(([id, text]) => { const z = stemHangul(text); return { id, z, p: pairs(z) }; }).filter((x) => x.z.length >= 4);
        prepared.set(pool, out);
    }
    return out;
}

/** 이 점수 이상이면 같은 문제이거나 같은 틀(11/5 22문제에서 잡음 최고 0.87) */
export const SYLLABLE_MATCH = 0.9;

export interface SyllableHit { id: string; score: number }

/** 두 글자 겹침으로 200개를 추린 뒤 음절 일치도(0~1)로 줄 세운다. score = 받아쓰기·발문 양쪽을 얼마나 덮는지의 조화평균 */
export function rankBySyllables(query: string, pool: Row[], n = 10): SyllableHit[] {
    if (query.length < 12) return [];   // 글이 거의 없는 계산 문제는 글자로 가릴 수 없다
    const qp = pairs(query);
    const top = prepare(pool)
        .map((r) => { let c = 0; qp.forEach((x) => { if (r.p.has(x)) c++; }); return { r, c }; })
        .sort((a, b) => b.c - a.c).slice(0, 200);
    return top.map(({ r }) => {
        const c = lcs(query, r.z), a = c / query.length, b = c / r.z.length;
        const score = a + b ? (2 * a * b) / (a + b) : 0;
        // 사진에 표·그림 설명이 덧붙어 받아쓰기만 길어진 경우 — DB 발문이 통째로 들어 있으면 같은 문제로 본다
        const contained = r.z.length >= 20 && b >= 0.95 && a >= 0.6;
        return { id: r.id, score: contained ? Math.max(score, SYLLABLE_MATCH) : score };
    }).sort((x, y) => y.score - x.score).slice(0, n);
}

