import Link from 'next/link';
import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Header from '@/components/Header';
import { getSubjectHub, HUB_SUBJECTS, SUBJECT_INFO, type HubSubject } from '@/lib/subject-hub';

export const revalidate = 3600;

interface Props { params: { subject: string } }

const pct = (n: number, total: number) => (total > 0 ? Math.round((n / total) * 100) : 0);

export function generateStaticParams() {
    // Next 가 URL 인코딩을 알아서 한다. 여기서 encodeURIComponent 를 하면 이중 인코딩이 되어
    // 렌더 시 decodeURIComponent 를 해도 과목명이 안 나오고 notFound() 로 빠진다(빈 페이지).
    return HUB_SUBJECTS.map((s) => ({ subject: s }));
}

function decode(raw: string) {
    try { return decodeURIComponent(raw); } catch { return raw; }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const subject = decode(params.subject);
    const hub = await getSubjectHub(subject);
    if (!hub) return { title: '과목별 기출 | 수학ETF' };
    const info = SUBJECT_INFO[subject as HubSubject];
    const title = `${subject} 기출문제 — 단원별 출제 분포와 학교별 기출 | 수학ETF`;
    const description =
        `${subject}${info.eun} ${info.grade} ${info.when}에 배우는 과목입니다. ` +
        `전국 ${hub.schoolCount}개교 내신 기출 ${hub.total.toLocaleString()}문항을 단원·난이도로 분류해 ` +
        `실제 출제 분포를 정리했습니다. 학교별 기출 시험지와 문제 PDF는 무료로 받을 수 있습니다.`;
    return {
        title,
        description,
        keywords: [subject, `${subject} 기출`, `${subject} 기출문제`, `${subject} 단원`,
            `${subject} 내신`, `${subject} 시험 범위`, '고등 수학 기출'],
        alternates: { canonical: `/subject/${encodeURIComponent(subject)}` },
        openGraph: {
            title, description,
            url: `https://mathetf.com/subject/${encodeURIComponent(subject)}`,
            type: 'article', images: ['/og-image.png'],
        },
    };
}

