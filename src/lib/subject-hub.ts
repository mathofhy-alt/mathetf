import { createAdminClient } from '@/utils/supabase/server-admin';

/**
 * 과목 허브 페이지(/subject/[subject])용 실측 데이터.
 *
 * [왜 만드나 — 2026-08-29 실측]
 * 네이버 월간 검색량: 공통수학2 7,880 · 공통수학1 5,410.
 * 그런데 '공통수학2기출' 은 55, '공통수학1기출' 은 15 밖에 안 된다.
 * → 사람들은 '기출' 을 붙여 찾지 않고 **과목명 자체**를 찾는다.
 *   2025년 교육과정 개편으로 새로 생긴 이름이라 "이 과목이 뭔지" 를 찾는 정보성 검색이다.
 *   그 검색을 받아 자료로 이어줄 페이지가 지금 없다(/study 는 예습 가이드 2개뿐).
 *
 * [무엇을 싣나]
 * 전부 우리가 분류한 데이터에서 나온다 — 문항수·학교수·단원 분포·난이도 분포·개념 태그.
 * 남의 시험지를 옮기는 게 아니라 14,394문항을 분류해 얻은 우리 통계라 저작권 문제가 없고,
 * 다른 곳이 낼 수 없는 글이다.
 *
 * [4개만 만드는 이유]
 * 학교 수가 받쳐주는 과목이 넷뿐이다(공통수학1 120교 · 공통수학2 112교 · 수학I 81교 · 수학II 81교).
 * 나머지는 2~8개교라 페이지를 만들면 씬페이지가 된다. 사용자가 씬페이지 양산을 명시적으로 거부했다.
 */

export const HUB_SUBJECTS = ['공통수학1', '공통수학2', '수학I', '수학II'] as const;
export type HubSubject = (typeof HUB_SUBJECTS)[number];

/** 과목이 어느 학년 어느 학기 것인지 — 검색 의도('이 과목이 뭐냐')에 답하는 사실 정보 */
/** 과목명 뒤 조사. 공통수학1='일'(받침 ㄹ)→은, 공통수학2='이'→는 처럼 읽는 소리로 갈린다. */
export const SUBJECT_INFO: Record<HubSubject, { grade: string; when: string; blurb: string; eun: '은' | '는' }> = {
    '공통수학1': {
        eun: '은',
        grade: '고등학교 1학년',
        when: '1학기',
        blurb: '2022 개정 교육과정에서 고1 1학기에 배우는 과목입니다. 옛 교육과정의 「수학(상)」에 해당하며 다항식·방정식과 부등식·경우의 수·행렬을 다룹니다.',
    },
    '공통수학2': {
        eun: '는',
        grade: '고등학교 1학년',
        when: '2학기',
        blurb: '2022 개정 교육과정에서 고1 2학기에 배우는 과목입니다. 옛 교육과정의 「수학(하)」에 해당하며 도형의 방정식·집합과 명제·함수와 그래프를 다룹니다.',
    },
    '수학I': {
        eun: '은',
        grade: '고등학교 2학년',
        when: '1학기',
        blurb: '지수와 로그·삼각함수·수열을 다룹니다. 수능 공통과목이라 내신과 수능 대비가 함께 갑니다.',
    },
    '수학II': {
        eun: '는',
        grade: '고등학교 2학년',
        when: '2학기',
        blurb: '함수의 극한과 연속·미분·적분을 다룹니다. 수능 공통과목이며 미적분의 기초가 되는 과목입니다.',
    },
};

export type SubjectHub = {
    subject: string;
    total: number;
    schoolCount: number;
    byUnit: { unit: string; count: number }[];
    easy: number; mid: number; hard: number;
    concepts: string[];
    schools: string[];
    exams: { id: string; school: string; year: number; grade: number; semester: number; examType: string }[];
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
                .select('unit, difficulty, key_concepts, school')
                .eq('work_status', 'sorted')
                .eq('subject', subject)
                .range(from, from + PAGE - 1);
            if (error) throw error;
            const got = data || [];
            rows.push(...got);
            if (got.length < PAGE) break;
        }
        if (rows.length === 0) return null;

        const unitMap: Record<string, number> = {};
        const conceptCount: Record<string, number> = {};
        const schoolSet = new Set<string>();
        let easy = 0, mid = 0, hard = 0;

        for (const q of rows) {
            const unit = (q.unit || '기타').toString();
            unitMap[unit] = (unitMap[unit] || 0) + 1;
            if (q.school) schoolSet.add(q.school);
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
        const { data: mats } = await supabase
            .from('exam_materials')
            .select('id, school, exam_year, grade, semester, exam_type')
            .eq('subject', subject)
            .eq('file_type', 'PDF')
            .eq('content_type', '해설')
            .neq('school', 'DELETED')
            .order('exam_year', { ascending: false })
            .limit(300);

        return {
            subject,
            total: rows.length,
            schoolCount: schoolSet.size,
            byUnit: Object.entries(unitMap).map(([unit, count]) => ({ unit, count }))
                .sort((a, b) => b.count - a.count),
            easy, mid, hard,
            concepts: Object.entries(conceptCount).sort((a, b) => b[1] - a[1]).slice(0, 40).map(([c]) => c),
            schools: Array.from(schoolSet).sort(),
            exams: (mats || []).map((m: any) => ({
                id: m.id, school: m.school, year: m.exam_year,
                grade: m.grade, semester: m.semester, examType: m.exam_type,
            })),
        };
    } catch (e) {
        console.error('[getSubjectHub]', subject, e);
        return null;
    }
}
