import { createAdminClient } from '@/utils/supabase/server-admin';
import type { MockExam, MockCategory } from '@/components/mock/MockExamCard';

export interface MockExamRow extends MockExam {
    id: string;
    original_pdf_path?: string | null;
    original_hwp_path?: string | null;
    variant_pdf_path?: string | null;
    variant_hwp_path?: string | null;
    preview_urls?: string[] | null;
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
        const { data } = await admin
            .from('mock_exams')
            .select('*')
            .order('exam_year', { ascending: false })
            .order('month', { ascending: false })
            .order('created_at', { ascending: false });
        return (data || []).map(mapRow);
    } catch {
        return [];
    }
}

export async function fetchMockExamsByCategory(category: MockCategory): Promise<MockExamRow[]> {
    try {
        const admin = createAdminClient();
        const { data } = await admin
            .from('mock_exams')
            .select('*')
            .eq('category', category)
            .order('exam_year', { ascending: false })
            .order('month', { ascending: false });
        return (data || []).map(mapRow);
    } catch {
        return [];
    }
}

export async function fetchMockExamBySlug(slug: string): Promise<MockExamRow | null> {
    try {
        const admin = createAdminClient();
        const { data } = await admin.from('mock_exams').select('*').eq('slug', slug).maybeSingle();
        return data ? mapRow(data) : null;
    } catch {
        return null;
    }
}
