import Link from 'next/link';
import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ArrowLeft, Download, FileText } from 'lucide-react';
import Header from '@/components/Header';
import MockExamCard, { MOCK_CATEGORIES, MockCategory, CATEGORY_DESC } from '@/components/mock/MockExamCard';
import { getMockCategoryStats } from '@/lib/mock-category-stats';
import ExamPreviewCarousel from '@/components/ExamPreviewCarousel';
import MockAdminControls from '@/components/mock/MockAdminControls';
import { fetchMockExamsByCategory, fetchMockExamBySlug } from '@/lib/mock-exams';
import { proxiedOgImage } from '@/lib/og-image';

// [PERF] ISR — 업로드·수정·삭제는 revalidatePath로 즉시 반영되므로 주기 재생성은 보험용 1시간
export const revalidate = 3600;

const CATEGORIES = Object.keys(MOCK_CATEGORIES) as MockCategory[];
const isCategory = (s: string): s is MockCategory => (CATEGORIES as string[]).includes(s);

export async function generateMetadata({ params }: { params: { seg: string } }): Promise<Metadata> {
    const seg = decodeURIComponent(params.seg);
    if (isCategory(seg)) {
        const title = `${seg} 수학 기출·변형문제 모음 | 수학ETF`;
        const description = `${seg} 수학 기출과 변형문제를 PDF·HWP로 무료 제공합니다.`;
        return {
            title,
            description,
            alternates: { canonical: `/모의고사/${seg}` },
            // openGraph 미지정 시 홈 og(title/url)를 상속해 공유 카드가 홈으로 뜨는 것 방지
            openGraph: { title, description, url: `https://mathetf.com/모의고사/${encodeURIComponent(seg)}`, images: ['/og-image.png'] },
        };
    }
    const exam = await fetchMockExamBySlug(seg);
    if (!exam) return { title: '모의고사 | 수학ETF' };
    const title = `${exam.title} 문제·해설·변형문제 | 수학ETF`;
    const description = `${exam.title} 원본 문제와 변형문제를 PDF·HWP로 무료 다운로드하세요.`;
    return {
        title,
        description,
        alternates: { canonical: `/모의고사/${exam.slug}` },
        openGraph: {
            title,
            description,
            url: `https://mathetf.com/모의고사/${encodeURIComponent(exam.slug)}`,
            images: exam.preview_urls?.length ? [proxiedOgImage(exam.preview_urls[0])] : ['/og-image.png'],
        },
    };
}

export default async function MockSegPage({ params }: { params: { seg: string } }) {
    const seg = decodeURIComponent(params.seg);
    return isCategory(seg) ? <CategoryView category={seg} /> : <DetailView slug={seg} />;
}

