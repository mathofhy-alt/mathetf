import PageHeading from "@/components/PageHeading";
import MockLibrary from "@/components/mock/MockLibrary";
import Link from 'next/link';
import { Metadata } from 'next';
import { ArrowRight } from 'lucide-react';
import Header from '@/components/Header';
import MockExamCard, { MockCategory, MOCK_CATEGORIES, CATEGORY_DESC } from '@/components/mock/MockExamCard';
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
 const all=await fetchAllMockExams();
 return <div className="mock-library-page"><Header/><main className="suite-container">
  <PageHeading eyebrow="THE EXAM LIBRARY" title="더 넓은 수학의 세계." description="수능부터 사관학교까지. 필요한 회차를 찾고, 기출과 변형문제로 다음 시험을 준비하세요."><MockUploadButton/></PageHeading>
  <MockLibrary exams={all}/>
  <div className="mock-guide-links">{ORDER.map(c=><Link key={c} href={`/모의고사/${c}`}>{c} 자료실 <ArrowRight size={13}/></Link>)}<Link href="/study/common-math-2">공통수학2 예습 가이드</Link><Link href="/study/calculus-1">미적분I 예습 가이드</Link></div>
 </main></div>;
}
