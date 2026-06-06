import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: '수학 시험지 만들기 - 기출 유사문제 자동 매칭 | 수학ETF',
    description: '기출문제를 고르면 같은 유형의 유사 문항을 자동으로 찾아 시험지에 넣어드립니다. 전국 내신·전국연합 모의고사 기출로 나만의 수학 시험지를 1분 만에 완성하세요.',
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
        title: '수학 시험지 만들기 - 기출 유사문제 자동 매칭 | 수학ETF',
        description: '기출문제를 고르면 같은 유형의 유사 문항을 자동으로 찾아 시험지에 넣어드립니다. 나만의 수학 시험지를 1분 만에.',
        url: 'https://mathetf.com/question-bank',
    },
};

export default function QuestionBankLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return <>{children}</>;
}

