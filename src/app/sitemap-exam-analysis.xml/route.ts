import { getLongIndex } from '@/lib/exam-long';

// [2026-10-22] 장문 분석글이 붙은 시험지만 담은 사이트맵. lastmod = 분석글 작성일(정직한 날짜).
// 서치콘솔 제출은 scripts/gsc 로(사장 몫). robots.txt 의 구글봇 허용 목록과 같은 집합이다.
export const revalidate = 3600;   // 색인은 저장소에서 읽는다(배포 없이 갱신)
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

export async function GET() {
    const urls = Object.entries(await getLongIndex(true)).sort()
        .map(([id, at]) => `<url><loc>${esc(`https://mathetf.com/exam/${id}`)}</loc><lastmod>${at}</lastmod></url>`);
    return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`,
        { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
}
