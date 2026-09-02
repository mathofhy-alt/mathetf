import { createAdminClient } from '@/utils/supabase/server-admin';

export const revalidate = 3600;

const BASE = 'https://mathetf.com';

// RSS 피드 — 네이버 서치어드바이저용.
//
// [2026-09-03] 네이버는 사이트맵과 별개로 RSS 를 받아 수집 속도를 높인다(공식 가이드).
// 우리 주력 유입원이 네이버인데 RSS 를 안 내고 있었다.
// 새 회차가 하루 10~20개씩 들어오는 사이트라 '최근 것' 을 알리는 통로가 실익이 있다.
//
// 최근 100건만 낸다. RSS 는 전체 목록이 아니라 '새로 올라온 것' 을 알리는 용도다.
const esc = (s: string) =>
    String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

export async function GET() {
    try {
        const supabase = createAdminClient();
        const { data, error } = await supabase
            .from('exam_materials')
            .select('id, school, exam_year, grade, semester, exam_type, subject, created_at, ai_analysis')
            .eq('file_type', 'PDF')
            .eq('content_type', '해설')
            .neq('school', 'DELETED')
            .order('created_at', { ascending: false })
            .limit(100);
        if (error) throw new Error(`rss fetch 실패: ${error.message}`);

        const items = (data ?? []).map((r) => {
            const title = `${r.school} ${r.exam_year}년 ${r.grade}학년 ${r.semester}학기 ${r.exam_type} ${r.subject} 기출문제`;
            // 설명은 회차마다 다른 실제 분석글을 쓴다. 없으면 학교·회차 정보로 만든다.
            const desc = (r.ai_analysis ? String(r.ai_analysis).replace(/\s+/g, ' ').slice(0, 300)
                : `${title}. 문제와 해설을 PDF·한글(HWP)로 제공합니다.`);
            return `    <item>
      <title>${esc(title)}</title>
      <link>${BASE}/exam/${r.id}</link>
      <guid isPermaLink="true">${BASE}/exam/${r.id}</guid>
      <pubDate>${new Date(r.created_at).toUTCString()}</pubDate>
      <description>${esc(desc)}</description>
    </item>`;
        }).join('\n');

        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>수학ETF — 전국 고등학교 수학 기출문제</title>
    <link>${BASE}</link>
    <description>전국 중·고등학교 수학 내신 기출과 전국연합·평가원·수능·사관학교·경찰대 기출을 문제·해설로 제공합니다.</description>
    <language>ko</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${items}
  </channel>
</rss>`;
        return new Response(xml, { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' } });
    } catch (e: any) {
        return new Response(`rss 생성 실패: ${e.message}`, { status: 500 });
    }
}
