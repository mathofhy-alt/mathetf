/**
 * '번호로 바로 찾기' 입력 해석 (10/11) — 기출 자료 선택 창의 모의고사·수능 / 사관·경찰대.
 * 예: "2024 고2 9월 21번" · "24 고2 9 21" · "2024고2 9월 21,22,29번" · "2023 고1 11월 25~30번"
 *     "2025 수능 30번" · "2024 6월 모평 22번" · "사관 2024 미적분 29번" · "경찰대 2023 25번"
 * 짐작으로 담지 않는다: 연도·학년·월 중 모자라거나, 과목이 필요한데 없으면 이유를 돌려준다.
 */
export type MockQuery = {
    kind: 'national' | 'special';
    year: number;
    grade?: number;          // national 만
    month?: number;          // national 만
    school?: '전국연합' | '평가원' | '수능' | '사관학교' | '경찰대학교';
    subject?: string;        // 확률과통계 · 미적분 · 기하 · 가형 · 나형 · A형 · B형
    nums: number[];
};
export type ParseResult = { ok: true; q: MockQuery } | { ok: false; reason: string };

const SUBJECTS: [RegExp, string][] = [
    // 옛 고3 가형 선택과목(2006~2010) — '미적'보다 먼저 본다
    [/미분과\s*적분/, '미분과적분'], [/이산\s*수학|이산/, '이산수학'],
    [/확률과\s*통계|확통/, '확률과통계'], [/미적분|미적/, '미적분'], [/기하/, '기하'],
    [/가형/, '가형'], [/나형/, '나형'], [/a형/i, 'A형'], [/b형/i, 'B형'],
];

export function parseMockQuery(raw: string): ParseResult {
    let t = ` ${String(raw || '').trim()} `;
    if (!t.trim()) return { ok: false, reason: '찾을 문항을 적어 주세요. 예: 2024 고2 9월 21번' };
    const take = (re: RegExp) => { const m = t.match(re); if (m) t = t.replace(m[0], ' '); return m; };

    // 학교 종류
    let school: MockQuery['school'];
    if (take(/경찰\s*대(?:학교)?/)) school = '경찰대학교';
    else if (take(/사관\s*(?:학교)?/)) school = '사관학교';
    else if (take(/수능|수학\s*능력\s*시험/)) school = '수능';
    else if (take(/평가원|모의\s*평가|모평/)) school = '평가원';
    else if (take(/전국\s*연합|학력\s*평가|학평/)) school = '전국연합';
    const kind: MockQuery['kind'] = school === '사관학교' || school === '경찰대학교' ? 'special' : 'national';

    let subject: string | undefined;
    for (const [re, name] of SUBJECTS) if (take(re)) { subject = name; break; }

    // 문항 번호: '21번' · '21~30번' · '21,22,29번' (번이 붙은 것 먼저)
    const nums: number[] = [];
    const addRange = (s: string) => {
        for (const part of s.split(/[,\s·]+/).filter(Boolean)) {
            const r = part.match(/^(\d{1,2})\s*[~\-–]\s*(\d{1,2})$/);
            if (r) { const a = +r[1], b = +r[2]; if (a <= b && b - a < 40) for (let n = a; n <= b; n++) nums.push(n); }
            else if (/^\d{1,2}$/.test(part)) nums.push(+part);
        }
    };
    const bun = take(/((?:\d{1,2}\s*[~\-–]\s*\d{1,2}|\d{1,2})(?:\s*[,·]\s*(?:\d{1,2}\s*[~\-–]\s*\d{1,2}|\d{1,2}))*)\s*번/);
    if (bun) addRange(bun[1]);

    // 연도: 4자리, 또는 '24년' / 맨 앞 2자리
    let year: number | undefined;
    const y4 = take(/(?:^|\D)(20\d{2})(?:학년도|년)?(?=\D|$)/);
    if (y4) year = +y4[1];
    else { const y2 = take(/(?:^|\s)(\d{2})\s*(?:학년도|년)/) || take(/^\s*(\d{2})(?=\s)/); if (y2) year = 2000 + +y2[1]; }

    // 학년: 고2 · 2학년
    let grade: number | undefined;
    const g = take(/고\s*([123])/) || take(/([123])\s*학년/);
    if (g) grade = +g[1];

    // 월: '9월'
    let month: number | undefined;
    const mo = take(/(\d{1,2})\s*월/);
    if (mo) month = +mo[1];

    // 남은 숫자: (월이 없으면) 첫 숫자가 월, 나머지는 번호
    const rest = (t.match(/\d{1,2}\s*[~\-–]\s*\d{1,2}|\d{1,2}/g) || []);
    if (kind === 'national' && month === undefined && school !== '수능' && rest.length) { const m0 = +rest.shift()!.replace(/\D.*$/, ''); month = m0; }
    if (!nums.length) addRange(rest.join(','));

    if (!year) return { ok: false, reason: '연도를 적어 주세요. 예: 2024 고2 9월 21번' };
    if (!nums.length) return { ok: false, reason: '문항 번호를 적어 주세요. 예: 21번 · 21~30번 · 21,22,29번' };
    const bad = nums.find(n => n < 1 || n > 30);
    if (bad !== undefined) return { ok: false, reason: `${bad}번은 없어요. 1~30번 사이로 적어 주세요.` };

    if (kind === 'special') return { ok: true, q: { kind, year, school, subject, nums: Array.from(new Set(nums)) } };

    if (school === '수능' || school === '평가원') grade = grade ?? 3;
    if (!grade) return { ok: false, reason: '학년을 적어 주세요. 예: 2024 고2 9월 21번' };
    if (school !== '수능' && !month) return { ok: false, reason: '몇 월 시험인지 적어 주세요. 예: 2024 고2 9월 21번' };
    if (month !== undefined && (month < 1 || month > 12)) return { ok: false, reason: `${month}월은 없어요.` };
    return { ok: true, q: { kind, year, grade, month, school, subject, nums: Array.from(new Set(nums)) } };
}