export default async function SubjectHubPage({ params }: Props) {
    const subject = decode(params.subject);
    const hub = await getSubjectHub(subject);
    if (!hub) notFound();
    const info = SUBJECT_INFO[subject as HubSubject];
    const url = `https://mathetf.com/subject/${encodeURIComponent(subject)}`;
    const topUnits = hub.byUnit.slice(0, 3);

    const jsonLd = [
        {
            '@context': 'https://schema.org', '@type': 'CollectionPage',
            name: `${subject} 기출문제`, url, inLanguage: 'ko',
            description: `${info.grade} ${info.when} ${subject}의 전국 ${hub.schoolCount}개교 내신 기출 ${hub.total}문항 단원별 출제 분포.`,
            provider: { '@type': 'Organization', name: '수학ETF', url: 'https://mathetf.com' },
        },
        {
            '@context': 'https://schema.org', '@type': 'BreadcrumbList',
            itemListElement: [
                { '@type': 'ListItem', position: 1, name: '수학ETF', item: 'https://mathetf.com/' },
                { '@type': 'ListItem', position: 2, name: `${subject} 기출문제`, item: url },
            ],
        },
    ];

    return (
        <div className="min-h-screen bg-[#F8FAFD] text-[#1E2D4F] font-sans">
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
            <Header />
            <main className="max-w-3xl mx-auto px-4 py-8 sm:py-10">
                <div className="mb-6">
                    <Link href="/" className="text-sm text-brand-600 hover:underline mb-3 inline-block">← 전체 기출</Link>
                    <h1 className="text-2xl sm:text-3xl font-black text-slate-900 break-keep">
                        {subject} 기출문제
                    </h1>
                    <p className="text-sm text-slate-500 mt-2 break-keep">
                        {info.grade} {info.when} · 전국 <strong className="text-[#1E2D4F]">{hub.schoolCount}개교</strong> 내신 기출{' '}
                        <strong className="text-[#1E2D4F]">{hub.total.toLocaleString()}문항</strong>
                    </p>
                </div>

                {/* 과목 소개 — '이 과목이 뭐냐' 는 검색 의도에 답한다 */}
                <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 mb-6">
                    <h2 className="text-base font-bold text-slate-800 mb-3">{subject}{info.eun} 어떤 과목인가요?</h2>
                    <div className="space-y-3 text-sm text-slate-600 leading-relaxed break-keep">
                        <p>{info.blurb}</p>
                        <p>
                            수학ETF가 전국 {hub.schoolCount}개교의 {subject} 내신 기출 {hub.total.toLocaleString()}문항을
                            단원과 난이도로 분류한 결과, 출제 비중이 가장 높은 단원은{' '}
                            {topUnits.map((u, i) => (
                                <span key={u.unit}>
                                    {i > 0 ? ', ' : ''}
                                    <strong className="text-[#1E2D4F]">{u.unit}</strong> {u.count.toLocaleString()}문항({pct(u.count, hub.total)}%)
                                </span>
                            ))}
                            입니다. 학교마다 시험 범위는 다르지만, 이 단원들은 어느 학교에서든 비중 있게 나옵니다.
                        </p>
                        <p>
                            난이도 분포는 쉬움 {pct(hub.easy, hub.total)}% · 보통 {pct(hub.mid, hub.total)}% ·
                            어려움 {pct(hub.hard, hub.total)}% 입니다.
                            아래에서 단원별 출제 분포와 학교별 기출 시험지를 확인할 수 있고,
                            문제 미리보기와 워터마크 없는 문제 PDF는 회원가입만 하면 무료입니다.
                        </p>
                    </div>
                </section>

                {/* 단원별 출제 분포 */}
                <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 mb-6">
                    <h2 className="text-sm font-bold text-slate-700 mb-1">📊 {subject} 단원별 출제 분포</h2>
                    <p className="text-xs text-slate-400 mb-4 break-keep">
                        전국 {hub.schoolCount}개교 기출 {hub.total.toLocaleString()}문항을 실제로 세어 만든 표입니다.
                    </p>
                    <table className="w-full text-sm">
                        <tbody>
                            {hub.byUnit.slice(0, 14).map((u) => (
                                <tr key={u.unit} className="border-b border-slate-100 last:border-0">
                                    <td className="py-2 text-slate-600 break-keep">{u.unit}</td>
                                    <td className="py-2 text-right w-40">
                                        <span className="inline-flex items-center gap-2 justify-end">
                                            <span className="inline-block h-1.5 rounded-full bg-[#497AB7]/30"
                                                style={{ width: `${Math.max(8, (u.count / hub.byUnit[0].count) * 90)}px` }} />
                                            <span className="font-bold text-[#497AB7] w-12 text-right tabular-nums">{u.count.toLocaleString()}</span>
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <div className="flex flex-wrap gap-2 text-xs mt-4">
                        <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-600 font-bold">쉬움 {hub.easy.toLocaleString()}</span>
                        <span className="px-2.5 py-1 rounded-full bg-amber-50 text-amber-600 font-bold">보통 {hub.mid.toLocaleString()}</span>
                        <span className="px-2.5 py-1 rounded-full bg-rose-50 text-rose-600 font-bold">어려움 {hub.hard.toLocaleString()}</span>
                    </div>
                </section>

                {/* 출제 개념 */}
                {hub.concepts.length > 0 && (
                    <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 mb-6">
                        <h2 className="text-sm font-bold text-slate-700 mb-1">🧩 {subject}에서 자주 나오는 개념·유형</h2>
                        <p className="text-xs text-slate-400 mb-3 break-keep">출제 빈도 순입니다.</p>
                        <div className="flex flex-wrap gap-1.5">
                            {hub.concepts.map((c) => (
                                <span key={c} className="text-[11px] bg-[#E8F0FB] text-[#497AB7] font-bold px-2.5 py-1 rounded-full">{c}</span>
                            ))}
                        </div>
                    </section>
                )}

                {/* 학교별 기출 — 내부 링크 */}
                {hub.schools.length > 0 && (
                    <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 mb-6">
                        <h2 className="text-sm font-bold text-slate-700 mb-1">🏫 {subject} 기출이 있는 학교</h2>
                        <p className="text-xs text-slate-400 mb-3 break-keep">{hub.schoolCount}개교. 학교를 누르면 그 학교 기출 전체를 볼 수 있습니다.</p>
                        <div className="flex flex-wrap gap-1.5">
                            {hub.schools.map((s) => (
                                <Link key={s} href={`/school/${encodeURIComponent(s)}`}
                                    className="text-xs bg-slate-50 hover:bg-[#E8F0FB] text-slate-600 hover:text-[#497AB7] border border-slate-200 font-semibold px-2.5 py-1 rounded-lg transition-colors">
                                    {s}
                                </Link>
                            ))}
                        </div>
                    </section>
                )}

                {/* 시험지 목록 */}
                {hub.exams.length > 0 && (
                    <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 mb-6">
                        <h2 className="text-sm font-bold text-slate-700 mb-3">📄 {subject} 기출 시험지 {hub.exams.length}개</h2>
                        <ul className="divide-y divide-slate-100">
                            {hub.exams.map((e) => (
                                <li key={e.id}>
                                    <Link href={`/exam/${e.id}`}
                                        className="flex items-center justify-between gap-3 py-2.5 hover:bg-slate-50 -mx-2 px-2 rounded-lg transition-colors">
                                        <span className="text-sm text-slate-700 break-keep">
                                            {e.school} {e.year}년 {e.grade}학년 {e.semester}학기 {e.examType}
                                        </span>
                                        <span className="text-xs text-slate-300 shrink-0">›</span>
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </section>
                )}

                {/* 다른 과목 */}
                <nav className="flex flex-wrap gap-2 mb-6">
                    {HUB_SUBJECTS.filter((s) => s !== subject).map((s) => (
                        <Link key={s} href={`/subject/${encodeURIComponent(s)}`}
                            className="text-xs bg-white border border-slate-200 hover:border-[#497AB7] text-slate-600 hover:text-[#497AB7] font-bold px-3 py-2 rounded-lg transition-colors">
                            {s} 기출 →
                        </Link>
                    ))}
                </nav>

                <div className="bg-gradient-to-br from-[#497AB7] to-[#3AADA9] rounded-2xl p-6 text-center text-white">
                    <p className="font-bold break-keep">{subject} 기출로 나만의 시험지를 만들어 보세요</p>
                    <p className="text-sm text-white/80 mt-1.5 break-keep">
                        단원·난이도로 문항을 골라 한글(HWP)·PDF로 받을 수 있습니다. 현재 무료입니다.
                    </p>
                    <Link href="/question-bank"
                        className="inline-block mt-4 bg-white text-[#497AB7] font-black px-6 py-2.5 rounded-xl hover:bg-slate-50 transition-colors">
                        시험지 만들러 가기 →
                    </Link>
                </div>
            </main>
        </div>
    );
}
