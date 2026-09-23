import Link from 'next/link';
import Header from '@/components/Header';

// [2026-09-14 전수조사] 없는 주소로 오면 Next 기본 화면("404: This page could not be found.", 검은 배경, 영문)이 떴다.
//   외부 리뷰어 둘 다 지적. 사이트 헤더를 유지하고 한국어로, 갈 곳을 준다.
export const metadata = { title: '페이지를 찾을 수 없어요 | 수학ETF', robots: { index: false, follow: true } };

export default function NotFound() {
    return (
        <div className="min-h-screen bg-[#F2F3F0] text-[#294437] font-sans">
            <Header />
            <main className="max-w-2xl mx-auto px-4 py-20 text-center">
                <p className="text-6xl font-black text-[#C5D8B5]">404</p>
                <h1 className="text-2xl font-black mt-4 break-keep">페이지를 찾을 수 없어요</h1>
                <p className="text-slate-500 mt-3 break-keep">
                    주소가 바뀌었거나, 자료가 정리되면서 옮겨졌을 수 있어요.
                </p>
                <div className="flex flex-wrap justify-center gap-3 mt-8">
                    <Link href="/" className="px-5 py-3 bg-[#426D36] text-white font-bold rounded-xl shadow-sm hover:bg-[#3A659A] transition-colors">홈으로</Link>
                    <Link href="/schools" className="px-5 py-3 bg-white border border-slate-200 font-bold rounded-xl hover:border-[#C5D8B5] transition-colors">학교별 기출 찾기</Link>
                    <Link href="/question-bank" className="px-5 py-3 bg-white border border-slate-200 font-bold rounded-xl hover:border-[#C5D8B5] transition-colors">시험지 만들기</Link>
                </div>
            </main>
        </div>
    );
}
