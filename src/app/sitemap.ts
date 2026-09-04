import { MetadataRoute } from 'next';
import { createAdminClient } from '@/utils/supabase/server-admin';
import { HUB_SUBJECTS } from '@/lib/subject-hub';
import { buildRegionTree } from '@/lib/region-hub';

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
        // ⚠ 예전엔 오류도 break 로 삼켜서, 중간에 실패하면 잘린 목록을 정상인 척 내보냈다.
        //   사이트맵이 조용히 쪼그라드는 건 구글에게 "이 사이트는 페이지가 이만큼뿐"이라고
        //   거짓 신고하는 것과 같다. 실패는 실패로 드러내야 한다.
        if (error) throw new Error(`sitemap fetch 실패(offset ${from}): ${error.message || error}`);
        if (!data || data.length === 0) break;
        out.push(...(data as T[]));
        if (data.length < 1000) break;
        from += 1000;
    }
    return out;
}

// 내용이 코드에만 있는 페이지들의 마지막 개편일.
//
// ⚠ 이 페이지들을 실제로 고칠 때 여기 날짜도 같이 갱신할 것.
//
// 예전엔 전부 `new Date()` 였다. 사이트맵이 1시간마다 재생성되니 이 URL 들이 매번
// "방금 수정됨"이라고 신고했고, 구글은 몇 달째 그대로인 페이지를 계속 다시 받으러 왔다.
// (2026-08-26 GSC: 크롤 목적이 새로고침 92% / 발견 8%.)
// 진짜 손해는 낭비가 아니라 신뢰다 — 구글은 사이트의 lastmod 가 부정확하다고 판단하면
// 그 사이트 전체의 lastmod 를 무시한다. 그러면 새로 올린 회차의 정직한 lastmod 도 안 믿는다.
const PAGE_UPDATED: Record<string, string> = {
    '/teacher': '2026-07-28',
    '/predict': '2026-07-06',
    '/print-transform': '2026-07-06',
    '/study/common-math-2': '2026-07-02',
    '/study/calculus-1': '2026-07-02',
};

const BASE = 'https://mathetf.com';
const enc = (s: string) => encodeURIComponent(s);
const at = (v: any, fallback: Date) => (v ? new Date(v) : fallback);

