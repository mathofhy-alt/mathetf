import {questionBankHref} from '@/lib/discovery';
import Link from 'next/link';
import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import Header from '@/components/Header';
import SubjectExamCatalog from '@/components/SubjectExamCatalog';
import { getSubjectHub, HUB_SUBJECTS, SUBJECT_INFO, type HubSubject } from '@/lib/subject-hub';
import { INSIGHT_REPORTS } from '@/lib/seo-insights';

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
        `${subject}로 등록된 기출 자료입니다. ` +
        `${hub.schoolCount}개교를 포함한 보유 기출 ${hub.total.toLocaleString()}문항을 단원·난이도로 분류해 ` +
        `실제 출제 분포를 정리했습니다. 시험지 미리보기는 공개이며, 제공 회차의 해설 없는 전체 문제 PDF는 회원 무료입니다.`;
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
    const relatedInsight = subject === '공통수학1' ? INSIGHT_REPORTS[0] : subject === '수학I' ? INSIGHT_REPORTS[1] : null;
    const url = `https://mathetf.com/subject/${encodeURIComponent(subject)}`;
    // 자료가 한쪽 시험에 쏠려 있으면 그렇다고 밝힌다.
    // 합쳐서 내면 '과목의 출제 분포' 처럼 읽히는데 사실이 아니다(수학II 는 기말 0건이라 적분이 통째로 빠진다).
    const lopsided = Math.min(hub.midtermCount, hub.finalCount) < hub.total * 0.15;
    const richer = hub.midtermCount >= hub.finalCount ? '중간' : '기말';
    const poorer = richer === '중간' ? '기말' : '중간';
    const poorCount = Math.min(hub.midtermCount, hub.finalCount);
    const units = hub.byUnit.slice(0, 14);
    const maxUnit = Math.max(1, ...units.map(u => Math.max(u.midterm, u.final)));

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
        <div className="rd rd-x">
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
            <Header />
            <main className="rd-ct-main">
                <section className="rd-wrap rd-x-top">
                    <Link href="/" className="rd-x-back"><ChevronLeft size={18} aria-hidden="true" />전체 기출</Link>
                    <h1 className="rd-x-h1 rd-s-h1">
                        {subject} 기출문제
                    </h1>
                    <div className="rd-x-meta">
                        <span className="rd-pill is-accent">{info.grade} {info.when}</span>
                        <span className="rd-pill">보유 학교 <strong>{hub.schoolCount}개교</strong></span>
                        <span className="rd-pill">분류 문항{' '}<strong>{hub.total.toLocaleString()}문항</strong></span>
                    </div>
                    <p className="rd-lead rd-ct-lead">보유 기출의 회차와 단원을 확인하고 필요한 문항만 골라 출제할 수 있습니다.</p>
                    <div className="rd-x-links rd-ct-toplinks">
                        <Link className="rd-link" href="/guide">만드는 순서·무료 범위·결과물 보기</Link>
                        <Link className="rd-link" href="/question-bank?demo=1&origin=content">5문항 체험</Link>
                    </div>

                    <nav aria-label="과목별 기출 검색" className="rd-ct-subjnav">
                        {HUB_SUBJECTS.map(s => <Link key={s} href={`/subject/${encodeURIComponent(s)}#subject-exams`} aria-current={s === subject ? 'page' : undefined}>{s}</Link>)}
                    </nav>
                </section>

                <SubjectExamCatalog key={subject} exams={hub.exams} subject={subject} />

                {/* 과목 소개 — '이 과목이 뭐냐' 는 검색 의도에 답한다 */}
                <section className="rd-wrap rd-s-about rd-ct-about">
                    <h2 className="rd-s-h2sm">{subject}{info.eun} 어떤 과목인가요?</h2>
                    <div className="rd-s-prose">
                        <p>{info.blurb}</p>
                        <p>
                            수학ETF는 {subject} 기출 {hub.total.toLocaleString()}문항을
                            단원과 난이도로 분류해 두었습니다. 지금 보유한 자료는{' '}
                            <strong>중간고사 {hub.midtermCount.toLocaleString()}문항</strong>,{' '}
                            <strong>기말고사 {hub.finalCount.toLocaleString()}문항</strong>입니다.
                        </p>
                        <p>
                            {hub.midtermCount + hub.finalCount === 0 ? (
                                <>아래 문항은 중간·기말 회차가 식별되지 않아 시험별 단원 표에 수치가 표시되지 않습니다.</>
                            ) : lopsided ? (
                                <>
                                    아래 단원 분포는 <strong>{`${richer}고사`} 자료를 기준으로</strong> 읽어야 합니다.
                                    {poorCount === 0
                                        ? `${poorer}고사 회차가 아직 없어서, ${poorer}고사에서 다루는 단원은 표에 나타나지 않습니다.`
                                        : `${poorer}고사 회차가 아직 ${poorCount.toLocaleString()}문항뿐이라, ${poorer}고사에서 다루는 단원은 실제 출제 비중보다 적게 잡혀 있습니다.`}
                                    {' '}문항 분류 통계와 시험지 목록의 등록 범위는 다를 수 있습니다.
                                </>
                            ) : (
                                <>아래 표는 중간·기말을 나누어 세었습니다. 대비하는 시험 쪽 숫자를 보시면 됩니다.</>
                            )}
                        </p>
                        <p>
                            난이도 분포는 쉬움 {pct(hub.easy, hub.total)}% · 보통 {pct(hub.mid, hub.total)}% ·
                            어려움 {pct(hub.hard, hub.total)}% 입니다.
                            분류 문항 수에는 교과 외 문항 등이 포함되어 실제 출제 검색 결과와 다를 수 있습니다. 제공 회차의 미리보기는 로그인 없이 볼 수 있고, 해설 없는 전체 문제 PDF는 회원 무료입니다.
                        </p>
                    </div>

                    {relatedInsight && (
                        <Link href={`/insights/${relatedInsight.slug}`} className="rd-ct-insight">
                            <span><b>{relatedInsight.title}</b>{' '}<small>실제 보유 시험지 집계 보기</small></span>
                            <ChevronRight size={22} aria-hidden="true" />
                        </Link>
                    )}
                </section>

                {/* 단원별 출제 분포 */}
                <section className="rd-s-zone rd-ct-zone">
                    <div className="rd-wrap">
                        <h2 className="rd-x-h2">{subject} 단원별 출제 분포</h2>
                        <p className="rd-x-note">
                            보유한 {subject} 분류 문항 {hub.total.toLocaleString()}개를 집계했습니다.
                            과목 전체의 출제 비중이 아니라 <strong>지금 보유한 회차</strong>의 분포입니다.
                        </p>
                        <div className="rd-ct-panel is-white rd-ct-unitpanel">
                            <div className="rd-ct-legend" aria-hidden="true"><span><i className="is-mid" />중간고사</span><span><i className="is-fin" />기말고사</span></div>
                            <div className="rd-ct-tablewrap">
                                <table className="rd-ct-table rd-ct-unittable">
                                    <thead>
                                        <tr>
                                            <th scope="col">단원</th>
                                            <th scope="col" className="is-num">중간고사</th>
                                            <th scope="col" className="is-num">기말고사</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {units.map((u) => (
                                            <tr key={u.unit}>
                                                <td>
                                                    <span className="rd-ct-uname">{u.unit}</span>
                                                    <span className="rd-ct-pair" aria-hidden="true">
                                                        <span className="rd-x-track rd-ct-mini"><span style={{ width: `${Math.round(u.midterm / maxUnit * 100)}%` }} /></span>
                                                        <span className="rd-x-track rd-ct-mini is-fin"><span style={{ width: `${Math.round(u.final / maxUnit * 100)}%` }} /></span>
                                                    </span>
                                                </td>
                                                <td className="is-num is-strong">
                                                    {u.midterm > 0 ? u.midterm.toLocaleString() : <span className="rd-ct-dash">·</span>}
                                                </td>
                                                <td className="is-num is-strong">
                                                    {u.final > 0 ? u.final.toLocaleString() : <span className="rd-ct-dash">·</span>}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <div className="rd-ct-diff">
                                <span className="is-easy">쉬움 {hub.easy.toLocaleString()}</span>
                                <span className="is-mid">보통 {hub.mid.toLocaleString()}</span>
                                <span className="is-hard">어려움 {hub.hard.toLocaleString()}</span>
                            </div>
                        </div>
                    </div>
                </section>

                {/* 출제 개념 */}
                {hub.concepts.length > 0 && (
                    <section className="rd-wrap rd-ct-block">
                        <h2 className="rd-s-h2sm">{subject}에서 자주 나오는 개념·유형</h2>
                        <p className="rd-x-note">출제 빈도 순입니다.</p>
                        <div className="rd-x-concepts">
                            {hub.concepts.map((c) => (
                                <span key={c}>{c}</span>
                            ))}
                        </div>
                    </section>
                )}

                {/* 학교별 기출 — 내부 링크 */}
                {hub.schools.length > 0 && (
                    <section className="rd-wrap rd-ct-block">
                        <h2 className="rd-s-h2sm">{subject} 기출이 있는 학교</h2>
                        <p className="rd-x-note">{hub.schoolCount}개교. 학교를 누르면 그 학교 기출 전체를 볼 수 있습니다.</p>
                        <div className="rd-rg-chips rd-ct-schools">
                            {hub.schools.map((s) => (
                                <Link key={s} href={`/school/${encodeURIComponent(s)}`} className="rd-rg-chip">
                                    {s}
                                </Link>
                            ))}
                        </div>
                    </section>
                )}

                <section className="rd-wrap rd-s-make">
                    <div className="rd-s-makebox">
                        <p className="rd-ct-ctatitle">{subject} 기출로 나만의 시험지를 만들어 보세요</p>
                        <p className="rd-lead">
                            단원·난이도로 문항을 골라 편집용 HML로 받을 수 있습니다. PDF는 한글에서 저장하세요.
                        </p>
                        <div className="rd-s-actions">
                            <Link href={questionBankHref({subject,origin:'subject'})} className="rd-btn rd-btn-primary">
                                시험지 만들러 가기
                            </Link>
                        </div>
                    </div>
                </section>

                {/* 다른 과목 */}
                <div className="rd-x-more rd-s-more">
                    <div className="rd-wrap">
                        <p className="rd-ct-morelabel">다른 과목 기출</p>
                        <nav className="rd-x-links rd-ct-otherlinks" aria-label="다른 과목 기출">
                            {HUB_SUBJECTS.filter((s) => s !== subject).map((s) => (
                                <Link key={s} href={`/subject/${encodeURIComponent(s)}`} className="rd-link">
                                    {s} 기출
                                </Link>
                            ))}
                        </nav>
                    </div>
                </div>
            </main>
        </div>
    );
}
