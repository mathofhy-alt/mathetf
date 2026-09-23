import { createAdminClient } from '@/utils/supabase/server-admin';
import type { MockExam, MockCategory } from '@/components/mock/MockExamCard';

export type MockMaterialDb = { id: string; subject: string };

export interface MockExamRow extends MockExam {
    id: string;
    original_pdf_path?: string | null;
    original_hwp_path?: string | null;
    variant_pdf_path?: string | null;
    variant_hwp_path?: string | null;
    preview_urls?: string[] | null;
    materialDbs?: MockMaterialDb[];
    materialOnly?: boolean;
}

type MaterialRow = {
    id: string;
    exam_year: number;
    semester: number;
    grade: number;
    school: string;
    subject: string;
};

// The source labels on these older personal-DB rows are wrong. Each 2025
// paper was checked against the first five answers in the original EBS key;
// 2023/2024 June and 2026 June are confirmed evaluation-institute rounds.
const VERIFIED_GRADE3_CATEGORY: Record<string, MockCategory> = {
    '2023-6': '평가원',
    '2024-6': '평가원',
    '2025-6': '평가원',
    '2025-9': '평가원',
    '2025-11': '수능',
    '2026-6': '평가원',
};

function materialCategory(row: MaterialRow): MockCategory | null {
    const verified = VERIFIED_GRADE3_CATEGORY[`${row.exam_year}-${row.semester}`];
    if (verified) return verified;
    return ['전국연합', '평가원', '수능'].includes(row.school)
        ? row.school as MockCategory : null;
}

function materialTitle(year: number, month: number, category: MockCategory): string {
    if (category === '수능') return `${year}년 시행 ${year + 1}학년도 대학수학능력시험 수학`;
    if (category === '평가원') return `${year}년 고3 ${month}월 평가원 모의평가 수학`;
    return `${year}년 고3 ${month}월 전국연합학력평가 수학`;
}

function attachQuestionRounds(exams: MockExamRow[], materials: MaterialRow[]): MockExamRow[] {
    const byRound = new Map<string, { year: number; month: number; category: MockCategory; dbs: MockMaterialDb[] }>();
    for (const row of materials) {
        const year = Number(row.exam_year);
        const month = Number(row.semester);
        const category = materialCategory(row);
        if (!category || !Number.isInteger(year) || month < 1 || month > 12 || !row.id) continue;
        const key = `${year}-${month}`;
        const round = byRound.get(key) || { year, month, category, dbs: [] };
        if (!round.dbs.some(db => db.id === row.id)) {
            round.dbs.push({ id: row.id, subject: row.subject || '수학' });
        }
        byRound.set(key, round);
    }

    const covered = new Set<string>();
    const withQuestions = exams.map(exam => {
        if (exam.grade !== '고3' || !exam.month) return exam;
        const key = `${exam.year}-${exam.month}`;
        const round = byRound.get(key);
        if (!round || round.category !== exam.category) return exam;
        covered.add(key);
        return { ...exam, materialDbs: round.dbs };
    });
    for (const [key, round] of byRound) {
        if (covered.has(key)) continue;
        withQuestions.push({
            id: `question-round-${key}`,
            slug: `questions-${round.year}-${round.month}-${round.category}`,
            category: round.category,
            title: materialTitle(round.year, round.month, round.category),
            year: round.year,
            grade: '고3',
            month: round.month,
            subject: '수학',
            materialDbs: round.dbs,
            materialOnly: true,
        });
    }
    return withQuestions.sort((a, b) => b.year - a.year || b.month - a.month || a.title.localeCompare(b.title, 'ko'));
}

function mapRow(r: any): MockExamRow {
    return {
        id: r.id,
        slug: r.slug,
        category: r.category,
        title: r.title,
        year: r.exam_year,
        grade: r.grade || '',
        month: r.month || 0,
        subject: r.subject || undefined,
        hasVariant: !!(r.variant_pdf_path || r.variant_hwp_path),
        original_pdf_path: r.original_pdf_path,
        original_hwp_path: r.original_hwp_path,
        variant_pdf_path: r.variant_pdf_path,
        variant_hwp_path: r.variant_hwp_path,
        preview_urls: r.preview_urls || null,
    };
}

/** 전체 회차 (최신순). 분류별 그룹은 호출부에서. */
export async function fetchAllMockExams(): Promise<MockExamRow[]> {
    try {
        const admin = createAdminClient();
        const [examResult, materialResult] = await Promise.all([
            admin.from('mock_exams').select('*')
                .order('exam_year', { ascending: false })
                .order('month', { ascending: false })
                .order('created_at', { ascending: false }),
            admin.from('exam_materials')
                .select('id,exam_year,semester,grade,school,subject')
                .eq('file_type', 'DB').eq('grade', 3)
                .in('school', ['전국연합', '평가원', '수능'])
                .in('exam_type', ['모의고사', '수능']),
        ]);
        if (examResult.error) throw examResult.error;
        const exams = (examResult.data || []).map(mapRow);
        if (materialResult.error) return exams;
        return attachQuestionRounds(exams, (materialResult.data || []) as MaterialRow[]);
    } catch {
        return [];
    }
}

export async function fetchMockExamsByCategory(category: MockCategory): Promise<MockExamRow[]> {
    return (await fetchAllMockExams()).filter(exam => exam.category === category);
}

export async function fetchMockExamBySlug(slug: string): Promise<MockExamRow | null> {
    return (await fetchAllMockExams()).find(exam => exam.slug === slug) || null;
}
