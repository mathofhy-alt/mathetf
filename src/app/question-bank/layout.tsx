import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: '수학 문제은행 - 시험지 만들기 | 수학ETF',
    description: '수학 문제은행에서 내신·전국연합학력평가 모의고사·경찰대·사관학교 수학 기출문제를 골라 나만의 시험지를 만드세요. 고1·고2·고3 수학 기출문제 검색 및 조합.',
    keywords: [
        '수학 문제은행', '수학 시험지 만들기', '수학 기출문제 검색',
        '고등학교 수학 문제은행', '수학 내신 문제은행',
        '전국연합학력평가 수학', '수학 모의고사 문제', '3월 모의고사 수학', '6월 모의고사 수학', '9월 모의고사 수학',
        '경찰대 수학 기출', '경찰대 수학 문제',
        '사관학교 수학 기출', '육군사관학교 수학', '해군사관학교 수학', '공군사관학교 수학',
        '수학 기출문제 다운로드', '수학 HWP 다운로드'
    ],
    alternates: {
        canonical: '/question-bank',
    },
    openGraph: {
        title: '수학 문제은행 - 시험지 만들기 | 수학ETF',
        description: '내신·모의고사·경찰대·사관학교 수학 기출문제를 골라 나만의 시험지를 만드세요.',
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

