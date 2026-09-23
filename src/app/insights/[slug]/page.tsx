import Header from '@/components/Header';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { INSIGHT_REPORTS } from '@/lib/seo-insights';

type Props = { params: { slug: string } };
const share = (count: number, total: number) => `${(count / total * 100).toFixed(1)}%`;

export function generateStaticParams() {
    return INSIGHT_REPORTS.map(report => ({ slug: report.slug }));
}

export function generateMetadata({ params }: Props) {
    const report = INSIGHT_REPORTS.find(item => item.slug === params.slug);
    if (!report) return {};
    return {
        title: `${report.title} | 수학ETF`,
        description: report.description,
        alternates: { canonical: `/insights/${report.slug}` },
    };
}

export default function InsightReportPage({ params }: Props) {
    const report = INSIGHT_REPORTS.find(item => item.slug === params.slug);
    if (!report) notFound();
    const url = `https://mathetf.com/insights/${report.slug}`;
    const jsonLd = {
        '@context': 'https://schema.org', '@type': 'Article',
        headline: report.title, description: report.description, url,
        datePublished: '2026-09-24', dateModified: '2026-09-24',
        author: { '@type': 'Organization', name: '수학ETF' },
        publisher: { '@type': 'Organization', name: '수학ETF', url: 'https://mathetf.com' },
        inLanguage: 'ko',
    };
    return <div className="min-h-screen bg-[#F2F3F0] text-[#294437]"><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} /><Header />
        <main className="max-w-3xl mx-auto px-4 py-10">
            <Link href="/insights" className="text-sm text-[#426D36] hover:underline">← 출제 동향 전체</Link>
            <h1 className="text-3xl font-black text-slate-900 mt-4 mb-3 break-keep">{report.title}</h1>
            <p className="text-xs text-slate-500 mb-5">집계 기준일 2026년 9월 24일 · 수학ETF 운영 자료</p>
            <p className="text-slate-700 leading-relaxed mb-8">{report.lead}</p>
            {report.groups.map(group => <section key={group.label} className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-7 mb-6 shadow-sm">
                <h2 className="text-xl font-bold text-slate-900 mb-2">{group.label}</h2>
                <p className="text-sm text-slate-600 mb-5">분석 대상 <strong>{group.schools}개교</strong> · <strong>{group.questions.toLocaleString()}문항</strong></p>
                <h3 className="text-base font-bold mb-3">단원별 분포</h3>
                <div className="overflow-x-auto"><table className="w-full text-sm text-left"><thead><tr className="border-b border-slate-200"><th className="py-2">단원</th><th className="py-2 text-right">문항</th><th className="py-2 text-right">비중</th></tr></thead><tbody>
                    {group.units.map(unit => <tr key={unit.name} className="border-b border-slate-100"><td className="py-2">{unit.name}</td><td className="py-2 text-right">{unit.count.toLocaleString()}</td><td className="py-2 text-right">{share(unit.count, group.questions)}</td></tr>)}
                </tbody></table></div>
                <h3 className="text-base font-bold mt-6 mb-2">난이도 자동 분류</h3>
                <p className="text-sm text-slate-700">쉬움 {group.difficulty.easy.toLocaleString()}문항 ({share(group.difficulty.easy, group.questions)}) · 보통 {group.difficulty.mid.toLocaleString()}문항 ({share(group.difficulty.mid, group.questions)}) · 어려움 {group.difficulty.hard.toLocaleString()}문항 ({share(group.difficulty.hard, group.questions)})</p>
                <h3 className="text-base font-bold mt-6 mb-2">집계에 포함된 시험지 예시</h3>
                <ul className="space-y-1">{group.examples.map(exam => <li key={exam.id}><Link href={`/exam/${exam.id}`} className="text-sm text-[#426D36] underline">{exam.school} · {group.label} 시험지 보기</Link></li>)}</ul>
            </section>)}
            <section className="text-sm text-slate-600 leading-relaxed bg-white/70 rounded-xl p-5">
                <h2 className="font-bold text-slate-800 mb-2">읽을 때 유의할 점</h2>
                <p>미리보기가 있고 문항 DB가 연결된 2025년 자료만 포함합니다. 모든 학교를 대표하는 표본은 아닙니다. 단원·난이도는 자동 분류 결과이며 정답·해설이나 교사 검수 의견을 뜻하지 않습니다. 자료가 추가되면 다음 집계에서 값이 달라질 수 있습니다.</p>
                <Link href="/insights/methodology" className="inline-block text-[#426D36] underline mt-3">집계 범위와 분류 기준 자세히 보기 →</Link>
            </section>
        </main>
    </div>;
}
