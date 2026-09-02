import { createAdminClient } from '@/utils/supabase/server-admin';

export const revalidate = 3600;

const BASE = 'https://mathetf.com';

// 이미지 사이트맵.
//
// [2026-09-03] 이 사이트는 시험 문제가 전부 이미지(webp)다. 그런데 이미지 사이트맵이 없어서
// 구글 이미지 검색에 잡힐 경로가 없었다(감사에서 image:image 0건 확인).
// Next 14.2 의 MetadataRoute.Sitemap 타입은 images 필드를 지원하지 않아 라우트로 직접 만든다.
//
// ⚠ 기대치는 크지 않다. 이미지 검색 CTR 은 웹검색보다 훨씬 낮고, 시험지 캡처는
//   이미지 검색 사용자가 찾는 종류가 아니다. 다만 자료가 이미지 중심이라
//   구글 쪽에 남은 몇 안 되는 경로이고, 만드는 비용이 낮아서 해둔다.
const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export async function GET() {
    try {
        const supabase = createAdminClient();
        const rows: any[] = [];
        for (let from = 0; ; from += 1000) {
            const { data, error } = await supabase
                .from('exam_materials')
                .select('id, school, exam_year, grade, semester, exam_type, subject, preview_urls')
                .eq('file_type', 'PDF')
                .eq('content_type', '해설')
                .neq('school', 'DELETED')
                .not('preview_urls', 'is', null)
                .range(from, from + 999);
            // 실패를 삼키면 '이미지가 이만큼뿐' 이라고 거짓 신고하게 된다(사이트맵에서 겪은 일).
            if (error) throw new Error(`image-sitemap fetch 실패(offset ${from}): ${error.message}`);
            if (!data?.length) break;
            rows.push(...data);
            if (data.length < 1000) break;
        }

        const body = rows.map((r) => {
            const urls: string[] = Array.isArray(r.preview_urls) ? r.preview_urls : [];
            if (!urls.length) return '';
            const label = `${r.school} ${r.exam_year}년 ${r.grade}학년 ${r.semester}학기 ${r.exam_type} ${r.subject}`;
            const imgs = urls.map((u, i) =>
                `    <image:image><image:loc>${esc(u)}</image:loc>` +
                `<image:title>${esc(`${label} 수학 기출문제 ${i + 1}페이지`)}</image:title></image:image>`
            ).join('\n');
            return `  <url>\n    <loc>${BASE}/exam/${r.id}</loc>\n${imgs}\n  </url>`;
        }).filter(Boolean).join('\n');

        const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n${body}\n</urlset>`;
        return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
    } catch (e: any) {
        return new Response(`image-sitemap 생성 실패: ${e.message}`, { status: 500 });
    }
}
