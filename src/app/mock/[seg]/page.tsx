import Link from 'next/link';
import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ArrowLeft, Download, FileText } from 'lucide-react';
import Header from '@/components/Header';
import MockExamCard, { MOCK_CATEGORIES, MockCategory } from '@/components/mock/MockExamCard';
import ExamPreviewCarousel from '@/components/ExamPreviewCarousel';
import MockAdminControls from '@/components/mock/MockAdminControls';
import { fetchMockExamsByCategory, fetchMockExamBySlug } from '@/lib/mock-exams';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

const CATEGORIES = Object.keys(MOCK_CATEGORIES) as MockCategory[];
const isCategory = (s: string): s is MockCategory => (CATEGORIES as string[]).includes(s);

export async function generateMetadata({ params }: { params: { seg: string } }): Promise<Metadata> {
    const seg = decodeURIComponent(params.seg);
    if (isCategory(seg)) {
        return {
            title: `${seg} 수학 기출·변형문제 모음 | 수학ETF`,
            description: `${seg} 수학 기출과 변형문제를 PDF·HWP로 무료 제공합니다.`,
            alternates: { canonical: `/모의고사/${seg}` },
        };
    }
    const exam = await fetchMockExamBySlug(seg);
    if (!exam) return { title: '모의고사 | 수학ETF' };
    return {
        title: `${exam.title} 문제·해설·변형문제 | 수학ETF`,
        description: `${exam.title} 원본 문제와 변형문제를 PDF·HWP로 무료 다운로드하세요.`,
        alternates: { canonical: `/모의고사/${exam.slug}` },
        openGraph: { images: exam.preview_urls?.length ? [exam.preview_urls[0]] : undefined },
    };
}

export default async function MockSegPage({ params }: { params: { seg: string } }) {
    const seg = decodeURIComponent(params.seg);
    return isCategory(seg) ? <CategoryView category={seg} /> : <DetailView slug={seg} />;
}

/* ── 분류 목록 ── */
async function CategoryView({ category }: { category: MockCategory }) {
    const items = await fetchMockExamsByCategory(category);
    const cat = MOCK_CATEGORIES[category];
    return (
        <div className="min-h-screen bg-gradient-to-b from-[#EEF3FA] to-[#F8FAFD] text-[#1E2D4F] font-sans">
            <Header />
            <main className="max-w-[1140px] mx-auto px-4 py-7 sm:py-9">
                <Link href="/모의고사" className="inline-flex items-center gap-1 text-sm text-[#497AB7] font-bold hover:underline mb-4">
                    <ArrowLeft size={15} /> 모의고사 전체
                </Link>
                <div className="flex items-center gap-3 mb-6">
                    <span className={`w-2 h-7 rounded-full bg-gradient-to-b ${cat.bar}`} />
                    <h1 className="text-2xl sm:text-3xl font-black">{category}</h1>
                    <span className="text-sm font-bold text-slate-400 bg-white border border-slate-200 px-2.5 py-0.5 rounded-full">{items.length}</span>
                </div>
                {items.length === 0 ? (
                    <div className="py-20 text-center bg-white rounded-2xl border border-slate-200 text-slate-400 font-semibold">
                        아직 {category} 자료가 없어요.
                    </div>
                ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        {items.map((e) => <MockExamCard key={e.slug} exam={e} />)}
                    </div>
                )}
            </main>
        </div>
    );
}

