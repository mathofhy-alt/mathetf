/**
 * 여러 시험지 한꺼번에 제보 (10/15) — 파일 이름·PDF 첫 쪽 글자에서 학교·연도·학년·학기·시험·과목을 짐작한다.
 * 사용자: 강사가 70회차를 한 건씩 폼을 채워 올리느라 몇 시간 걸렸다 → "파일만 던지고 틀린 칸만 고치게".
 * 학교 이름은 시험지에 없는 경우가 많아(사용자) 파일 이름이 먼저, 머리말이 다음, 둘 다 없으면 빈칸(회원이 고른다).
 * 학교는 회원이 먼저 고른 지역(시도·구군) 학교 목록 안에서만 찾는다 — 동명이교 섞임 방지.
 * 서버 쪽 자동 처리(scratch_report_auto.py)의 머리말 읽기 규칙과 맞춘다.
 */
export type GuessSchool = { name: string; region: string; district: string; code: string };
export type Guess = { school?: GuessSchool; year?: number; grade?: number; semester?: number; examType?: '중간고사' | '기말고사'; subject?: string };

// norm: 글자만 맞춤(구두점은 남김 — '2-1'·'2025. 12. 19.' 를 읽는다), tight: 띄어쓰기·구분 기호를 모두 뺌
const norm = (s: string) => s.normalize('NFC').replace(/Ⅰ/g, 'I').replace(/Ⅱ/g, 'II').replace(/_/g, ' ');
const tight = (s: string) => norm(s).replace(/[\s\-·.()[\]{}]+/g, '');

// 학교 이름 줄임: 수원여자고등학교 → 수원여자고 · 수원여고, 한영외국어고등학교 → 한영외고
function variants(name: string): string[] {
    const v = new Set([name]);
    const short = name.replace(/고등학교$/, '고');
    v.add(short);
    v.add(short.replace(/여자고$/, '여고').replace(/외국어고$/, '외고').replace(/과학고$/, '과고').replace(/국제고$/, '국제고'));
    return [...v].filter(x => x.length >= 3);
}

export function findSchool(text: string, schools: GuessSchool[]): GuessSchool | undefined {
    const t = tight(text);
    let best: { s: GuessSchool; len: number } | undefined;
    for (const s of schools) for (const v of variants(s.name)) {
        if (t.includes(v) && (!best || v.length > best.len)) best = { s, len: v.length };
    }
    return best?.s;
}

// 긴 이름부터 — '미적분II' 가 '미적분' 보다, '수학II' 가 '수학I' 보다 먼저
const SUBJECTS: [RegExp, string][] = [
    [/공통수학1|공수1/, '공통수학1'], [/공통수학2|공수2/, '공통수학2'],
    [/수학상|수상(?!\d)/, '수학(상)'], [/수학하|수하(?!\d)/, '수학(하)'],
    [/미적분II|미적분2|미적2/, '미적분II'], [/미적분I|미적분1|미적1/, '미적분I'], [/미적분/, '미적분'],
    [/확률과통계|확통/, '확률과통계'], [/기하/, '기하'], [/대수/, '대수'],
    [/수학II|수학2(?![학차])|수2(?![학차\d])/, '수학II'], [/수학I|수학1(?![학차])|수1(?![학차\d])/, '수학I'],
];
const PAIR_15_22: Record<string, string> = { '수학(상)': '공통수학1', '수학(하)': '공통수학2', '수학I': '대수', '수학II': '미적분I', '미적분': '미적분II' };
const PAIR_22_15 = Object.fromEntries(Object.entries(PAIR_15_22).map(([a, b]) => [b, a]));
/** 그 시험의 교육과정 — 2025 고1 부터 2022 개정(같은 해에도 학년마다 다르다) */
export const curriculumOf = (year: number, grade: number): '2022' | '2015' => (year - grade + 1 >= 2025 ? '2022' : '2015');
/** 2025 고1 부터 2022 개정 — 과목 이름을 그 교육과정 짝으로 맞춘다 */
export function fitSubject(subject: string, year?: number, grade?: number): string {
    if (!year || !grade) return subject;
    return year - grade + 1 >= 2025 ? (PAIR_15_22[subject] || subject) : (PAIR_22_15[subject] || subject);
}

function parse(raw: string): Omit<Guess, 'school'> {
    const s = norm(raw), t = tight(raw), out: Omit<Guess, 'school'> = {};
    let m = t.match(/(20[2-3]\d)학년도/) || t.match(/(20[2-3]\d)년/) || s.match(/(?<!\d)(20[2-3]\d)(?!\d)/);
    if (m) out.year = Number(m[1]);
    else if ((m = t.match(/(?<!\d)(2[2-9])년/))) out.year = 2000 + Number(m[1]);
    // 학년-학기: '2-1', '2학년 1학기', '고2'
    if ((m = s.match(/(?<!\d)([123])\s*-\s*([12])(?!\d)/)) || (m = t.match(/([123])학년([12])학기/))) { out.grade = Number(m[1]); out.semester = Number(m[2]); }
    if (!out.grade && (m = t.match(/(?:제|고)?\(?([123])\)?학년(?!도)/) || t.match(/고([123])(?!\d)/) || t.match(/학교([123])(?!\d)/))) out.grade = Number(m[1]);
    if (!out.semester && (m = t.match(/([12])학기/))) out.semester = Number(m[1]);
    // 우리 네임 폴더 이름: '2026년_2중간_권선고등학교2_미적분I'
    if ((m = t.match(/(?<!\d)([12])(중간|기말)/))) { out.semester ??= Number(m[1]); out.examType = m[2] === '중간' ? '중간고사' : '기말고사'; }
    if (!out.examType) {
        const mid = /중간(고사|평가)?|(?<!\d)(1|일)[차자](지필|정기|고사|시험|평가)|1회고사/.test(t);
        const fin = /기말(고사|평가)?|(?<!\d)(2|이)[차자](지필|정기|고사|시험|평가)|2회고사/.test(t);
        if (mid !== fin) out.examType = mid ? '중간고사' : '기말고사';
    }
    // 시행일 — 머리말에 연도·시험명이 없는 학교
    if ((m = s.match(/(20\d\d)\s*[.년]\s*(\d{1,2})\s*[.월]\s*(\d{1,2})/))) {
        const y = Number(m[1]), mo = Number(m[2]);
        if (mo >= 1 && mo <= 12) {
            out.year ??= mo >= 3 ? y : y - 1;
            out.semester ??= mo >= 8 || mo <= 2 ? 2 : 1;
            if (!out.examType && mo !== 5 && mo !== 11) out.examType = [3, 4, 8, 9, 10].includes(mo) ? '중간고사' : '기말고사';
        }
    }
    for (const [re, name] of SUBJECTS) if (re.test(t)) { out.subject = name; break; }
    return out;
}

/** 파일 이름이 먼저(강사가 직접 붙인 이름), 빈칸만 머리말로 채운다. 학교는 지역 학교 목록 안에서만. */
export function guessReport(fileName: string, headerText: string, schools: GuessSchool[]): Guess {
    const base = fileName.replace(/\.[a-z0-9]+$/i, '');
    const a = parse(base), b = headerText ? parse(headerText) : {};
    const g: Guess = { ...b, ...Object.fromEntries(Object.entries(a).filter(([, v]) => v !== undefined)) };
    g.school = findSchool(base, schools) || (headerText ? findSchool(headerText.slice(0, 600), schools) : undefined);
    if (g.subject) g.subject = fitSubject(g.subject, g.year, g.grade);
    return g;
}
