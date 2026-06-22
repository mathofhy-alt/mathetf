import { MetadataRoute } from 'next';
import { createAdminClient } from '@/utils/supabase/server-admin';

export const revalidate = 3600; // 1시간마다 갱신

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    const baseUrl = 'https://mathetf.com';

    // 고정 페이지
    const staticPages: MetadataRoute.Sitemap = [
        { url: baseUrl, lastModified: new Date(), changeFrequency: 'daily', priority: 1.0 },
        { url: `${baseUrl}/question-bank`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.9 },
        { url: `${baseUrl}/schools`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.7 },
        { url: `${baseUrl}/login`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
        { url: `${baseUrl}/mypage`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.6 },
    ];

    // DB에서 실제 시험지 있는 학교 목록 가져오기
    try {
        const supabase = createAdminClient();
        const { data } = await supabase
            .from('exam_materials')
            .select('school, created_at')
            .neq('school', 'DELETED')
            .order('created_at', { ascending: false });

        if (!data) return staticPages;

        // 학교별 최신 업데이트 날짜 추출
        const schoolMap: Record<string, Date> = {};
        data.forEach((item: any) => {
            if (!schoolMap[item.school]) {
                schoolMap[item.school] = new Date(item.created_at);
            }
        });

        const schoolPages: MetadataRoute.Sitemap = Object.entries(schoolMap).map(([school, date]) => ({
            url: `${baseUrl}/school/${encodeURIComponent(school)}`,
            lastModified: date,
            changeFrequency: 'weekly' as const,
            priority: 0.8,
        }));

        // 시험지별 상세페이지 (해설 PDF 1행 = 시험 1개)
        const { data: examRows } = await supabase
            .from('exam_materials')
            .select('id, created_at')
            .eq('file_type', 'PDF')
            .eq('content_type', '해설')
            .neq('school', 'DELETED');

        const examPages: MetadataRoute.Sitemap = (examRows || []).map((r: any) => ({
            url: `${baseUrl}/exam/${r.id}`,
            lastModified: new Date(r.created_at),
            changeFrequency: 'monthly' as const,
            priority: 0.7,
        }));

        // 모의고사: 미리보기 생성된 회차만 색인 (+ 허브·분류 페이지)
        const enc = (s: string) => encodeURIComponent(s);
        const mockStatic: MetadataRoute.Sitemap = ['모의고사'].map((p) => ({
            url: `${baseUrl}/${enc(p)}`, lastModified: new Date(), changeFrequency: 'daily' as const, priority: 0.8,
        }));
        const mockCategoryPages: MetadataRoute.Sitemap = ['전국연합', '평가원', '수능', '경찰대', '사관학교'].map((c) => ({
            url: `${baseUrl}/${enc('모의고사')}/${enc(c)}`, lastModified: new Date(), changeFrequency: 'weekly' as const, priority: 0.7,
        }));
        const { data: mockRows } = await supabase
            .from('mock_exams')
            .select('slug, created_at, preview_urls')
            .not('preview_urls', 'is', null);
        const mockExamPages: MetadataRoute.Sitemap = (mockRows || [])
            .filter((r: any) => Array.isArray(r.preview_urls) && r.preview_urls.length > 0)
            .map((r: any) => ({
                url: `${baseUrl}/${enc('모의고사')}/${enc(r.slug)}`,
                lastModified: new Date(r.created_at),
                changeFrequency: 'monthly' as const,
                priority: 0.7,
            }));

        return [...staticPages, ...schoolPages, ...examPages, ...mockStatic, ...mockCategoryPages, ...mockExamPages];
    } catch {
        return staticPages;
    }
}



