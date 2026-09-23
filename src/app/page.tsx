import {getHomeExams} from '@/lib/home-catalog';
import {unpackHomeRow} from '@/lib/data';
import { createAdminClient } from '@/utils/supabase/server-admin';
import { packHomeRow } from '@/lib/data';
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
            initialExamData={examData.slice(0,120)}
            initialSchoolsRaw={schoolsRaw.filter(s=>new Set(examData.map(row=>unpackHomeRow(row).school)).has(s.name))}
        />
        </>
    );
}
