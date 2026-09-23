// 2026-09-24 운영 DB 읽기 전용 집계 스냅샷.
// exam_materials: 2025년, PDF/해설, 공개 미리보기 존재, DELETED 제외.
// questions: 학교_연도_학기중간|기말_과목 source_db_id로 일치하는 문항만 포함.
// 단원·난이도는 자동 분류 결과이며 교사 검수 완료를 뜻하지 않는다.
export type InsightReport = {
    slug: string;
    title: string;
    description: string;
    lead: string;
    groups: {
        label: string;
        schools: number;
        questions: number;
        units: { name: string; count: number }[];
        difficulty: { easy: number; mid: number; hard: number };
        examples: { id: string; school: string }[];
    }[];
};

export const INSIGHT_REPORTS: InsightReport[] = [
    {
        slug: '2025-common-math-1',
        title: '2025년 고1 공통수학1 1학기 출제 동향',
        description: '공개 미리보기가 있고 문항 분류가 연결된 고1 공통수학1 중간·기말고사의 단원 및 난이도 분포.',
        lead: '같은 과목의 1학기 중간과 기말을 각각 집계했습니다. 두 집단의 학교 수가 다르므로 변화량을 동일 학교의 출제 경향 변화로 해석할 수는 없습니다.',
        groups: [
            {
                label: '1학기 중간고사', schools: 45, questions: 966,
                units: [
                    { name: '이차함수', count: 219 }, { name: '다항식', count: 217 },
                    { name: '항등식', count: 184 }, { name: '이차방정식', count: 141 },
                    { name: '복소수', count: 138 }, { name: '여러가지방정식', count: 54 },
                    { name: '순열조합', count: 7 }, { name: '여러가지부등식', count: 6 },
                ],
                difficulty: { easy: 487, mid: 301, hard: 178 },
                examples: [
                    { id: 'f2c2e99f-bb81-4209-92f2-540ac19b6c89', school: '영파여자고등학교' },
                    { id: '6e29056b-988c-4889-b63a-ec5ee1b9176b', school: '가락고등학교' },
                    { id: 'ecfd5e5e-a1a1-4448-8cd2-da47e293ec54', school: '배명고등학교' },
                ],
            },
            {
                label: '1학기 기말고사', schools: 117, questions: 2546,
                units: [
                    { name: '순열조합', count: 825 }, { name: '여러가지부등식', count: 575 },
                    { name: '행렬', count: 567 }, { name: '여러가지방정식', count: 408 },
                    { name: '이차함수', count: 89 }, { name: '이차방정식', count: 38 },
                    { name: '복소수', count: 15 }, { name: '다항식', count: 14 },
                    { name: '항등식', count: 12 }, { name: '평면좌표', count: 2 },
                    { name: '여러가지순열', count: 1 },
                ],
                difficulty: { easy: 1035, mid: 1041, hard: 470 },
                examples: [
                    { id: '751adb92-a57c-4261-a2a7-a2aa4cc9a194', school: '은광여자고등학교' },
                    { id: '46af1b3a-eaf1-4555-ac0c-d054dc79c786', school: '잠실여자고등학교' },
                    { id: 'daa00e35-255e-495a-ab51-dfda1a9c79cd', school: '보인고등학교' },
                ],
            },
        ],
    },
    {
        slug: '2025-math-1-final',
        title: '2025년 고2 수학I 1학기 기말 출제 동향',
        description: '80개교 1,742문항에서 확인한 수열·삼각함수 단원 비중과 자동 분류 난이도 분포.',
        lead: '공개 미리보기가 있고 문항 DB가 연결된 80개교의 1학기 기말고사를 집계했습니다. 등록 문항 기준으로 등차등비수열과 삼각함수활용이 전체의 절반을 넘습니다.',
        groups: [{
            label: '1학기 기말고사', schools: 80, questions: 1742,
            units: [
                { name: '등차등비수열', count: 523 }, { name: '삼각함수활용', count: 461 },
                { name: '수열의합', count: 311 }, { name: '수학적귀납법', count: 277 },
                { name: '삼각함수그래프', count: 81 }, { name: '삼각함수', count: 58 },
                { name: '로그함수', count: 12 }, { name: '지수', count: 8 },
                { name: '지수함수', count: 7 }, { name: '로그', count: 3 },
                { name: '평면좌표', count: 1 },
            ],
            difficulty: { easy: 524, mid: 664, hard: 554 },
            examples: [
                { id: '0332ff3c-5b4f-48aa-9aa4-716eba9140b7', school: '세화고등학교' },
                { id: '83df176e-1f2b-4413-a580-6291cb684672', school: '숙명여자고등학교' },
                { id: '4f2e64f0-9d34-4a34-b3e8-67946c9fe91d', school: '청원여자고등학교' },
            ],
        }],
    },
];

export const reportForExam = (row: {
    exam_year?: number | null; grade?: number | null; semester?: number | null;
    exam_type?: string | null; subject?: string | null;
}) => {
    if (Number(row.exam_year) !== 2025 || Number(row.semester) !== 1) return null;
    if (Number(row.grade) === 1 && row.subject === '공통수학1' && ['중간고사', '기말고사'].includes(row.exam_type || '')) return INSIGHT_REPORTS[0];
    if (Number(row.grade) === 2 && row.subject === '수학I' && row.exam_type === '기말고사') return INSIGHT_REPORTS[1];
    return null;
};
