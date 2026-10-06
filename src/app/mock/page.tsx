import MockLibrary from "@/components/mock/MockLibrary";
import Link from 'next/link';
import { Metadata } from 'next';
import { ChevronRight } from 'lucide-react';
import Header from '@/components/Header';
import { MockCategory } from '@/components/mock/MockExamCard';
import MockUploadButton from '@/components/mock/MockUploadButton';
import { fetchAllMockExams } from '@/lib/mock-exams';

// [PERF] ISR — 업로드·수정·삭제는 revalidatePath로 즉시 반영되므로 주기 재생성은 보험용 1시간
export const revalidate = 3600;

export const metadata: Metadata = {
    title: '모의고사 수학 기출·변형문제 무료 다운로드 | 수학ETF',
    description: '전국연합학력평가·평가원 모의평가·수능·경찰대·사관학교 수학 기출과 변형문제를 PDF·HWP로 무료 제공합니다.',
    alternates: { canonical: '/모의고사' },
    openGraph: {
        title: '모의고사 수학 기출·변형문제 무료 다운로드 | 수학ETF',
        description: '전국연합학력평가·평가원 모의평가·수능·경찰대·사관학교 수학 기출과 변형문제를 PDF·HWP로 무료 제공합니다.',
        url: 'https://mathetf.com/모의고사',
        images: ['/og-image.png'],
    },
};

const ORDER: MockCategory[] = ['수능', '평가원', '전국연합', '경찰대', '사관학교'];

export default async function MockExamHubPage() {
    const all = await fetchAllMockExams();
    const counts = Object.fromEntries(ORDER.map(c => [c, all.filter(e => e.category === c).length]));
    return <div className="rd rd-x">
        <Header />
        <div>
            <section className="rd-wrap rd-x-top">
                <div className="rd-mk-hero">
                    <div>
                        <h1 className="rd-x-h1 rd-s-h1">수능·모의고사·사관학교<br />수학 기출</h1>
                        <p className="rd-lead">수능부터 사관학교·경찰대까지 {all.length}회차. 필요한 회차를 찾아 기출을 받고, 문항을 골라 시험지를 만드세요.</p>
                    </div>
                    <MockUploadButton />
                </div>
            </section>
            <section className="rd-wrap rd-s-list">
                <MockLibrary exams={all} />
            </section>
            <section className="rd-x-more" aria-labelledby="mock-more-title">
                <div className="rd-wrap">
                    <h2 id="mock-more-title" className="rd-x-h2">종류별 자료실</h2>
                    <div className="rd-x-rows">
                        {ORDER.map(c => <Link key={c} href={`/모의고사/${c}`} className="rd-x-row">
                            <span><b>{c} 자료실</b><small>{counts[c]}회차와 출제 분석</small></span>
                            <ChevronRight size={22} aria-hidden="true" />
                        </Link>)}
                    </div>
                    <div className="rd-x-links">
                        <Link href="/study/common-math-2" className="rd-link">공통수학2 예습 가이드</Link>
                        <Link href="/study/calculus-1" className="rd-link">미적분I 예습 가이드</Link>
                    </div>
                </div>
            </section>
        </div>
    </div>;
}
