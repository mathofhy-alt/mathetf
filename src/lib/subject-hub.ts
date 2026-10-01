import { createAdminClient } from '@/utils/supabase/server-admin';
import { NOT_A_SCHOOL } from '@/lib/stats';

/** 실제 분류 문항 또는 내신 시험지가 등록된 과목. 과거 교육과정 명칭도 구분한다. */
export const HUB_SUBJECTS = ['공통수학1', '공통수학2', '대수', '미적분I', '미적분II', '확률과통계', '기하', '수학(상)', '수학(하)', '수학I', '수학II', '미적분', '기하와벡터'] as const;
export type HubSubject = (typeof HUB_SUBJECTS)[number];
export const SUBJECT_INFO: Record<HubSubject, { grade: string; when: string; blurb: string; eun: '은' | '는' }> = {
 '공통수학1': {grade:'고등학교',when:'공통 과목',eun:'은',blurb:'2022 개정 교육과정의 공통 과목입니다. 다항식·방정식과 부등식·경우의 수·행렬을 다룹니다. 학교별 시험 범위는 원본에서 확인하세요.'},
 '공통수학2': {grade:'고등학교',when:'공통 과목',eun:'는',blurb:'2022 개정 교육과정의 공통 과목입니다. 도형의 방정식·집합과 명제·함수와 그래프를 다룹니다. 학교별 시험 범위는 원본에서 확인하세요.'},
 '대수': {grade:'고등학교',when:'선택 과목',eun:'는',blurb:'지수와 로그·삼각함수·수열 관련 기출을 찾아볼 수 있습니다. 과거 수학I 자료와 등록 명칭을 구분해 확인하세요.'},
 '미적분I': {grade:'고등학교',when:'등록 과목 분류',eun:'은',blurb:'미적분I로 분류된 기출 문항을 모았습니다. 교육과정과 연도에 따라 과목 범위가 다를 수 있으므로 원본 범위를 확인하세요.'},
 '미적분II': {grade:'고등학교',when:'등록 과목 분류',eun:'는',blurb:'미적분II로 분류된 기출 문항을 모았습니다. 교육과정과 연도에 따라 과목 범위가 다를 수 있으므로 원본 범위를 확인하세요.'},
 '확률과통계': {grade:'고등학교',when:'선택 과목',eun:'는',blurb:'경우의 수·확률·통계 관련 기출을 찾아볼 수 있습니다. 학년과 이수 시기는 학교마다 다르므로 해당 시험 범위를 확인하세요.'},
 '기하': {grade:'고등학교',when:'선택 과목',eun:'는',blurb:'기하로 등록된 시험지와 분류 문항을 모았습니다. 교육과정과 학교별 진도에 따라 시험 범위가 다르므로 원본을 확인하세요.'},
 '수학(상)': {grade:'고등학교',when:'과거 교육과정 자료',eun:'은',blurb:'수학(상)으로 등록된 과년도 기출입니다. 현재 공통수학1·공통수학2와 범위가 일치하지 않으므로 필요한 단원을 확인해 활용하세요.'},
 '수학(하)': {grade:'고등학교',when:'과거 교육과정 자료',eun:'는',blurb:'수학(하)로 등록된 과년도 기출입니다. 현재 과목과 범위가 일치하지 않으므로 필요한 단원을 확인해 활용하세요.'},
 '수학I': {grade:'고등학교',when:'등록 과목 분류',eun:'은',blurb:'지수와 로그·삼각함수·수열 관련 기출을 찾아볼 수 있습니다. 학년·학기·시험 범위는 학교별 자료를 확인하세요.'},
 '수학II': {grade:'고등학교',when:'등록 과목 분류',eun:'는',blurb:'함수의 극한과 연속·미분·적분 관련 기출을 찾아볼 수 있습니다. 학년·학기·시험 범위는 학교별 자료를 확인하세요.'},
 '미적분': {grade:'고등학교',when:'등록 과목 분류',eun:'은',blurb:'미적분으로 등록된 기출 문항을 모았습니다. 미적분I·미적분II 분류와 별도로 제공하며 실제 시험 범위는 원본을 확인하세요.'},
 '기하와벡터': {grade:'고등학교',when:'과거 교육과정 자료',eun:'는',blurb:'기하와벡터로 분류된 과년도 기출 문항입니다. 현재 기하 과목과 범위가 일치하지 않으므로 필요한 단원을 확인해 활용하세요.'},
};

export type SubjectHub = {
    subject: string;
    total: number;
    schoolCount: number;
    /** 시험별 문항 수. 우리 자료가 한쪽에 쏠려 있어서 반드시 같이 보여준다(아래 주석). */
    midtermCount: number;
    finalCount: number;
    /** 단원 분포를 시험별로 나눈 것. 합쳐 놓으면 '과목의 출제 분포' 처럼 읽혀 사실과 달라진다. */
    byUnit: { unit: string; count: number; midterm: number; final: number }[];
    easy: number; mid: number; hard: number;
    concepts: string[];
    schools: string[];
    exams: { id: string; school: string; year: number; grade: number; semester: number; examType: string; region?: string; district?: string; hasFreePdf: boolean; hasPreview: boolean }[];
};