// 데이터가 없거나 조회가 실패해도 이 목록은 항상 유효하다(고정 날짜라 거짓말을 하지 않는다).
function staticPages(): MetadataRoute.Sitemap {
    return (Object.keys(PAGE_UPDATED) as string[]).map((p) => ({
        url: `${BASE}${p}`,
        lastModified: new Date(PAGE_UPDATED[p]),
        changeFrequency: 'monthly' as const,
        priority: p === '/teacher' ? 0.9 : 0.8,
    }));
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    const fallbackDate = new Date(PAGE_UPDATED['/teacher']);

    try {
        const supabase = createAdminClient();

        // created_at DESC 이므로 data[0] 이 사이트 전체의 최신 자료 시각이다.
        const data = await fetchAll<any>((from, to) => supabase
            .from('exam_materials')
            .select('school, created_at, file_type, content_type')
            .neq('school', 'DELETED')
            .order('created_at', { ascending: false })
            .range(from, to));

        // 자료가 1,500행 넘게 있는 사이트라 0행은 정상일 수 없다 — 조회 실패로 본다.
        if (!data.length) throw new Error('sitemap: exam_materials 조회 결과 0행');
        const latestMaterial = at(data[0]?.created_at, fallbackDate);

        // 문제은행은 문항이 늘 때 내용이 바뀐다.
        const { data: qRow } = await supabase
            .from('questions').select('created_at')
            .order('created_at', { ascending: false }).limit(1).maybeSingle();
        const latestQuestion = at(qRow?.created_at, latestMaterial);

        // 학교별 최신 업데이트 날짜 추출
        //
        // [2026-09-03] 해설 PDF 가 있는 학교만 넣는다. 기준을 /schools 화면과 맞춘 것이다.
        // 예전엔 exam_materials 에 행이 있으면 무조건 넣었다. 그 탓에 '원본제보' 만 있고
        // 문항이 0개인 학교(백마고·포천고)가 사이트맵에 올라가 있었다 —
        // /schools 는 그 학교를 링크하지 않으므로 사이트 안에서는 도달 경로가 없는데
        // 구글에게만 "이런 페이지가 있다" 고 신고하는 꼴이었다(외부감사에서 고아 2건으로 잡힘).
        // 구글이 이 사이트를 '크롤링됨-미색인' 으로 판정한 상황에서 알맹이 없는 페이지를
        // 스스로 제출하는 건 손해다. 자료가 붙으면 자동으로 다시 들어온다.
        const schoolsWithSolution = new Set(
            data.filter((r: any) => r.file_type === 'PDF' && r.content_type === '해설')
                .map((r: any) => r.school)
        );
        const schoolMap: Record<string, Date> = {};
        data.forEach((item: any) => {
            if (!schoolsWithSolution.has(item.school)) return;
            if (!schoolMap[item.school]) {
                schoolMap[item.school] = new Date(item.created_at);
            }
        });

        const schoolPages: MetadataRoute.Sitemap = Object.entries(schoolMap).map(([school, date]) => ({
            url: `${BASE}/school/${enc(school)}`,
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
            url: `${BASE}/exam/${r.id}`,
            lastModified: new Date(r.created_at),
            changeFrequency: 'monthly' as const,
            priority: 0.7,
        }));

        // 모의고사: 미리보기 생성된 회차만 색인 (+ 허브·분류 페이지)
        const mockRows = await fetchAll<any>((from, to) => supabase
            .from('mock_exams')
            .select('slug, category, created_at, preview_urls')
            .not('preview_urls', 'is', null)
            .range(from, to));
        const listed = mockRows.filter((r: any) => Array.isArray(r.preview_urls) && r.preview_urls.length > 0);

        // 허브·분류 페이지의 lastmod 는 그 아래 실제 회차의 최신 시각이다.
        const newest = (rows: any[]) =>
            rows.reduce((acc: Date | null, r: any) => {
                const d = new Date(r.created_at);
                return !acc || d > acc ? d : acc;
            }, null);

        const mockStatic: MetadataRoute.Sitemap = [{
            url: `${BASE}/${enc('모의고사')}`,
            lastModified: newest(listed) || fallbackDate,
            changeFrequency: 'weekly' as const,
            priority: 0.8,
        }];

        const mockCategoryPages: MetadataRoute.Sitemap = ['전국연합', '평가원', '수능', '경찰대', '사관학교'].map((c) => ({
            url: `${BASE}/${enc('모의고사')}/${enc(c)}`,
            lastModified: newest(listed.filter((r: any) => r.category === c)) || fallbackDate,
            changeFrequency: 'monthly' as const,
            priority: 0.7,
        }));

        const mockExamPages: MetadataRoute.Sitemap = listed.map((r: any) => ({
            url: `${BASE}/${enc('모의고사')}/${enc(r.slug)}`,
            lastModified: new Date(r.created_at),
            changeFrequency: 'monthly' as const,
            priority: 0.7,
        }));

        // 과목 허브 — 네이버 실측상 '공통수학2' 7,880 · '공통수학1' 5,410(월).
        // 학교 수가 받쳐주는 4개만 만든다(나머지는 2~8개교라 씬페이지가 된다).
        const subjectPages: MetadataRoute.Sitemap = HUB_SUBJECTS.map((sub) => ({
            url: `${BASE}/subject/${enc(sub)}`,
            lastModified: latestQuestion,
            changeFrequency: 'weekly' as const,
            priority: 0.8,
        }));

        // 지역 허브 — /schools 와 학교 페이지 사이의 빈 층("강남구 고등학교 수학 기출").
        // ⚠ 학교 3곳 미만인 지역은 페이지 자체를 안 만든다(region-hub.ts MIN_SCHOOLS_FOR_PAGE).
        //   자료 없는 얇은 페이지를 늘리면 색인에 해가 되기 때문이다.
        const regionTree = await buildRegionTree();
        const regionPages: MetadataRoute.Sitemap = [
            { url: `${BASE}/${enc('지역')}`, lastModified: latestMaterial, changeFrequency: 'weekly' as const, priority: 0.8 },
            ...regionTree.filter((sd) => sd.hasPage).flatMap((sd) => [
                { url: `${BASE}/${enc('지역')}/${enc(sd.sido)}`, lastModified: latestMaterial, changeFrequency: 'weekly' as const, priority: 0.7 },
                ...sd.districts.filter((d) => d.hasPage).map((d) => ({
                    url: `${BASE}/${enc('지역')}/${enc(sd.sido)}/${enc(d.gu)}`,
                    lastModified: latestMaterial, changeFrequency: 'weekly' as const, priority: 0.7,
                })),
            ]),
        ];

        // 내용이 데이터에서 오는 페이지들 — 실제 데이터 변경 시각을 쓴다.
        const dataDriven: MetadataRoute.Sitemap = [
            { url: BASE, lastModified: latestMaterial, changeFrequency: 'daily', priority: 1.0 },
            { url: `${BASE}/question-bank`, lastModified: latestQuestion, changeFrequency: 'daily', priority: 0.9 },
            { url: `${BASE}/schools`, lastModified: latestMaterial, changeFrequency: 'weekly', priority: 0.7 },
        ];

        return [...dataDriven, ...staticPages(), ...subjectPages, ...regionPages, ...schoolPages, ...examPages,
            ...mockStatic, ...mockCategoryPages, ...mockExamPages];
    } catch (e) {
        // ⚠ 예전엔 여기서 정적 5개만 담아 HTTP 200 으로 응답했다.
        //   DB 가 잠깐 느리거나 실패하면 사이트맵이 639개 → 5개로 쪼그라든 채 정상 응답이 되고,
        //   revalidate 3600 탓에 그 상태가 한 시간 캐시된다. 구글이 그때 읽으면 사이트 규모를
        //   5개로 인식한다. (2026-08 색인 급락 조사 중 발견 — 주원인은 아니었으나 실재하는 결함)
        //   → 실패는 5xx 로 드러낸다. 구글은 사이트맵 요청이 실패하면 이전 것을 유지하고 재시도한다.
        //     ISR 캐시가 있으면 Next 가 직전 정상본을 계속 제공하므로 손실도 없다.
        console.error('[sitemap] 생성 실패 — 5xx 로 응답한다:', e);
        throw e;
    }
}
