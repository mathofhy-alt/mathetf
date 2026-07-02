import Link from 'next/link';
import { Metadata } from 'next';
import { ArrowRight } from 'lucide-react';
import Header from '@/components/Header';
import MockExamCard, { MockCategory, MOCK_CATEGORIES, CATEGORY_DESC } from '@/components/mock/MockExamCard';
import MockUploadButton from '@/components/mock/MockUploadButton';
import { fetchAllMockExams } from '@/lib/mock-exams';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export const metadata: Metadata = {
    title: '모의고사 수학 기출·변형문제 무료 다운로드 | 수학ETF',
    description: '전국연합학력평가·평가원 모의평가·수능·경찰대·사관학교 수학 기출과 변형문제를 PDF·HWP로 무료 제공합니다.',
    alternates: { canonical: '/모의고사' },
};

const ORDER: MockCategory[] = ['수능', '평가원', '전국연합', '경찰대', '사관학교'];

export default async function MockExamHubPage() {
    const all = await fetchAllMockExams();
    return (
        <div className="min-h-screen bg-gradient-to-b from-[#EEF3FA] to-[#F8FAFD] text-[#1E2D4F] font-sans">
            <Header />
            <main className="max-w-[1140px] mx-auto px-4 py-7 sm:py-9">
                {/* ── 히어로 배너 ── */}
                <section className="relative overflow-hidden rounded-[1.75rem] bg-gradient-to-br from-[#2B3A67] via-[#3A6CAE] to-[#3AADA9] text-white shadow-xl ring-1 ring-black/5">
                    {/* 데코: 글로우 오브 */}
                    <div className="absolute -top-20 -right-10 w-72 h-72 rounded-full bg-white/15 blur-3xl pointer-events-none" />
                    <div className="absolute -bottom-28 -left-12 w-80 h-80 rounded-full bg-black/10 blur-3xl pointer-events-none" />
                    {/* 데코: 큰 수학기호 */}
                    <span className="absolute right-3 -bottom-12 text-[190px] leading-none font-black italic text-white/10 select-none pointer-events-none">∫</span>
                    {/* 데코: 미세 격자 */}
                    <div className="absolute inset-0 opacity-[0.06] pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)', backgroundSize: '22px 22px' }} />

                    <div className="relative px-6 py-9 md:px-12 md:py-12">
                        {/* 관리자 전용 업로드 버튼 */}
                        <div className="absolute top-5 right-5 z-10">
                            <MockUploadButton />
                        </div>
                        <span className="inline-flex items-center gap-1 text-[11px] font-extrabold tracking-wide bg-white/20 border border-white/30 backdrop-blur-sm px-3 py-1 rounded-full">
                            무료 자료실
                        </span>
                        <h1 className="mt-3 text-[26px] sm:text-4xl font-black break-keep leading-tight" style={{ textShadow: '0 2px 12px rgba(0,0,0,0.25)' }}>
                            모의고사 자료실
                        </h1>
                        <p className="mt-2.5 text-white/90 break-keep text-sm md:text-lg max-w-xl" style={{ textShadow: '0 1px 4px rgba(0,0,0,0.2)' }}>
                            수능부터 사관학교까지 — 수학 기출과 변형문제를 PDF·HWP로 무료로.
                        </p>
                        <div className="mt-5 flex flex-wrap gap-2">
                            {ORDER.map((c) => (
                                <Link
                                    key={c}
                                    href={`/모의고사/${c}`}
                                    className="bg-white/15 hover:bg-white/25 border border-white/25 backdrop-blur-sm text-white text-sm font-bold px-4 py-1.5 rounded-full transition-colors"
                                >
                                    {MOCK_CATEGORIES[c].label}
                                </Link>
                            ))}
                        </div>
                    </div>
                </section>

                {/* ── 허브 소개 (SEO 고유 텍스트) ── */}
                <section className="mt-6 bg-white rounded-2xl border border-slate-200 shadow-sm p-5 sm:p-6">
                    <p className="text-slate-600 text-sm leading-relaxed break-keep">
                        <strong className="text-[#1E2D4F]">전국연합학력평가</strong>(시·도 교육청 주관 3·6·9·11월)와{' '}
                        <strong className="text-[#1E2D4F]">평가원 6·9월 모의평가</strong>, <strong className="text-[#1E2D4F]">수능</strong>,
                        그리고 <strong className="text-[#1E2D4F]">경찰대·사관학교 1차시험</strong> 수학 기출을 학년·연도별로 모았습니다.
                        각 회차의 원본 문제와 같은 유형의 변형문제를 PDF·한글(HWP)로 무료로 받을 수 있어요.
                        모의고사 기출은 시험 시기와 무관하게 실전 감각·유형 연습에 활용할 수 있습니다.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                        <Link href="/study/common-math-2" className="text-xs font-bold text-[#497AB7] bg-[#EEF4FB] border border-[#B7D1EA]/60 px-3 py-1.5 rounded-full hover:bg-[#E0ECF9] transition-colors">공통수학2 예습 가이드 →</Link>
                        <Link href="/study/calculus-1" className="text-xs font-bold text-[#497AB7] bg-[#EEF4FB] border border-[#B7D1EA]/60 px-3 py-1.5 rounded-full hover:bg-[#E0ECF9] transition-colors">미적분I 예습 가이드 →</Link>
                    </div>
                </section>

                {/* ── 분류별 섹션 ── */}
                <div className="mt-10">
                    {all.length === 0 ? (
                        <div className="py-20 text-center bg-white rounded-2xl border border-slate-200">
                            <p className="text-slate-400 font-semibold">아직 등록된 자료가 없어요.</p>
                            <p className="text-slate-300 text-sm mt-1">관리자가 자료를 올리면 여기에 표시됩니다.</p>
                        </div>
                    ) : (
                        ORDER.map((cat) => {
                            const items = all.filter((s) => s.category === cat);
                            if (!items.length) return null;
                            return (
                                <section key={cat} className="mb-11">
                                    <div className="flex items-center justify-between mb-4">
                                        <div className="flex items-center gap-2.5">
                                            <span className={`w-1.5 h-5 rounded-full bg-gradient-to-b ${MOCK_CATEGORIES[cat].bar}`} />
                                            <h2 className="text-lg font-extrabold">{MOCK_CATEGORIES[cat].label}</h2>
                                            <span className="text-xs font-bold text-slate-400 bg-white border border-slate-200 px-2 py-0.5 rounded-full">{items.length}</span>
                                        </div>
                                        <Link href={`/모의고사/${cat}`} className="group inline-flex items-center gap-1 text-sm font-bold text-[#497AB7] hover:text-[#3A6CAE] transition-colors">
                                            전체보기 <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
                                        </Link>
                                    </div>
                                    {CATEGORY_DESC[cat] && (
                                        <p className="text-sm text-slate-500 leading-relaxed break-keep -mt-1 mb-4">{CATEGORY_DESC[cat]}</p>
                                    )}
                                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                                        {items.slice(0, 8).map((e) => (
                                            <MockExamCard key={e.slug} exam={e} />
                                        ))}
                                    </div>
                                </section>
                            );
                        })
                    )}
                </div>
            </main>
        </div>
    );
}
