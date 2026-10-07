import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import Header from '@/components/Header';
import { createAdminClient } from '@/utils/supabase/server-admin';
import { PREVIEW_GUIDES, getStudyGuide } from '@/lib/preview-guides';
import { Wand2, ChevronRight, BookOpen, CalendarDays } from 'lucide-react';

export const revalidate = 3600;

interface Props { params: { slug: string } }

export function generateStaticParams() {
    return Object.keys(PREVIEW_GUIDES).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const g = getStudyGuide(params.slug);
    if (!g) return { title: '예습 가이드 | 수학ETF' };
    return {
        title: g.title,
        description: g.metaDescription,
        keywords: g.keywords,
        alternates: { canonical: `/study/${g.slug}` },
        openGraph: {
            title: g.title,
            description: g.metaDescription,
            url: `https://mathetf.com/study/${g.slug}`,
            images: ['/og-image.png'],
        },
    };
}

export default async function StudyGuidePage({ params }: Props) {
    const g = getStudyGuide(params.slug);
    if (!g) notFound();

    // 단원별 문항 수 집계 (고유 실데이터)
    const supabase = createAdminClient();
    const { data: qs } = await supabase.from('questions').select('unit').eq('subject', g.subject);
    const counts: Record<string, number> = {};
    (qs || []).forEach((q: any) => { if (q.unit) counts[q.unit] = (counts[q.unit] || 0) + 1; });
    const total = (qs || []).length;
    const chapterTotal = (c: typeof g.chapters[number]) => c.units.reduce((s, u) => s + (counts[u] || 0), 0);

    return (
        <div className="rd rd-x">
            <Header />
            <main className="rd-ct-main">
                {/* 히어로 */}
                <section className="rd-wrap rd-x-top rd-ct-top">
                    <p className="rd-kicker rd-ct-kickicon"><BookOpen size={18} aria-hidden="true" />{g.gradeLabel} 선행 가이드</p>
                    <h1 className="rd-x-h1 rd-ct-h1">{g.h1}</h1>
                    <p className="rd-lead rd-ct-lead">{g.lead}</p>
                </section>

                {/* 왜 지금 예습 */}
                <section className="rd-wrap rd-ct-intro">
                    <div className="rd-s-prose">
                        {g.intro.map((p, i) => (
                            <p key={i}>{p}</p>
                        ))}
                    </div>
                    <p className="rd-ct-callout">
                        수학ETF가 보유한 <strong>{g.subject} 기출 {total.toLocaleString()}문항</strong>으로 예습 예상문제를 만들 수 있어요.
                    </p>
                </section>

                {/* 단원 지도 */}
                <section className="rd-s-zone rd-ct-zone">
                    <div className="rd-wrap">
                        <h2 className="rd-x-h2">단원 지도 · 학습 순서</h2>
                        <div className="rd-ct-chapters">
                            {g.chapters.map((c) => (
                                <div key={c.name} className="rd-s-unitcard rd-ct-chapter">
                                    <div className="rd-s-unithead">
                                        <h3>{c.name}</h3>
                                        <span>{chapterTotal(c)}문항</span>
                                    </div>
                                    <p className="rd-ct-chblurb">{c.blurb}</p>
                                    <div className="rd-x-concepts rd-ct-unitchips">
                                        {c.units.map((u) => (
                                            <span key={u}>
                                                {u} <b>{counts[u] || 0}</b>
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* 방학 로드맵 */}
                <section className="rd-wrap rd-ct-block">
                    <h2 className="rd-x-h2 rd-ct-iconh2"><CalendarDays size={30} aria-hidden="true" /> 방학 8주 로드맵</h2>
                    <ol className="rd-ct-roadmap">
                        {g.roadmap.map((r) => (
                            <li key={r.weeks}>
                                <b>{r.weeks}</b>
                                <p>{r.focus}</p>
                            </li>
                        ))}
                    </ol>
                </section>

                {/* CTA (예상문제 뽑기 1순위) */}
                <section className="rd-wrap rd-s-make">
                    <div className="rd-s-makebox">
                        <p className="rd-ct-ctatitle">우리 학교 스타일로 {g.subject} 예습 시험지 만들기</p>
                        <p className="rd-lead">학교·시험범위만 고르면 같은 유형의 기출로 예상문제 세트를 자동 생성해드려요.</p>
                        <div className="rd-s-actions">
                            <Link href="/predict" className="rd-btn rd-btn-primary">
                                <Wand2 size={18} aria-hidden="true" /> 예상문제 뽑기
                            </Link>
                            <Link href="/question-bank" className="rd-btn rd-btn-gray rd-ct-white">
                                직접 시험지 만들기
                            </Link>
                        </div>
                    </div>
                </section>

                {/* 관련 가이드 (내부링크) */}
                <div className="rd-x-more rd-s-more">
                    <div className="rd-wrap">
                        <div className="rd-x-rows rd-ct-rows3">
                            {g.related.map((r) => (
                                <Link key={r.href} href={r.href} className="rd-x-row">
                                    <span><b>{r.label}</b></span><ChevronRight size={22} aria-hidden="true" />
                                </Link>
                            ))}
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}
