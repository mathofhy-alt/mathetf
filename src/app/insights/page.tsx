import Header from '@/components/Header';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { INSIGHT_REPORTS } from '@/lib/seo-insights';

export const metadata = {
    title: '수학 내신 출제 동향 | 수학ETF',
    description: '수학ETF가 보유한 실제 고등학교 시험지의 문항 분류를 집계한 출제 동향 보고서입니다. 표본과 집계 방법을 함께 공개합니다.',
    alternates: { canonical: '/insights' },
};

export default function InsightsPage() {
    return <div className="rd rd-x"><Header />
        <main className="rd-ct-main">
            <section className="rd-wrap rd-x-top rd-ct-top">
                <p className="rd-kicker">수학ETF 데이터 리포트</p>
                <h1 className="rd-x-h1 rd-ct-h1">고등학교 수학 출제 동향</h1>
                <p className="rd-lead rd-ct-lead">실제 보유 시험지의 문항 분류를 집계했습니다. 원문·정답·해설은 보고서에 싣지 않으며, 표본과 집계 범위를 각 보고서에 표시합니다.</p>
            </section>
            <section className="rd-wrap rd-ct-list" aria-label="출제 동향 보고서 목록">
                <div className="rd-ct-cards">
                    {INSIGHT_REPORTS.map(report => <Link key={report.slug} href={`/insights/${report.slug}`} className="rd-ct-card">
                        <h2>{report.title}</h2>
                        <p>{report.description}</p>
                        <span className="rd-ct-go">보고서 보기<ChevronRight size={18} aria-hidden="true" /></span>
                    </Link>)}
                </div>
            </section>
            <div className="rd-x-more rd-s-more"><div className="rd-wrap rd-x-links">
                <Link href="/insights/methodology" className="rd-link">집계·분류 방법 확인</Link>
            </div></div>
        </main>
    </div>;
}