/* ── 분류 목록 ── */
async function CategoryView({ category }: { category: MockCategory }) {
    const items = await fetchMockExamsByCategory(category);
    const stats = await getMockCategoryStats(category);
    const cat = MOCK_CATEGORIES[category];
    // [SEO] 개별 회차 페이지에는 JSON-LD 가 있었지만 카테고리 목록에는 없었다.
    // 사관학교·경찰대는 우리 최대 유입 경로라 구조화 데이터를 갖춰둔다.
    const url = `https://mathetf.com/모의고사/${encodeURIComponent(category)}`;
    const jsonLd = {
        '@context': 'https://schema.org',
        '@graph': [
            {
                '@type': 'CollectionPage',
                name: `${category} 수학 기출문제`,
                description: `${category} 수학 기출문제와 변형문제를 학년·연도·월별로 모았습니다. 문제와 해설을 PDF·한글(HWP)로 무료 제공합니다.`,
                url,
                inLanguage: 'ko-KR',
                isPartOf: { '@type': 'WebSite', name: '수학ETF', url: 'https://mathetf.com' },
                mainEntity: {
                    '@type': 'ItemList',
                    numberOfItems: items.length,
                    itemListElement: items.slice(0, 30).map((e, i) => ({
                        '@type': 'ListItem',
                        position: i + 1,
                        name: e.title,
                        url: `https://mathetf.com/모의고사/${encodeURIComponent(e.slug)}`,
                    })),
                },
            },
            {
                '@type': 'BreadcrumbList',
                itemListElement: [
                    { '@type': 'ListItem', position: 1, name: '홈', item: 'https://mathetf.com' },
                    { '@type': 'ListItem', position: 2, name: '모의고사', item: 'https://mathetf.com/모의고사' },
                    { '@type': 'ListItem', position: 3, name: category, item: url },
                ],
            },
        ],
    };
    return (
        <div className="min-h-screen bg-gradient-to-b from-[#EEF3FA] to-[#F8FAFD] text-[#1E2D4F] font-sans">
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
            <Header />
            <main className="max-w-[1140px] mx-auto px-4 py-7 sm:py-9">
                <Link href="/모의고사" className="inline-flex items-center gap-1 text-sm text-[#497AB7] font-bold hover:underline mb-4">
                    <ArrowLeft size={15} /> 모의고사 전체
                </Link>
                <div className="flex items-center gap-3 mb-3">
                    <span className={`w-2 h-7 rounded-full bg-gradient-to-b ${cat.bar}`} />
                    <h1 className="text-2xl sm:text-3xl font-black">{category}</h1>
                    <span className="text-sm font-bold text-slate-400 bg-white border border-slate-200 px-2.5 py-0.5 rounded-full">{items.length}</span>
                </div>
                <p className="text-sm text-slate-600 leading-relaxed break-keep mb-6 max-w-3xl">
                    {CATEGORY_DESC[category] ? `${CATEGORY_DESC[category]} ` : ''}
                    {category} 수학 기출문제와 같은 유형의 변형문제를 학년·연도·월별로 모았습니다.
                    원본과 변형 모두 PDF·한글(HWP)로 무료 다운로드할 수 있어요.
                </p>
                {items.length === 0 ? (
                    <div className="py-20 text-center bg-white rounded-2xl border border-slate-200 text-slate-400 font-semibold">
                        아직 {category} 자료가 없어요.
                    </div>
                ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        {items.map((e) => <MockExamCard key={e.slug} exam={e} />)}
                    </div>
                )}

                {/* 우리 분류 데이터로 만든 출제 분석. 문제 원문이 아니라 통계라 저작권 문제가 없다.
                    이 페이지가 본문 981자로 사이트에서 제일 얇았는데, '사관학교 기출' 은 월 6,650회로
                    우리가 가진 단일 키워드 중 수요가 가장 크다(네이버 유기 12등). */}
                {stats && (
                    <section className="mt-8 bg-white rounded-2xl border border-slate-200 shadow-sm p-5 sm:p-6">
                        <h2 className="text-base font-bold text-slate-800 mb-3">{category} 수학 기출 출제 분석</h2>
                        <div className="space-y-3 text-sm text-slate-600 leading-relaxed break-keep">
                            <p>
                                수학ETF가 보유한 {category} 수학 기출{' '}
                                <strong className="text-[#1E2D4F]">{stats.total.toLocaleString()}문항</strong>을
                                과목·단원·난이도로 분류한 결과입니다.
                                {stats.years.length > 1 && (
                                    <> {stats.years[stats.years.length - 1].year}년부터 {stats.years[0].year}년까지
                                    {' '}{stats.years.length}개년, 회차당 평균 {Math.round(stats.total / stats.years.length)}문항입니다.</>
                                )}
                            </p>
                            <p>
                                평균 난이도는 10점 만점에 <strong className="text-[#1E2D4F]">{stats.avgDifficulty.toFixed(1)}점</strong>이고,
                                난이도 분포는 쉬움 {Math.round(stats.easy / stats.total * 100)}% ·
                                보통 {Math.round(stats.mid / stats.total * 100)}% ·
                                어려움 {Math.round(stats.hard / stats.total * 100)}% 입니다.
                                출제 비중이 큰 단원은{' '}
                                {stats.byUnit.slice(0, 3).map((u, i) => (
                                    <span key={u.unit}>{i > 0 ? ', ' : ''}<strong className="text-[#1E2D4F]">{u.unit}</strong> {u.count}문항</span>
                                ))}
                                {' '}순입니다.
                            </p>
                        </div>

                        <div className="grid sm:grid-cols-2 gap-5 mt-5">
                            <div>
                                <h3 className="text-xs font-bold text-slate-500 mb-2">과목별 출제</h3>
                                <table className="w-full text-sm">
                                    <tbody>
                                        {stats.bySubject.slice(0, 7).map((x) => (
                                            <tr key={x.subject} className="border-b border-slate-100 last:border-0">
                                                <td className="py-1.5 text-slate-600 break-keep">{x.subject}</td>
                                                <td className="py-1.5 text-right font-bold text-[#497AB7] tabular-nums">{x.count}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <div>
                                <h3 className="text-xs font-bold text-slate-500 mb-2">단원별 출제</h3>
                                <table className="w-full text-sm">
                                    <tbody>
                                        {stats.byUnit.slice(0, 7).map((x) => (
                                            <tr key={x.unit} className="border-b border-slate-100 last:border-0">
                                                <td className="py-1.5 text-slate-600 break-keep">{x.unit}</td>
                                                <td className="py-1.5 text-right font-bold text-[#3AADA9] tabular-nums">{x.count}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {stats.years.length > 1 && (
                            <div className="mt-5">
                                <h3 className="text-xs font-bold text-slate-500 mb-2">연도별 보유 문항</h3>
                                <div className="flex flex-wrap gap-1.5">
                                    {stats.years.map((y) => (
                                        <span key={y.year} className="text-[11px] bg-slate-50 border border-slate-200 text-slate-600 font-semibold px-2.5 py-1 rounded-lg">
                                            {y.year} <strong className="text-[#497AB7]">{y.count}</strong>
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </section>
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
    const hasVariant = !!(exam.variant_pdf_path || exam.variant_hwp_path);

    const related = (await fetchMockExamsByCategory(exam.category)).filter((e) => e.slug !== exam.slug).slice(0, 4);

    const downloads = [
        { kind: 'original-pdf', has: !!exam.original_pdf_path, group: '원본', fmt: 'PDF' },
        { kind: 'original-hwp', has: !!exam.original_hwp_path, group: '원본', fmt: 'HWP' },
        { kind: 'variant-pdf', has: !!exam.variant_pdf_path, group: '변형', fmt: 'PDF' },
        { kind: 'variant-hwp', has: !!exam.variant_hwp_path, group: '변형', fmt: 'HWP' },
    ].filter((d) => d.has);

    const intro = `${exam.title} 기출입니다. 원본 문제${hasVariant ? '와 변형문제까지' : '를'} PDF·HWP로 무료로 받아 ${exam.category} 대비에 활용하세요. ${CATEGORY_DESC[exam.category] || ''}`;

    const jsonLd = {
        '@context': 'https://schema.org',
        '@type': 'LearningResource',
        name: exam.title,
        description: intro,
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
                {/* 브레드크럼 */}
                <nav className="text-xs text-slate-400 font-medium mb-3">
                    <Link href="/모의고사" className="hover:text-[#497AB7]">모의고사</Link>
                    <span className="mx-1.5">›</span>
                    <Link href={`/모의고사/${exam.category}`} className="hover:text-[#497AB7]">{exam.category}</Link>
                    <span className="mx-1.5">›</span>
                    <span className="text-slate-500">{exam.year} {exam.grade}</span>
                </nav>

                {/* 헤더 + 설명 */}
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
                    <p className="mt-4 text-sm text-slate-600 leading-relaxed break-keep">{intro}</p>
                </div>

                {/* 다운로드 */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-5">
                    <h2 className="font-extrabold text-[#1E2D4F] mb-1">자료 다운로드</h2>
                    <p className="text-xs text-slate-400 mb-4">로그인 후 다운로드할 수 있어요 · 무료</p>
                    {downloads.length === 0 ? (
                        <p className="text-sm text-slate-400">등록된 파일이 없어요.</p>
                    ) : (
                        <div className="grid sm:grid-cols-2 gap-3">
                            {(['원본', '변형'] as const).map((group) => {
                                const items = downloads.filter((d) => d.group === group);
                                if (items.length === 0) return null;
                                const isVariant = group === '변형';
                                return (
                                    <div
                                        key={group}
                                        className={`rounded-2xl border p-4 ${isVariant
                                            ? 'border-[#5CC6C3]/50 bg-gradient-to-br from-[#497AB7]/5 to-[#3AADA9]/10'
                                            : 'border-slate-200 bg-slate-50/60'}`}
                                    >
                                        <div className="flex items-baseline gap-2 mb-0.5">
                                            <span className={`text-sm font-extrabold ${isVariant ? 'text-[#3AADA9]' : 'text-[#1E2D4F]'}`}>{group}</span>
                                            {isVariant && <span className="text-[10px] font-extrabold text-white bg-gradient-to-r from-[#497AB7] to-[#3AADA9] px-2 py-0.5 rounded-full">한 번 더 연습</span>}
                                        </div>
                                        <p className="text-[11px] text-slate-500 mb-3 break-keep">
                                            {isVariant ? '같은 유형·난이도의 새 문제' : '실제 시험 문제 그대로'}
                                        </p>
                                        <div className="flex gap-2">
                                            {items.map((d) => (
                                                <a
                                                    key={d.kind}
                                                    href={`/api/mock/download?slug=${encodeURIComponent(exam.slug)}&kind=${d.kind}`}
                                                    className="group/dl flex-1 flex items-center justify-center gap-1.5 bg-white rounded-xl px-3 py-2.5 border border-slate-200 shadow-sm font-extrabold text-sm text-slate-700 hover:shadow-md hover:-translate-y-0.5 transition-all"
                                                >
                                                    <span className={`w-6 h-6 rounded-md flex items-center justify-center text-[9px] font-black text-white ${d.fmt === 'PDF' ? 'bg-rose-500' : 'bg-[#3AADA9]'}`}>
                                                        {d.fmt === 'PDF' ? 'P' : 'H'}
                                                    </span>
                                                    {d.fmt}
                                                    <Download size={14} className="text-slate-400 group-hover/dl:text-[#497AB7] transition-colors" />
                                                </a>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* 미리보기 (캐러셀) */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-5">
                    <h2 className="font-extrabold text-[#1E2D4F] mb-4">문제 미리보기</h2>
                    {previews.length === 0 ? (
                        <div className="py-12 text-center text-slate-300 text-sm">미리보기 준비 중이에요.</div>
                    ) : (
                        <ExamPreviewCarousel images={previews} label={exam.title} />
                    )}
                </div>

                {/* 관련 회차 */}
                {related.length > 0 && (
                    <div className="mb-2">
                        <div className="flex items-center gap-2.5 mb-4">
                            <span className={`w-1.5 h-5 rounded-full bg-gradient-to-b ${cat.bar}`} />
                            <h2 className="text-lg font-extrabold">같은 {exam.category} 다른 회차</h2>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            {related.map((e) => <MockExamCard key={e.slug} exam={e} />)}
                        </div>
                    </div>
                )}

                {/* 출처 */}
                <p className="text-center text-xs text-slate-300 mt-8">자료 출처: 해당 시험 주관 기관 · 학습 목적 제공</p>
            </main>
        </div>
    );
}
