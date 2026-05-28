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

    // 경찰대·사관학교 전용 고우선순위 페이지 (SEO: "경찰대 수학", "사관학교 수학" 검색 유입)
    const specialSchoolPages: MetadataRoute.Sitemap = [
        { url: `${baseUrl}/school/${encodeURIComponent('경찰대학교')}`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.9 },
        { url: `${baseUrl}/school/${encodeURIComponent('육군사관학교')}`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.9 },
        { url: `${baseUrl}/school/${encodeURIComponent('해군사관학교')}`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.9 },
        { url: `${baseUrl}/school/${encodeURIComponent('공군사관학교')}`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.9 },
        { url: `${baseUrl}/school/${encodeURIComponent('국군간호사관학교')}`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.9 },
        { url: `${baseUrl}/school/${encodeURIComponent('전국연합')}`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.9 },
    ];

    // DB에서 실제 시험지 있는 학교 목록 가져오기
    try {
        const supabase = createAdminClient();
        const { data } = await supabase
            .from('exam_materials')
            .select('school, created_at')
            .neq('school', 'DELETED')
            .order('created_at', { ascending: false });

        if (!data) return [...staticPages, ...specialSchoolPages];

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

        return [...staticPages, ...specialSchoolPages, ...schoolPages];
    } catch {
        return [...staticPages, ...specialSchoolPages];
    }
}


