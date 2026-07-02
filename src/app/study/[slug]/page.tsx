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
        <div className="min-h-screen bg-[#F8FAFD] text-[#1E2D4F] font-sans">
            <Header />
            <main className="max-w-3xl mx-auto px-4 py-8 sm:py-10">
                {/* 히어로 */}
                <div className="inline-flex items-center gap-1.5 bg-[#5CC6C3]/12 border border-[#5CC6C3]/30 text-[#3AADA9] text-xs font-bold px-3 py-1 rounded-full mb-3">
                    <BookOpen size={12} /> {g.gradeLabel} 선행 가이드
                </div>
                <h1 className="text-2xl sm:text-3xl font-black break-keep leading-tight">{g.h1}</h1>
                <p className="text-slate-600 mt-2.5 break-keep leading-relaxed">{g.lead}</p>

                {/* 왜 지금 예습 */}
                <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 sm:p-6 mt-6 space-y-3">
                    {g.intro.map((p, i) => (
                        <p key={i} className="text-slate-600 text-sm leading-relaxed break-keep">{p}</p>
                    ))}
                    <p className="text-xs text-slate-400 pt-1">
                        수학ETF가 보유한 <strong className="text-[#497AB7]">{g.subject} 기출 {total.toLocaleString()}문항</strong>으로 예습 예상문제를 만들 수 있어요.
                    </p>
                </section>

                {/* 단원 지도 */}
                <h2 className="text-lg font-extrabold mt-8 mb-3">단원 지도 · 학습 순서</h2>
                <div className="space-y-3">
                    {g.chapters.map((c) => (
                        <div key={c.name} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                            <div className="flex items-center justify-between gap-2">
                                <h3 className="font-extrabold text-[#1E2D4F] break-keep">{c.name}</h3>
                                <span className="text-[11px] font-bold text-[#497AB7] bg-[#EEF4FB] border border-[#B7D1EA]/60 px-2 py-0.5 rounded-full shrink-0">
                                    {chapterTotal(c)}문항
                                </span>
                            </div>
                            <p className="text-sm text-slate-600 mt-1.5 leading-relaxed break-keep">{c.blurb}</p>
                            <div className="flex flex-wrap gap-1.5 mt-3">
                                {c.units.map((u) => (
                                    <span key={u} className="text-[11px] bg-slate-50 text-slate-600 border border-slate-200 px-2 py-0.5 rounded-full">
                                        {u} <span className="text-[#497AB7] font-bold">{counts[u] || 0}</span>
                                    </span>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>

                {/* 방학 로드맵 */}
                <h2 className="text-lg font-extrabold mt-8 mb-3 flex items-center gap-1.5"><CalendarDays size={18} /> 방학 8주 로드맵</h2>
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm divide-y divide-slate-100 overflow-hidden">
                    {g.roadmap.map((r) => (
                        <div key={r.weeks} className="flex gap-3 p-4">
                            <span className="text-xs font-extrabold text-white bg-[#497AB7] rounded-lg px-2.5 py-1 h-fit whitespace-nowrap">{r.weeks}</span>
                            <p className="text-sm text-slate-600 leading-relaxed break-keep">{r.focus}</p>
                        </div>
                    ))}
                </div>

                {/* CTA (예상문제 뽑기 1순위) */}
                <div className="mt-8 bg-gradient-to-br from-[#497AB7] to-[#3AADA9] rounded-2xl p-6 text-center text-white shadow-md">
                    <p className="font-bold text-lg mb-1 break-keep">우리 학교 스타일로 {g.subject} 예습 시험지 만들기</p>
                    <p className="text-white/85 text-sm mb-4 break-keep">학교·시험범위만 고르면 같은 유형의 기출로 예상문제 세트를 자동 생성해드려요.</p>
                    <div className="flex flex-col sm:flex-row justify-center gap-2.5">
                        <Link href="/predict" className="inline-flex items-center justify-center gap-2 bg-white text-[#497AB7] font-extrabold px-6 py-3 rounded-xl hover:bg-slate-50 transition-colors">
                            <Wand2 size={16} /> 예상문제 뽑기
                        </Link>
                        <Link href="/question-bank" className="inline-flex items-center justify-center gap-2 border-2 border-white/70 text-white font-extrabold px-6 py-3 rounded-xl hover:bg-white/10 transition-colors">
                            직접 시험지 만들기 →
                        </Link>
                    </div>
                </div>

                {/* 관련 가이드 (내부링크) */}
                <div className="mt-6 grid sm:grid-cols-3 gap-2">
                    {g.related.map((r) => (
                        <Link key={r.href} href={r.href} className="flex items-center justify-between gap-2 bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3 text-sm font-bold text-slate-700 hover:text-[#497AB7] hover:shadow-md transition-all">
                            {r.label}<ChevronRight size={16} className="text-[#497AB7]" />
                        </Link>
                    ))}
                </div>
            </main>
        </div>
    );
}
