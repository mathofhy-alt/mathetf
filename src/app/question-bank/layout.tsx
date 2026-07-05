import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: '수학 문제은행 - 기출로 나만의 시험지 무료 제작 | 수학ETF',
    description: '전국 중·고 내신·전국연합 모의고사 수학 기출 문제은행. 원하는 문제를 골라 유사문제까지 자동으로 채우고, 나만의 수학 시험지를 1분 만에 만들어 HWP·PDF로 무료 다운로드하세요.',
    keywords: [
        '수학 시험지 만들기', '수학 시험지 제작', '기출 유사문제', '수학 유사문제',
        '수학 문제은행', '수학 기출문제 검색',
        '고등학교 수학 문제은행', '수학 내신 문제은행',
        '전국연합학력평가 수학', '수학 모의고사 문제', '3월 모의고사 수학', '6월 모의고사 수학', '9월 모의고사 수학',
        '경찰대 수학 기출', '사관학교 수학 기출',
        '수학 기출문제 다운로드', '수학 HWP 다운로드'
    ],
    alternates: {
        canonical: '/question-bank',
    },
    openGraph: {
        title: '수학 문제은행 - 기출로 나만의 시험지 무료 제작 | 수학ETF',
        description: '전국 내신·모의고사 수학 기출 문제은행. 원하는 문제를 골라 유사문제까지 자동으로 채우고 나만의 수학 시험지를 1분 만에 무료로 만드세요.',
        url: 'https://mathetf.com/question-bank',
        images: ['/og-image.png'],
    },
};

export default function QuestionBankLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <>
            {/* SEO: 전체화면 툴이라 화면엔 본문을 못 넣어 크롤러·스크린리더용 정식 H1/설명을 제공 */}
            <section className="sr-only">
                <h1>수학 시험지 만들기 — 기출·유사문제로 나만의 수학 시험지 제작</h1>
                <p>
                    전국 중·고등학교 수학 내신 기출과 전국연합학력평가·평가원·수능·사관학교·경찰대 기출을 검색해,
                    원하는 문제를 골라 1분 만에 나만의 수학 시험지를 만들 수 있습니다.
                    과목·단원·난이도·키워드로 문제를 좁히고, 같은 유형의 유사문제를 자동으로 채워 시험지를 완성한 뒤
                    한글(HWP)·PDF로 다운로드하세요. 회원가입 시 문제 미리보기와 워터마크 없는 문제 PDF를 무료로 받을 수 있습니다.
                </p>
            </section>
            {children}
        </>
    );
}

