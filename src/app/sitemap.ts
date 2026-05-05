import { MetadataRoute } from 'next';
import { createAdminClient } from '@/utils/supabase/server-admin';

export const revalidate = 3600; // 1시간마다 갱신

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    const baseUrl = 'https://mathetf.com';

    // 고정 페이지
    const staticPages: MetadataRoute.Sitemap = [
        { url: baseUrl, lastModified: new Date(), changeFrequency: 'daily', priority: 1.0 },
        { url: `${baseUrl}/question-bank`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.9 },
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
            .neq('school', '전국연합')
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

        return [...staticPages, ...schoolPages];
    } catch {
        return staticPages;
    }
}

