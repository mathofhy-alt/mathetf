import Header from '@/components/Header';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';
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
    return <div className="rd rd-x"><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} /><Header />
        <main className="rd-ct-main">
            <section className="rd-wrap rd-x-top">
                <Link href="/insights" className="rd-x-back"><ChevronLeft size={18} aria-hidden="true" />출제 동향 전체</Link>
                <h1 className="rd-x-h1 rd-ct-h1">{report.title}</h1>
                <div className="rd-x-meta">
                    <span className="rd-pill is-accent">집계 기준일 2026년 9월 24일</span>
                    <span className="rd-pill">수학ETF 운영 자료</span>
                </div>
                <p className="rd-lead rd-ct-lead">{report.lead}</p>
            </section>
            {report.groups.map(group => {
                const levels = [
                    { key: 'easy', label: '쉬움', n: group.difficulty.easy },
                    { key: 'mid', label: '보통', n: group.difficulty.mid },
                    { key: 'hard', label: '어려움', n: group.difficulty.hard },
                ];
                const maxUnit = Math.max(1, ...group.units.map(u => u.count));
                return <section key={group.label} className="rd-wrap rd-ct-group">
                    <h2 className="rd-x-h2">{group.label}</h2>
                    <p className="rd-ct-sample">분석 대상 <strong>{group.schools}개교</strong>, <strong>{group.questions.toLocaleString()}문항</strong></p>
                    <div className="rd-ct-grid">
                        <div className="rd-ct-panel">
                            <h3 className="rd-ct-h3">단원별 분포</h3>
                            <div className="rd-ct-tablewrap"><table className="rd-ct-table"><thead><tr><th scope="col">단원</th><th scope="col" className="is-num">문항</th><th scope="col" className="is-num">비중</th></tr></thead><tbody>
                                {group.units.map(unit => <tr key={unit.name}>
                                    <td><span className="rd-ct-uname">{unit.name}</span><span className="rd-x-track rd-ct-mini" aria-hidden="true"><span style={{ width: `${Math.round(unit.count / maxUnit * 100)}%` }} /></span></td>
                                    <td className="is-num">{unit.count.toLocaleString()}</td>
                                    <td className="is-num is-strong">{share(unit.count, group.questions)}</td>
                                </tr>)}
                            </tbody></table></div>
                        </div>
                        <div className="rd-ct-side">
                            <div className="rd-ct-panel">
                                <h3 className="rd-ct-h3">난이도 자동 분류</h3>
                                <div className="rd-ct-stack" aria-hidden="true">{levels.map(l => <span key={l.key} className={`is-${l.key}`} style={{ width: share(l.n, group.questions) }} />)}</div>
                                <ul className="rd-ct-levels">
                                    {levels.map(l => <li key={l.key}><i className={`is-${l.key}`} aria-hidden="true" /><span>{l.label}</span><b>{l.n.toLocaleString()}문항</b><small>({share(l.n, group.questions)})</small></li>)}
                                </ul>
                            </div>
                            <div className="rd-ct-panel">
                                <h3 className="rd-ct-h3">집계에 포함된 시험지 예시</h3>
                                <ul className="rd-ct-examples">{group.examples.map(exam => <li key={exam.id}><Link href={`/exam/${exam.id}`} className="rd-ct-exlink"><span><b>{exam.school}</b>{' '}<small>{group.label} 시험지 보기</small></span><ChevronRight size={20} aria-hidden="true" /></Link></li>)}</ul>
                            </div>
                        </div>
                    </div>
                </section>;
            })}
            <section className="rd-wrap rd-ct-notice">
                <div className="rd-x-box">
                    <h2 className="rd-ct-h3">읽을 때 유의할 점</h2>
                    <p>미리보기가 있고 문항 DB가 연결된 2025년 자료만 포함합니다. 모든 학교를 대표하는 표본은 아닙니다. 단원·난이도는 자동 분류 결과이며 정답·해설이나 교사 검수 의견을 뜻하지 않습니다. 자료가 추가되면 다음 집계에서 값이 달라질 수 있습니다.</p>
                    <Link href="/insights/methodology" className="rd-link rd-ct-boxlink">집계 범위와 분류 기준 자세히 보기</Link>
                </div>
            </section>
        </main>
    </div>;
}
