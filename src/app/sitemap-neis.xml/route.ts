import { createAdminClient } from '@/utils/supabase/server-admin';
import { neisSchoolPage, neisSchoolPageNames, NEIS_FETCHED_AT } from '@/lib/neis-school-pages';

export const revalidate = 3600;

const BASE = 'https://mathetf.com';

// 기출 없는 학교 페이지(NEIS 시험 100곳, 2026-10) 전용 사이트맵.
// 본 사이트맵과 나눠 둔 건 서치어드바이저·서치콘솔에서 이 100곳의 색인·노출만 따로 보려는 것(4~6주 측정).
// 정식 자료가 들어온 학교는 원래 학교 페이지가 되어 본 사이트맵에 실리므로 여기서 뺀다.
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export async function GET() {
    const names = neisSchoolPageNames().filter(n => neisSchoolPage(n)?.unique);
    let owned = new Set<string>();
    try {
        const { data } = await createAdminClient().from('exam_materials').select('school')
            .in('school', names).in('content_type', ['해설', '개인DB']);
        owned = new Set((data || []).map((r: any) => r.school));
    } catch { /* 조회 실패 시 전부 싣는다 — 자료가 생긴 학교도 페이지는 200 이다 */ }
    const urls = names.filter(n => !owned.has(n)).map(n =>
        `<url><loc>${esc(`${BASE}/school/${encodeURIComponent(n)}`)}</loc><lastmod>${NEIS_FETCHED_AT}</lastmod><changefreq>weekly</changefreq><priority>0.5</priority></url>`);
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
    return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, s-maxage=3600' } });
}
