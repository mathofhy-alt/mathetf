import {createAdminClient} from '@/utils/supabase/server-admin';
import {packHomeRow} from '@/lib/data';
import {unstable_cache} from 'next/cache';
// 무료 시험(모의고사·수능·사관학교/경찰대·전국연합)은 홈 카탈로그에 노출하지 않음 — 서버에서 걸러 전송량 축소
const FREE_EXAM_SCHOOLS = ['전국연합', '평가원', '사관학교', '경찰대학교', '육군사관학교', '해군사관학교', '공군사관학교', '국군간호사관학교'];
const isMockExam = (item: any) =>
    item.exam_type === '모의고사' || item.exam_type === '수능' || item.exam_type === '입학시험'
    || FREE_EXAM_SCHOOLS.includes(item.school)
    || item.title?.includes('모의고사');

// [PERF] select('*')는 ai_analysis·preview_urls 등 무거운 컬럼까지 끌고 와 홈 HTML이 1.3MB에 달했음
// → HomeClient가 실제 쓰는 컬럼만 선택 (HTML ~250KB 목표)
const HOME_COLUMNS =
    'id, title, school, grade, semester, subject, exam_type, exam_year, file_type, content_type, '
    + 'created_at, price, uploader_name, region, district, free_pdf_url, preview_urls, is_verified';

/** 같은 연도 안에서 시험 순서: 1학기 중간(2) < 1학기 기말(3) < 2학기 중간(4) < 2학기 기말(5) */
export function examTermRank(item: { semester?: unknown; exam_type?: unknown }): number {
    const sem = Number(String(item.semester ?? '').replace(/[^0-9]/g, '')) || 0;
    const kind = String(item.exam_type ?? '');
    return sem * 2 + (kind.includes('기말') ? 1 : 0);
}

async function loadHomeExams() {
    const supabase = createAdminClient();
    // ⚠ PostgREST 는 max-rows(1000)에서 조용히 잘린다. range() 로 페이지네이션하지 않으면
    //   created_at DESC 기준 최신 1000건만 실려, 오래된 자료가 홈 검색에서 통째로 사라진다.
    //   (8/24 발견: 전체 1,415건 중 415건 누락. 풍문고 자료가 1093~1095번째라
    //    "현황판엔 있는데 내신기출탭에서 안 보인다"는 제보로 드러났다.)
    let data: any[] = [];
    let from = 0;
    while (true) {
        const { data: page, error } = await supabase
            .from('exam_materials')
            .select(HOME_COLUMNS)
            .neq('school', 'DELETED')
            // 모의고사 계열은 어차피 아래 isMockExam 으로 버려진다. 받아놓고 버리지 말고
            // DB 에서 걸러 143건을 덜 실어온다(페이지네이션으로 늘어난 부담을 일부 상쇄).
            // 제목에 '모의고사'가 든 예외는 아래 JS 필터가 마저 잡는다.
            .not('school', 'in', `(${FREE_EXAM_SCHOOLS.map((s) => `"${s}"`).join(',')})`)
            .not('exam_type', 'in', '("모의고사","수능","입학시험")')
            .order('created_at', { ascending: false }).order('id')
            .range(from, from + 999);
        if(error)throw error;
        if (!page || page.length === 0) break;
        data = data.concat(page);
        if (page.length < 1000) break;
        from += 1000;
    }
    // [크롤예산] 자료가 1,200건을 넘으며 홈 HTML 이 744KB 까지 커졌고, 그 93%가 이 목록 데이터였다.
    // Googlebot 은 사이트별 크롤 예산 안에서 움직이므로 홈이 무거우면 나머지 페이지가 밀린다
    // (8/18 GSC: '발견됨-색인 생성 안 됨' 89개. 홈에서 직접 링크된 /predict 조차 미크롤).
    // → 다운로드할 때만 필요한 값은 목록에서 빼고, 그 시점에 id 로 조회한다.
    //   free_pdf_url 은 버튼 노출 조건이라 존재 여부(boolean)만 남긴다.
    //   created_at 은 화면에서 날짜만 쓰므로 시각을 잘라 보낸다.
    //   그리고 필드명은 행마다 반복될 뿐이라 값만 배열로 보낸다(HOME_FIELDS 순서 규약).
    //   측정: 객체 배열 645KB 중 키 이름이 248KB(38.5%)였다.
    // [2026-10-02] 교체(문항 id 유지 재등록)는 행을 새로 만들지 않아 created_at 이 그대로다.
    //   교체 후속(scratch_replace_followup.py)이 미리보기 주소에 ?v=<교체 시각(초)> 를 붙이므로 그걸 교체일로 쓴다.
    //   ?v= 는 그 스크립트만 붙인다(10/2 확인: 오늘 찍힌 134회차 모두 판매파일도 같은 날 새로 올라감).
    const replacedDate = (urls: unknown): string | null => {
        let latest = 0;
        for (const u of Array.isArray(urls) ? urls : []) {
            const m = typeof u === 'string' ? u.match(/[?&]v=(\d{10})(?!\d)/) : null;
            if (m) latest = Math.max(latest, Number(m[1]));
        }
        return latest ? new Date(latest * 1000 + 9 * 3600 * 1000).toISOString().slice(0, 10) : null;
    };
    // [10/5] 최신 '시험' 순(사용자 요청) — 올린 날짜 순이면 오늘 올린 작년 시험지가 맨 위에 온다.
    //   시험 연도 → 학기·시험(2학기 기말 > 2학기 중간 > 1학기 기말 > 1학기 중간) → 올린 날짜.
    //   홈 첫 화면은 이 순서의 앞 120건만 서버에서 그리므로(page.tsx) 여기서 정렬해야 첫 화면이 맞는다.
    return (data || []).filter((item: any) => !isMockExam(item))
        .sort((a: any, b: any) => (Number(b.exam_year) || 0) - (Number(a.exam_year) || 0)
            || examTermRank(b) - examTermRank(a)
            || String(b.created_at).localeCompare(String(a.created_at)))
        .map((item: any) => {
        const { free_pdf_url, preview_urls, ...rest } = item;
        return packHomeRow({
            ...rest,
            // 한국 날짜로 자른다. UTC 로 자르면 오전 9시 전 등록분이 전날로 찍힌다(9/28 새벽 등록분이 9/27 로 보였다).
            created_at: typeof rest.created_at === 'string'
                ? new Date(Date.parse(rest.created_at) + 9 * 3600 * 1000).toISOString().slice(0, 10)
                : rest.created_at,
            has_free_pdf: !!free_pdf_url, has_preview: Array.isArray(preview_urls)&&preview_urls.length>0,
            replaced_at: replacedDate(preview_urls),
        });
    });
}


export const getHomeExams=unstable_cache(loadHomeExams,['home-catalog-v3'],{revalidate:3600,tags:['home-catalog']});