/* ── 회차 상세 ── */
async function DetailView({ slug }: { slug: string }) {
    const exam = await fetchMockExamBySlug(slug);
    if (!exam) notFound();
    const cat = MOCK_CATEGORIES[exam.category] ?? MOCK_CATEGORIES['전국연합'];
    const previews = exam.preview_urls || [];

    const downloads = [
        { kind: 'original-pdf', has: !!exam.original_pdf_path, group: '원본', fmt: 'PDF' },
        { kind: 'original-hwp', has: !!exam.original_hwp_path, group: '원본', fmt: 'HWP' },
        { kind: 'variant-pdf', has: !!exam.variant_pdf_path, group: '변형', fmt: 'PDF' },
        { kind: 'variant-hwp', has: !!exam.variant_hwp_path, group: '변형', fmt: 'HWP' },
    ].filter((d) => d.has);

    // 구조화 데이터(JSON-LD) — 구글이 "수학 학습자료"로 이해하도록
    const jsonLd = {
        '@context': 'https://schema.org',
        '@type': 'LearningResource',
        name: exam.title,
        description: `${exam.title} 원본 문제와 변형문제를 PDF·HWP로 무료 제공`,
        url: `https://mathetf.com/모의고사/${exam.slug}`,
        learningResourceType: '기출문제',
        educationalUse: '시험 대비',
        educationalLevel: exam.grade || '고등학교',
        about: { '@type': 'Thing', name: '수학' },
        inLanguage: 'ko',
        isAccessibleForFree: true,
        provider: { '@type': 'Organization', name: '수학ETF', url: 'https://mathetf.com' },
        ...(exam.year ? { dateCreated: String(exam.year) } : {}),
        ...(previews.length ? { image: previews } : {}),
    };

    return (
        <div className="min-h-screen bg-gradient-to-b from-[#EEF3FA] to-[#F8FAFD] text-[#1E2D4F] font-sans">
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
            <Header />
            <main className="max-w-[900px] mx-auto px-4 py-7 sm:py-9">
                <Link href={`/모의고사/${exam.category}`} className="inline-flex items-center gap-1 text-sm text-[#497AB7] font-bold hover:underline mb-4">
                    <ArrowLeft size={15} /> {exam.category}
                </Link>

                {/* 헤더 */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-5">
                    <div className="flex items-start justify-between gap-3">
                        <span className={`text-[11px] font-extrabold text-white px-2.5 py-1 rounded-full bg-gradient-to-r ${cat.grad}`}>{exam.category}</span>
                        <MockAdminControls exam={{
                            id: exam.id, category: exam.category, year: exam.year, grade: exam.grade,
                            month: exam.month, subject: exam.subject || '', title: exam.title,
                            hasOriginalPdf: !!exam.original_pdf_path, hasOriginalHwp: !!exam.original_hwp_path,
                            hasVariantPdf: !!exam.variant_pdf_path, hasVariantHwp: !!exam.variant_hwp_path,
                        }} />
                    </div>
                    <h1 className="mt-3 text-xl sm:text-2xl font-black break-keep">{exam.title}</h1>
                    <p className="mt-1.5 text-sm text-slate-400 font-medium">
                        {exam.year} · {exam.grade}{exam.month ? ` · ${exam.month}월` : ''}{exam.subject ? ` · ${exam.subject}` : ''}
                    </p>
                </div>

                {/* 다운로드 */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-5">
                    <h2 className="font-extrabold text-[#1E2D4F] mb-1">자료 다운로드</h2>
                    <p className="text-xs text-slate-400 mb-4">로그인 후 다운로드할 수 있어요 · 무료</p>
                    {downloads.length === 0 ? (
                        <p className="text-sm text-slate-400">등록된 파일이 없어요.</p>
                    ) : (
                        <div className="grid grid-cols-2 gap-2.5">
                            {downloads.map((d) => (
                                <a
                                    key={d.kind}
                                    href={`/api/mock/download?slug=${encodeURIComponent(exam.slug)}&kind=${d.kind}`}
                                    className={`flex items-center justify-between gap-2 rounded-xl px-4 py-3 font-bold text-sm transition-all border ${d.group === '변형'
                                        ? 'bg-[#497AB7]/5 border-[#497AB7]/30 text-[#3A6CAE] hover:bg-[#497AB7]/10'
                                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'}`}
                                >
                                    <span className="flex items-center gap-1.5"><FileText size={15} /> {d.group} {d.fmt}</span>
                                    <Download size={15} />
                                </a>
                            ))}
                        </div>
                    )}
                </div>

                {/* 미리보기 (캐러셀) */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                    <h2 className="font-extrabold text-[#1E2D4F] mb-4">문제 미리보기</h2>
                    {previews.length === 0 ? (
                        <div className="py-12 text-center text-slate-300 text-sm">미리보기 준비 중이에요.</div>
                    ) : (
                        <ExamPreviewCarousel images={previews} label={exam.title} />
                    )}
                </div>
            </main>
        </div>
    );
}
