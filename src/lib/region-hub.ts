import { createAdminClient } from '@/utils/supabase/server-admin';
import { countExamGroupsBySchool, examGroupKey, examYearOf } from '@/lib/exam-groups';

/**
 * [지역 허브] 시·도 → 구/군 → 학교 3단 집계.
 *
 * 왜: "강남구 고등학교 수학 기출", "송파구 수학 내신" 같은 중간 검색어를 받을 페이지가 없었다.
 *     학교 페이지(123개)와 /schools 사이에 층이 비어 있다.
 *
 * ⚠ 자료가 있는 학교만 다룬다. schools 테이블에는 전국 2,340개교가 들어 있지만
 *   자료가 붙은 건 123개뿐이라, 전부 나열하면 빈 페이지를 양산하게 된다.
 * ⚠ 집계 기준은 /schools 화면과 같다 — 회차(시험 그룹) 단위이고,
 *   해설 PDF 가 하나도 없는 묶음(전국연합·사관학교 등 DB 전용)은 내신 학교가 아니므로 뺀다.
 * ⚠ PostgREST 는 limit 을 안 줘도 1000행에서 잘린다. 반드시 range() 로 이어 받는다
 *   (8/18 에 1,000행만 집계돼 학교 10곳이 목록에서 통째로 빠진 전력이 있다).
 */

/** 이 수보다 적은 학교를 가진 지역은 자체 페이지를 만들지 않는다(씬페이지 방지). */
export const MIN_SCHOOLS_FOR_PAGE = 3;

export interface SchoolBrief {
    name: string;
    count: number;      // 회차 수
}

export interface DistrictNode {
    sido: string;
    gu: string;
    schools: SchoolBrief[];
    examCount: number;
    /** 과목별 회차 수 — 지역마다 다른 본문을 만드는 근거 */
    subjects: { subject: string; count: number }[];
    /** 자체 페이지를 가질 만큼 두꺼운가 */
    hasPage: boolean;
}

export interface SidoNode {
    sido: string;
    districts: DistrictNode[];
    schoolCount: number;
    examCount: number;
    subjects: { subject: string; count: number }[];
    hasPage: boolean;
}

async function fetchAll<T>(table: string, columns: string): Promise<T[]> {
    const supabase = createAdminClient();
    const out: T[] = [];
    let from = 0;
    for (;;) {
        const { data, error } = await supabase.from(table).select(columns).range(from, from + 999);
        if (error || !data || data.length === 0) break;
        out.push(...(data as T[]));
        if (data.length < 1000) break;
        from += 1000;
    }
    return out;
}

function topSubjects(rows: { subject?: string | null }[], limit = 6) {
    const c: Record<string, number> = {};
    for (const r of rows) {
        const s = (r.subject || '').trim();
        if (!s || s === '전과목' || s === '전과정') continue;
        c[s] = (c[s] || 0) + 1;
    }
    return Object.entries(c)
        .map(([subject, count]) => ({ subject, count }))
        .sort((a, b) => b.count - a.count || a.subject.localeCompare(b.subject, 'ko'))
        .slice(0, limit);
}

/** 시·도 → 구/군 → 학교 트리를 만든다. 실패하면 빈 배열(페이지는 그대로 뜬다). */
export async function buildRegionTree(): Promise<SidoNode[]> {
    let exams: any[] = [];
    let schools: any[] = [];
    try {
        exams = await fetchAll<any>('exam_materials',
            'school, title, exam_year, grade, semester, exam_type, subject, file_type, content_type');
        schools = await fetchAll<any>('schools', 'name, region, district');
    } catch {
        return [];
    }
    exams = exams.filter((r) => r.school && r.school !== 'DELETED');

    // /schools 와 같은 기준: 해설 PDF 가 있는 학교만 '내신 학교'로 본다.
    const hasSolutionPdf = new Set(
        exams.filter((r) => r.file_type === 'PDF' && r.content_type === '해설').map((r) => r.school)
    );
    const kept = exams.filter((r) => hasSolutionPdf.has(r.school));
    const counts = countExamGroupsBySchool(kept);

    const place: Record<string, { sido: string; gu: string }> = {};
    for (const s of schools) {
        if (s?.name && !place[s.name] && s.region) {
            place[s.name] = { sido: String(s.region), gu: String(s.district || '') };
        }
    }

    // 학교별 회차 행을 지역으로 접는다.
    const byDistrict = new Map<string, { sido: string; gu: string; schools: SchoolBrief[]; rows: any[] }>();
    for (const [name, count] of Object.entries(counts)) {
        const p = place[name];
        if (!p || !p.gu) continue;          // 지역 정보가 없으면 트리에 못 넣는다
        const key = `${p.sido}/${p.gu}`;
        if (!byDistrict.has(key)) byDistrict.set(key, { sido: p.sido, gu: p.gu, schools: [], rows: [] });
        const node = byDistrict.get(key)!;
        node.schools.push({ name, count });
        node.rows.push(...kept.filter((r) => r.school === name));
    }

    const districts: DistrictNode[] = Array.from(byDistrict.values()).map((d) => {
        // 과목 분포는 회차(그룹) 단위로 — 같은 회차의 PDF·HWP·개인DB 3행이 3번 세지지 않게 접는다.
        const seen = new Set<string>();
        const groupRows: any[] = [];
        for (const r of d.rows) {
            const k = `${r.school}|${examGroupKey(r)}|${examYearOf(r)}`;
            if (seen.has(k)) continue;
            seen.add(k);
            groupRows.push(r);
        }
        return {
            sido: d.sido,
            gu: d.gu,
            schools: d.schools.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'ko')),
            examCount: d.schools.reduce((n, s) => n + s.count, 0),
            subjects: topSubjects(groupRows),
            hasPage: d.schools.length >= MIN_SCHOOLS_FOR_PAGE,
        };
    });

    const bySido = new Map<string, DistrictNode[]>();
    for (const d of districts) {
        if (!bySido.has(d.sido)) bySido.set(d.sido, []);
        bySido.get(d.sido)!.push(d);
    }

    return Array.from(bySido.entries())
        .map(([sido, ds]) => {
            const schoolCount = ds.reduce((n, d) => n + d.schools.length, 0);
            const merged: Record<string, number> = {};
            for (const d of ds) for (const s of d.subjects) merged[s.subject] = (merged[s.subject] || 0) + s.count;
            return {
                sido,
                districts: ds.sort((a, b) => b.schools.length - a.schools.length || a.gu.localeCompare(b.gu, 'ko')),
                schoolCount,
                examCount: ds.reduce((n, d) => n + d.examCount, 0),
                subjects: Object.entries(merged)
                    .map(([subject, count]) => ({ subject, count }))
                    .sort((a, b) => b.count - a.count).slice(0, 6),
                hasPage: schoolCount >= MIN_SCHOOLS_FOR_PAGE,
            };
        })
        .sort((a, b) => b.schoolCount - a.schoolCount || a.sido.localeCompare(b.sido, 'ko'));
}

export function findSido(tree: SidoNode[], sido: string) {
    return tree.find((s) => s.sido === sido);
}
export function findDistrict(tree: SidoNode[], sido: string, gu: string) {
    return findSido(tree, sido)?.districts.find((d) => d.gu === gu);
}
