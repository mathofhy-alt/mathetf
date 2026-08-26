import { MetadataRoute } from 'next';
import { createAdminClient } from '@/utils/supabase/server-admin';

export const revalidate = 3600; // 1시간마다 갱신

// ⚠ PostgREST 는 limit 을 안 줘도 1,000행에서 조용히 끊는다.
// 이 파일이 그 함정에 빠져 있었다 — exam_materials 1,468행 중 최신 1,000행만 읽는 바람에
// 학교 페이지 123개 중 115개만 등재되고 8곳(반포고·불암고·서문여고·서초고·신목고·언남고·재현고·한대부고)이
// 사이트맵에서 통째로 빠져 있었다. 하필 자료가 적어(1/8) 오래된 행만 있는 학교들이라
// 최신 1,000행 창 밖으로 밀려난 것이다. (2026-08-26 GSC 크롤링 통계 진단에서 발견)
async function fetchAll<T>(build: (from: number, to: number) => any): Promise<T[]> {
    const out: T[] = [];
    let from = 0;
    while (true) {
        const { data, error } = await build(from, from + 999);
        if (error || !data || data.length === 0) break;
        out.push(...(data as T[]));
        if (data.length < 1000) break;
        from += 1000;
    }
    return out;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    const baseUrl = 'https://mathetf.com';

    // 고정 페이지
    const staticPages: MetadataRoute.Sitemap = [
        { url: baseUrl, lastModified: new Date(), changeFrequency: 'daily', priority: 1.0 },
        { url: `${baseUrl}/question-bank`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.9 },
        { url: `${baseUrl}/teacher`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.9 },
        { url: `${baseUrl}/schools`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.7 },
        { url: `${baseUrl}/predict`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.8 },
        { url: `${baseUrl}/print-transform`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.8 },
        { url: `${baseUrl}/study/common-math-2`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.8 },
        { url: `${baseUrl}/study/calculus-1`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.8 },
    ];

    // DB에서 실제 시험지 있는 학교 목록 가져오기
    try {
        const supabase = createAdminClient();
        const data = await fetchAll<any>((from, to) => supabase
            .from('exam_materials')
            .select('school, created_at')
            .neq('school', 'DELETED')
            .order('created_at', { ascending: false })
            .range(from, to));

        if (!data.length) return staticPages;

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
        // 현재 440개라 아직 한도에 안 닿았지만, 넘는 순간 조용히 잘린다 — 미리 막는다.
        const examRows = await fetchAll<any>((from, to) => supabase
            .from('exam_materials')
            .select('id, created_at')
            .eq('file_type', 'PDF')
            .eq('content_type', '해설')
            .neq('school', 'DELETED')
            .range(from, to));

        const examPages: MetadataRoute.Sitemap = examRows.map((r: any) => ({
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
        const mockRows = await fetchAll<any>((from, to) => supabase
            .from('mock_exams')
            .select('slug, created_at, preview_urls')
            .not('preview_urls', 'is', null)
            .range(from, to));
        const mockExamPages: MetadataRoute.Sitemap = mockRows
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



