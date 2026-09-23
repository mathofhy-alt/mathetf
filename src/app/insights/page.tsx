import Header from '@/components/Header';
import Link from 'next/link';
import { INSIGHT_REPORTS } from '@/lib/seo-insights';

export const metadata = {
    title: '수학 내신 출제 동향 | 수학ETF',
    description: '수학ETF가 보유한 실제 고등학교 시험지의 문항 분류를 집계한 출제 동향 보고서입니다. 표본과 집계 방법을 함께 공개합니다.',
    alternates: { canonical: '/insights' },
};

export default function InsightsPage() {
    return <div className="min-h-screen bg-[#F2F3F0] text-[#294437]"><Header />
        <main className="max-w-3xl mx-auto px-4 py-10">
            <p className="text-sm font-semibold text-[#426D36]">수학ETF 데이터 리포트</p>
            <h1 className="text-3xl font-black text-slate-900 mt-2 mb-3">고등학교 수학 출제 동향</h1>
            <p className="text-slate-600 leading-relaxed mb-8">실제 보유 시험지의 문항 분류를 집계했습니다. 원문·정답·해설은 보고서에 싣지 않으며, 표본과 집계 범위를 각 보고서에 표시합니다.</p>
            <div className="grid gap-4">
                {INSIGHT_REPORTS.map(report => <Link key={report.slug} href={`/insights/${report.slug}`} className="block bg-white rounded-2xl border border-slate-200 p-6 shadow-sm hover:border-[#426D36]">
                    <h2 className="text-xl font-bold text-slate-900">{report.title}</h2>
                    <p className="text-sm text-slate-600 mt-2">{report.description}</p>
                    <span className="inline-block text-sm text-[#426D36] font-bold mt-4">보고서 보기 →</span>
                </Link>)}
            </div>
            <Link href="/insights/methodology" className="inline-block text-sm text-[#426D36] underline mt-7">집계·분류 방법 확인</Link>
        </main>
    </div>;
}