const PAGE = 1000;

export async function getSubjectHub(subject: string): Promise<SubjectHub | null> {
    if (!(HUB_SUBJECTS as readonly string[]).includes(subject)) return null;
    const supabase = createAdminClient();

    try {
        // ⚠ PostgREST 는 한 요청에 1,000행만 준다. 공통수학1 만 4,177문항이라 반드시 range 로 훑는다.
        //   (같은 함정으로 8/29 에 '학교 기출 8개' 가 화면에 떠 있었다 — lib/stats.ts 주석 참고)
        const rows: any[] = [];
        for (let from = 0; from < 20000; from += PAGE) {
            const { data, error } = await supabase
                .from('questions')
                .select('unit, difficulty, key_concepts, school, source_db_id')
                .eq('work_status', 'sorted')
                .eq('subject', subject)
                .range(from, from + PAGE - 1);
            if (error) throw error;
            const got = data || [];
            rows.push(...got);
            if (got.length < PAGE) break;
        }
        if (rows.length === 0) return null;

        // ⚠ 우리 자료는 시험별로 심하게 쏠려 있다(2026-08-29 실측).
        //   공통수학2 중간 2,377 / 기말 48   · 수학II 중간 1,717 / 기말 0
        //   수학I  중간 89 / 기말 1,916      · 공통수학1 도 기말 쪽이 훨씬 많다
        //   그래서 단원 분포를 합쳐서 내면 '과목의 실제 출제 분포' 가 아니라
        //   '우리가 가진 회차의 분포' 가 된다. 수학II 는 적분이 통째로 빠져 보인다.
        //   → 시험별로 나눠서 세고, 화면에서도 나눠 보여준다. (사용자(수학 강사) 지적, 8/29)
        const unitMap: Record<string, { count: number; midterm: number; final: number }> = {};
        let midtermCount = 0, finalCount = 0;
        const conceptCount: Record<string, number> = {};
        const schoolSet = new Set<string>();
        let easy = 0, mid = 0, hard = 0;

        for (const q of rows) {
            const unit = (q.unit || '기타').toString();
            // source_db_id 형식: {학교}_{연도}_{학기}{중간|기말}_{과목}
            const sid = String(q.source_db_id || '');
            const isFinal = sid.includes('기말');
            const isMid = sid.includes('중간');
            if (isFinal) finalCount++; else if (isMid) midtermCount++;
            const cur = unitMap[unit] || (unitMap[unit] = { count: 0, midterm: 0, final: 0 });
            cur.count++;
            if (isFinal) cur.final++; else if (isMid) cur.midterm++;
            if (q.school && !NOT_A_SCHOOL.has(q.school)) schoolSet.add(q.school);   // [2026-09-14] 전국연합 등은 학교가 아니다
            const d = Number(q.difficulty) || 0;
            // exam 상세와 같은 구간 보정 (분류기가 1~3에 몰리는 하향 편향)
            if (d <= 2) easy++; else if (d <= 4) mid++; else hard++;
            const kc = q.key_concepts;
            const arr = Array.isArray(kc) ? kc : typeof kc === 'string' ? [kc] : [];
            for (const c of arr) {
                const t = String(c).replace(/^#/, '').trim();
                if (t) conceptCount[t] = (conceptCount[t] || 0) + 1;
            }
        }

        // 이 과목의 시험지 목록 (대표 페이지만 — PDF·해설)
        const mats: any[] = [];
        for (let from = 0; ; from += PAGE) {
            const { data, error } = await supabase.from('exam_materials')
                .select('id, school, exam_year, grade, semester, exam_type, region, district, free_pdf_url, preview_urls')
                .eq('subject', subject).eq('file_type', 'PDF').eq('content_type', '해설')
                .neq('school', 'DELETED').in('exam_type', ['중간고사', '기말고사'])
                .order('exam_year', { ascending: false }).order('id').range(from, from + PAGE - 1);
            if (error) throw error;
            mats.push(...(data || []));
            if (!data || data.length < PAGE) break;
        }

        return {
            subject,
            total: rows.length,
            schoolCount: schoolSet.size,
            midtermCount, finalCount,
            byUnit: Object.entries(unitMap).map(([unit, v]) => ({ unit, ...v }))
                .sort((a, b) => b.count - a.count),
            easy, mid, hard,
            concepts: Object.entries(conceptCount).sort((a, b) => b[1] - a[1]).slice(0, 40).map(([c]) => c),
            schools: Array.from(schoolSet).sort(),
            exams: (mats || []).map((m: any) => ({
                id: m.id, school: m.school, year: m.exam_year,
                grade: m.grade, semester: m.semester, examType: m.exam_type,
                region: m.region, district: m.district, hasFreePdf: Boolean(m.free_pdf_url),
                hasPreview: Array.isArray(m.preview_urls) && m.preview_urls.length > 0,
            })),
        };
    } catch (e) {
        console.error('[getSubjectHub]', subject, e);
        return null;
    }
}
