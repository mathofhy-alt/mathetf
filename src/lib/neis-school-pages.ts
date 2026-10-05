import data from './neis-school-pages.json';

/**
 * 자료 없는 학교 페이지용 NEIS 데이터 (scripts/neis_school_pages.py 가 만든다 · 2026-10 100곳 시험).
 * 학교마다 실제로 다른 정보(시험 일정·학년별 수학 과목·학급 수)만 담는다 — 얇은 페이지 방지.
 */
export type NeisExam = { sem: 1 | 2; name: string; grades: number[]; start: string; end: string };
export type NeisMath = { subject: string; hours: number; elective: boolean };
export type NeisSchoolPage = {
    name: string; region: string; district: string; code: string; kind: string; fond: string; coedu: string;
    classes: Record<string, number>; exams: NeisExam[]; math: Record<string, NeisMath[]>;
    searchVolume: number; unique: boolean;
};

const payload = data as unknown as { academicYear: number; fetchedAt: string; schools: Record<string, NeisSchoolPage> };
export const NEIS_ACADEMIC_YEAR = payload.academicYear;
export const NEIS_FETCHED_AT = payload.fetchedAt;

export function neisSchoolPage(name: string): NeisSchoolPage | null {
    return payload.schools[name] || null;
}
export function neisSchoolPageNames(): string[] {
    return Object.keys(payload.schools);
}
