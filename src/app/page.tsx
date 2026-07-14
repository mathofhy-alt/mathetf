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
    + 'created_at, price, uploader_name, region, district, file_path, free_pdf_url, is_verified';

async function getHomeExams() {
    const supabase = createAdminClient();
    const { data } = await supabase
        .from('exam_materials')
        .select(HOME_COLUMNS)
        .neq('school', 'DELETED')
        .order('created_at', { ascending: false });
    return (data || []).filter((item: any) => !isMockExam(item));
}

export default async function ExamPlatformPage() {
    const [examData, schoolsRaw] = await Promise.all([
        getHomeExams(),
        getCachedSchools(),
    ]);

    return (
        <HomeClient
            initialExamData={examData}
            initialSchoolsRaw={schoolsRaw}
        />
    );
}
