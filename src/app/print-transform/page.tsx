import Header from '@/components/Header';
import { createClient } from '@/utils/supabase/server';
import PrintTransformClient from './PrintTransformClient';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: '학교프린트 변형만들기 - 수학 변형문제 자동 생성 | 수학ETF',
    description: '학교에서 받은 수학 프린트를 올리고 문제를 잘라내면, 같은 유형의 변형문제를 자동으로 찾아 한글파일로 만들어 드립니다.',
    keywords: [
        '학교프린트 변형', '수학 변형문제', '수학 변형문제 만들기', '변형문제 사이트',
        '수학 프린트 변형', '내신 변형문제', '수학 유사문제', '변형문제 한글파일',
    ],
    alternates: { canonical: '/print-transform' },
    openGraph: {
        title: '학교프린트 변형만들기 - 수학 변형문제 자동 생성 | 수학ETF',
        description: '학교 프린트를 올리고 문제를 잘라내면 같은 유형의 변형문제를 자동으로 찾아 한글파일로 만들어 드립니다.',
        url: 'https://mathetf.com/print-transform',
    },
};

export default async function PrintTransformPage() {
    let isLoggedIn = false;
    try {
        const sb = createClient();
        const { data: { user } } = await sb.auth.getUser();
        isLoggedIn = !!user;
    } catch { }

    return (
        <div className="min-h-screen bg-[#F8FAFD] text-[#1E2D4F] font-sans">
            <Header />
            {/* SEO: 비로그인 화면이 게이트 한 줄뿐이라 크롤러·스크린리더용 정식 H1/설명 제공 */}
            <section className="sr-only">
                <h1>학교프린트 변형만들기 — 수학 프린트 변형문제 자동 생성</h1>
                <p>
                    학교에서 받은 수학 프린트(PDF)를 올리고 원하는 문제를 드래그로 잘라내면,
                    AI가 문제의 단원과 유형을 인식해 전국 기출에서 같은 유형의 변형문제를 자동으로 찾아 드립니다.
                    마음에 드는 변형문제를 골라 담으면 문제와 해설이 담긴 한글(HWP) 파일로 즉시 다운로드할 수 있어요.
                    내신 대비로 학교 프린트를 한 번 더 연습하고 싶을 때, 같은 유형의 새 문제로 실전 감각을 키워 보세요.
                </p>
            </section>
            <PrintTransformClient isLoggedIn={isLoggedIn} />
        </div>
    );
}
