// 방학 선행 랜딩 페이지(/study/[slug]) 콘텐츠 설정.
// 새 과목 추가 시 이 파일에 항목만 넣으면 페이지가 자동 생성된다.
// 각 페이지는 단원 지도·학습 순서 등 고유 설명 800자+ 로 순위 기반을 확보한다.

export interface StudyChapter {
    name: string;      // 대단원명
    blurb: string;     // 한 줄 설명
    units: string[];   // DB questions.unit 과 일치하는 소단원 (문항 수 집계용)
}

export interface StudyGuide {
    slug: string;
    subject: string;   // questions.subject (문항 수 집계 기준)
    gradeLabel: string;
    title: string;             // <title>
    metaDescription: string;
    keywords: string[];
    h1: string;
    lead: string;              // 히어로 소제목
    intro: string[];           // '왜 지금 예습?' 문단들
    chapters: StudyChapter[];
    roadmap: { weeks: string; focus: string }[];
    related: { href: string; label: string }[];
}

export const PREVIEW_GUIDES: Record<string, StudyGuide> = {
    'common-math-2': {
        slug: 'common-math-2',
        subject: '공통수학2',
        gradeLabel: '고1 2학기',
        title: '공통수학2 예습 — 고1 2학기 수학 선행 완전 가이드 | 수학ETF',
        metaDescription:
            '공통수학2 예습·고1 2학기 수학 선행 가이드. 도형의 방정식·집합과 명제·함수 단원 지도와 학습 순서, 방학 8주 로드맵, 우리 학교 기출 예상문제까지 한 번에.',
        keywords: [
            '공통수학2 예습', '고1 2학기 수학 선행', '공통수학2 선행', '공통수학2 유형',
            '고1 2학기 수학', '도형의 방정식', '집합과 명제', '공통수학2 기출',
        ],
        h1: '공통수학2 예습 — 고1 2학기 수학 선행 완전 가이드',
        lead: '여름방학에 미리 잡는 고1 2학기. 단원 지도부터 우리 학교 기출 예상문제까지 한 번에 준비하세요.',
        intro: [
            '공통수학2는 고1 2학기에 배우는 과목으로, 도형의 방정식·집합과 명제·함수의 세 축으로 구성됩니다. 1학기 공통수학1이 다항식·방정식 등 "식과 수의 계산"이 중심이었다면, 공통수학2는 좌표평면 위의 도형과 논리(명제), 함수의 성질로 넘어가면서 추상도가 한 단계 올라갑니다.',
            '특히 도형의 방정식은 이후 고2·고3 좌표기하 전반의 토대가 되고, 함수 단원(합성·역함수, 유리·무리함수)은 대수·미적분의 함수 감각으로 곧장 이어집니다. 그래서 여름방학에 공통수학2를 미리 훑어두면, 2학기에 "처음 배우면서 곧바로 시험까지 준비"해야 하는 부담을 크게 줄일 수 있습니다. 아래 단원 지도와 8주 로드맵을 따라 개념을 잡고, 마지막에 우리 학교 출제 스타일의 예상문제로 마무리하세요.',
        ],
        chapters: [
            {
                name: '① 도형의 방정식',
                blurb: '좌표평면에서 두 점 사이 거리·내분점, 직선과 원의 방정식, 평행·대칭이동까지. 공통수학2의 절반을 차지하는 핵심 단원.',
                units: ['평면좌표', '직선의방정식', '원의방정식', '도형의이동'],
            },
            {
                name: '② 집합과 명제',
                blurb: '집합의 연산과 원소 개수, 명제의 참·거짓과 역·대우, 필요충분조건, 절대부등식(산술·기하평균 등)까지 논리적 사고가 중요한 단원.',
                units: ['집합', '명제', '절대부등식'],
            },
            {
                name: '③ 함수',
                blurb: '함수의 정의·일대일대응, 합성함수와 역함수, 유리함수·무리함수의 그래프와 성질. 이후 모든 함수 학습의 기초.',
                units: ['함수', '합성함수와역함수', '유리함수', '무리함수'],
            },
        ],
        roadmap: [
            { weeks: '1–2주', focus: '평면좌표·직선의 방정식 — 거리·내분점·기울기, 두 직선의 위치관계' },
            { weeks: '3–4주', focus: '원의 방정식·도형의 이동 — 원과 직선, 평행이동·대칭이동' },
            { weeks: '5주', focus: '집합 — 연산·원소 개수·부분집합' },
            { weeks: '6주', focus: '명제·절대부등식 — 역·대우, 필요충분조건, 산술·기하평균' },
            { weeks: '7주', focus: '함수·합성함수·역함수' },
            { weeks: '8주', focus: '유리함수·무리함수 + 총정리 예상문제로 실전 점검' },
        ],
        related: [
            { href: '/schools', label: '우리 학교 기출 찾기' },
            { href: '/모의고사', label: '모의고사 기출·변형문제' },
            { href: '/question-bank', label: '직접 시험지 만들기' },
        ],
    },
};

export function getStudyGuide(slug: string): StudyGuide | undefined {
    return PREVIEW_GUIDES[slug];
}
