import { createAdminClient } from '@/utils/supabase/server-admin';
import { unstable_cache } from 'next/cache';
import type { Metadata } from 'next';
import HomeClient from './HomeClient';

// [PERF] 홈 ISR — 쿠키(auth) 읽기를 클라이언트로 내려 CDN 캐시 히트 확보 (TTFB ~900ms → ~150ms)
// 업로드·삭제는 revalidatePath로 즉시 반영되므로 주기 재생성은 보험용 1시간이면 충분
// (기존 5분 주기는 하루 ~300회 백그라운드 재렌더로 Vercel CPU를 소모 — 7/14 한도 초과 원인 중 하나)
export const revalidate = 3600;

// 홈은 자기 자신을 canonical로 (루트 layout에서 canonical "/" 제거했기 때문에 여기서 명시)
// 파라미터 붙은 홈(/?school= 등)은 canonical "/" 로 정규화되므로 중복 색인 걱정 없음
// (기존 searchParams 기반 noindex는 페이지를 매 요청 동적 렌더로 만들어 제거 — canonical로 충분)
export const metadata: Metadata = {
    alternates: { canonical: '/' },
};

// Schools data cached for 1 hour (rarely changes)
const getCachedSchools = unstable_cache(
    async () => {
        const supabase = createAdminClient();
        let allSchoolData: any[] = [];
        let from = 0;
        while (true) {
            const { data, error } = await supabase
                .from('schools')
                .select('region, district, name')
                .range(from, from + 999);
            if (error || !data || data.length === 0) break;
            allSchoolData = [...allSchoolData, ...data];
            if (data.length < 1000) break;
            from += 1000;
        }
        return allSchoolData;
    },
    ['schools-data'],
    { revalidate: 3600 }
);

// 무료 시험(모의고사·수능·사관학교/경찰대·전국연합)은 홈 카탈로그에 노출하지 않음 — 서버에서 걸러 전송량 축소
const FREE_EXAM_SCHOOLS = ['전국연합', '사관학교', '경찰대학교', '육군사관학교', '해군사관학교', '공군사관학교', '국군간호사관학교'];
const isMockExam = (item: any) =>
    item.exam_type === '모의고사' || item.exam_type === '수능' || item.exam_type === '입학시험'
    || FREE_EXAM_SCHOOLS.includes(item.school)
    || item.title?.includes('모의고사');

// [PERF] select('*')는 ai_analysis·preview_urls 등 무거운 컬럼까지 끌고 와 홈 HTML이 1.3MB에 달했음
// → HomeClient가 실제 쓰는 컬럼만 선택 (HTML ~250KB 목표)
const HOME_COLUMNS =
    'id, title, school, grade, semester, subject, exam_type, exam_year, file_type, content_type, '
    + 'created_at, price, uploader_name, region, district, free_pdf_url, is_verified';

async function getHomeExams() {
    const supabase = createAdminClient();
    const { data } = await supabase
        .from('exam_materials')
        .select(HOME_COLUMNS)
        .neq('school', 'DELETED')
        .order('created_at', { ascending: false });
    // [크롤예산] 자료가 1,200건을 넘으며 홈 HTML 이 744KB 까지 커졌고, 그 93%가 이 목록 데이터였다.
    // Googlebot 은 사이트별 크롤 예산 안에서 움직이므로 홈이 무거우면 나머지 페이지가 밀린다
    // (8/18 GSC: '발견됨-색인 생성 안 됨' 89개. 홈에서 직접 링크된 /predict 조차 미크롤).
    // → 다운로드할 때만 필요한 값은 목록에서 빼고, 그 시점에 id 로 조회한다.
    //   free_pdf_url 은 버튼 노출 조건이라 존재 여부(boolean)만 남긴다.
    //   created_at 은 화면에서 날짜만 쓰므로 시각을 잘라 보낸다.
    return (data || []).filter((item: any) => !isMockExam(item)).map((item: any) => {
        // undefined 로 두면 RSC 페이로드에 키가 그대로 남으므로 구조분해로 완전히 걷어낸다
        const { free_pdf_url, ...rest } = item;
        return {
            ...rest,
            created_at: typeof rest.created_at === 'string' ? rest.created_at.slice(0, 10) : rest.created_at,
            has_free_pdf: !!free_pdf_url,
        };
    });
}

export default async function ExamPlatformPage() {
    const [examData, schoolsRaw] = await Promise.all([
        getHomeExams(),
        getCachedSchools(),
    ]);

    // [SEO] 홈에 구조화 데이터가 없었다. 사이트 대표 정보(WebSite·Organization)를 명시하고
    // 사이트 내 검색을 SearchAction 으로 알려 검색결과에 검색창이 노출될 여지를 만든다.
    const jsonLd = {
        '@context': 'https://schema.org',
        '@graph': [
            {
                '@type': 'WebSite',
                name: '수학ETF',
                alternateName: 'mathETF',
                url: 'https://mathetf.com',
                inLanguage: 'ko-KR',
                description: '전국 고등학교 수학 내신 기출과 전국연합·사관학교·경찰대 모의고사를 문항 단위로 모아, 원하는 문제만 골라 시험지로 만들 수 있는 문제은행입니다.',
                potentialAction: {
                    '@type': 'SearchAction',
                    target: { '@type': 'EntryPoint', urlTemplate: 'https://mathetf.com/schools?q={search_term_string}' },
                    'query-input': 'required name=search_term_string',
                },
            },
            {
                '@type': 'Organization',
                name: '수학ETF',
                url: 'https://mathetf.com',
                logo: 'https://mathetf.com/og-image.png',
                description: '수학 기출문제 은행 · 시험지 제작 서비스',
            },
        ],
    };

    return (
        <>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
        <HomeClient
            initialExamData={examData}
            initialSchoolsRaw={schoolsRaw}
        />
        </>
    );
}
