import { mockQuestionHref } from '@/lib/mock-question-link';
import {questionBankHref} from '@/lib/discovery';
import Link from 'next/link';
import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ChevronLeft, ChevronRight, Download } from 'lucide-react';
import Header from '@/components/Header';
import MockExamCard, { MOCK_CATEGORIES, MockCategory, CATEGORY_DESC } from '@/components/mock/MockExamCard';
import { getMockCategoryStats } from '@/lib/mock-category-stats';
import ExamPreview from '@/components/exam/ExamPreview';
import MockAdminControls from '@/components/mock/MockAdminControls';
import { fetchMockExamsByCategory, fetchMockExamBySlug, fetchAllMockExams } from '@/lib/mock-exams';
import { proxiedOgImage } from '@/lib/og-image';

// [PERF] ISR — 업로드·수정·삭제는 revalidatePath로 즉시 반영되므로 주기 재생성은 보험용 1시간
export const revalidate = 3600;


const CATEGORIES = Object.keys(MOCK_CATEGORIES) as MockCategory[];
const isCategory = (s: string): s is MockCategory => (CATEGORIES as string[]).includes(s);
// [2026-09-14 전수조사] 이 라우트만 응답이 `Cache-Control: private, no-store` 였다(X-Vercel-Cache 항상 MISS).
//   7e76795f 에서 force-dynamic → revalidate 로 바꿨지만 효과가 없었다.
//   캐시되는 라우트(exam·school·subject·region·study)는 전부 generateStaticParams 가 있고 이것만 없었다.
//   회차 슬러그 + 분류 5개를 빌드 시점에 알려준다. 새 회차는 dynamicParams(기본 true)로 첫 요청 때 생성·캐시.
export async function generateStaticParams() {
    const rows = await fetchAllMockExams();
    return [
        ...CATEGORIES.map((c) => ({ seg: c })),
        ...rows.filter((r) => r.slug).map((r) => ({ seg: r.slug })),
    ];
}


export async function generateMetadata({ params }: { params: { seg: string } }): Promise<Metadata> {
    const seg = decodeURIComponent(params.seg);
    if (isCategory(seg)) {
        const title = `${seg} 수학 기출 자료실 | 수학ETF`;

        // [2026-09-03] 설명에 실제 숫자를 넣는다.
        // 예전엔 `${seg} 수학 기출과 변형문제를 PDF·HWP로 무료 제공합니다.` — 한글 34자에
        // 카테고리 이름만 바뀌는 같은 문장이었다. 15개 페이지가 사실상 동일한 설명을 썼다.
        // 사관학교·경찰대는 내신판에 없는 우리 유일한 해자인데 그 페이지 설명이 제일 성의 없었다.
        // 통계는 이미 getMockCategoryStats 가 뽑고 있으므로 그대로 쓴다(추가 조회 없음 — 아래 본문과 공유).
        const st = await getMockCategoryStats(seg).catch(() => null);
        let description = `${seg} 수학 기출 회차와 문항별 시험지 출제 자료를 살펴보세요.`;
        if (st && st.total > 0) {
            const ys = st.years.map(y => Number(y.year)).filter(Number.isFinite);
            const span = ys.length ? (Math.min(...ys) === Math.max(...ys)
                ? `${Math.max(...ys)}년`
                : `${Math.min(...ys)}~${Math.max(...ys)}년 ${ys.length}개년`) : '';
            const subj = st.bySubject.slice(0, 3).map(x => x.subject).join('·');
            const unit = st.byUnit.slice(0, 3).map(x => x.unit).join('·');
            description = `${seg} 수학 기출 ${span} 총 ${st.total}문항. `
                + (subj ? `${subj} 과목별로 정리했고, ` : '')
                + (unit ? `${unit} 단원이 가장 많이 출제됐습니다. ` : '')
                + `문항별 출제 자료와 등록된 원본 파일을 살펴보세요.`;
        }
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
    const title = exam.materialOnly
        ? `${exam.title} 문항별 시험지 출제 | 수학ETF`
        : `${exam.title} 문제·해설·변형문제 | 수학ETF`;
    const description = exam.materialOnly
        ? `${exam.title} 기출문항을 과목별로 골라 시험지로 출제하세요.`
        : `${exam.title} 원본 문제와 변형문제를 PDF·HWP로 무료 다운로드하세요.`;
    return {
        title,
        description,
        ...(exam.materialOnly ? { robots: { index: false, follow: true } } : {}),
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
                description: `${category} 수학 기출문제를 학년·연도·월별로 모았습니다. 문항별 출제 자료와 등록된 원본 파일을 제공합니다.`,
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
    const maxSubj = Math.max(1, ...(stats?.bySubject || []).map(x => x.count));
    const maxUnit = Math.max(1, ...(stats?.byUnit || []).map(x => x.count));
    return (
        <div className="rd rd-x">
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
            <Header />
            <div>
                <section className="rd-wrap rd-x-top">
                    <Link href="/모의고사" className="rd-x-back"><ChevronLeft size={18} aria-hidden="true" />모의고사 전체</Link>
                    <h1 className="rd-x-h1 rd-s-h1">{category} 수학<br />기출 자료실</h1>
                    <p className="rd-lead">{CATEGORY_DESC[category] || ''} 원본 파일과 문항별 출제 자료 {items.length}회차를 모았습니다.</p>
                </section>

                <section className="rd-wrap rd-s-list">
                    {items.length === 0 ? <p className="rd-cat-empty">아직 {category} 자료가 없어요.</p>
                        : <div className="rd-mk-grid">{items.map((e) => <MockExamCard key={e.slug} exam={e} />)}</div>}
                </section>

                {/* 우리 분류 데이터로 만든 출제 분석. 문제 원문이 아니라 통계라 저작권 문제가 없다.
                    이 페이지가 본문 981자로 사이트에서 제일 얇았는데, '사관학교 기출' 은 월 6,650회로
                    우리가 가진 단일 키워드 중 수요가 가장 크다(네이버 유기 12등). */}
                {stats && <section className="rd-s-zone" aria-labelledby="mock-analysis-title">
                    <div className="rd-wrap">
                        <p className="rd-kicker">출제 분석</p>
                        <h2 id="mock-analysis-title" className="rd-x-h2">{category} 수학 기출 출제 분석</h2>
                        <div className="rd-s-prose">
                            <p>수학ETF가 보유한 {category} 수학 기출 <b>{stats.total.toLocaleString()}문항</b>을 과목·단원·난이도로 분류한 결과입니다. 다운로드 파일 수가 아닌 시험지 출제용 문항 수이며, 원본·변형 PDF와 HWP는 별도로 등록된 회차에서만 받을 수 있습니다.
                                {stats.years.length > 1 && <> {stats.years[stats.years.length - 1].year}년부터 {stats.years[0].year}년까지 {stats.years.length}개년, 연도당 평균 {Math.round(stats.total / stats.years.length)}문항입니다.</>}</p>
                            <p>평균 난이도는 10점 만점에 <b>{stats.avgDifficulty.toFixed(1)}점</b>이고, 난이도 분포는 쉬움 {Math.round(stats.easy / stats.total * 100)}%, 보통 {Math.round(stats.mid / stats.total * 100)}%, 어려움 {Math.round(stats.hard / stats.total * 100)}%입니다.
                                {' '}출제 비중이 큰 단원은 {stats.byUnit.slice(0, 3).map((u, i) => <span key={u.unit}>{i > 0 ? ', ' : ''}<b>{u.unit}</b> {u.count}문항</span>)} 순입니다.</p>
                        </div>
                        <div className="rd-mk-stats">
                            <div className="rd-s-unitcard">
                                <div className="rd-s-unithead"><h3>과목별 출제</h3></div>
                                <div className="rd-x-bars is-tight">{stats.bySubject.slice(0, 7).map(x => <div key={x.subject} className="rd-x-bar is-small">
                                    <span title={x.subject}>{x.subject}</span><div className="rd-x-track"><span style={{ width: `${Math.round(x.count / maxSubj * 100)}%` }} /></div><span>{x.count}</span>
                                </div>)}</div>
                            </div>
                            <div className="rd-s-unitcard">
                                <div className="rd-s-unithead"><h3>단원별 출제</h3></div>
                                <div className="rd-x-bars is-tight">{stats.byUnit.slice(0, 7).map(x => <div key={x.unit} className="rd-x-bar is-small">
                                    <span title={x.unit}>{x.unit}</span><div className="rd-x-track"><span style={{ width: `${Math.round(x.count / maxUnit * 100)}%` }} /></div><span>{x.count}</span>
                                </div>)}</div>
                            </div>
                        </div>
                        {stats.years.length > 1 && <>
                            <h3 className="rd-x-sub">연도별 보유 문항</h3>
                            <div className="rd-x-concepts">{stats.years.map(y => <span key={y.year}>{y.year}년 <b>{y.count}</b></span>)}</div>
                        </>}
                    </div>
                </section>}
            </div>
        </div>
    );
}

/* ── 회차 상세 ── */
async function DetailView({ slug }: { slug: string }) {
    const exam = await fetchMockExamBySlug(slug);
    if (!exam) notFound();
    const cat = MOCK_CATEGORIES[exam.category] ?? MOCK_CATEGORIES['전국연합'];
    const previews = exam.preview_urls || [];
    const createHref = mockQuestionHref(exam);
    const hasVariant = !!(exam.variant_pdf_path || exam.variant_hwp_path);

    const related = (await fetchMockExamsByCategory(exam.category)).filter((e) => e.slug !== exam.slug).slice(0, 4);

    const downloads = [
        { kind: 'original-pdf', has: !!exam.original_pdf_path, group: '원본', fmt: 'PDF' },
        { kind: 'original-hwp', has: !!exam.original_hwp_path, group: '원본', fmt: 'HWP' },
        { kind: 'variant-pdf', has: !!exam.variant_pdf_path, group: '변형', fmt: 'PDF' },
        { kind: 'variant-hwp', has: !!exam.variant_hwp_path, group: '변형', fmt: 'HWP' },
    ].filter((d) => d.has);

    const intro = exam.materialOnly
        ? `${exam.title} 기출문항을 과목별로 골라 시험지를 만들 수 있습니다. ${CATEGORY_DESC[exam.category] || ''}`
        : `${exam.title} 기출입니다. 원본 문제${hasVariant ? '와 변형문제까지' : '를'} PDF·HWP로 무료로 받아 ${exam.category} 대비에 활용하세요. ${CATEGORY_DESC[exam.category] || ''}`;

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

    const meta = [String(exam.year), exam.grade, exam.month ? `${exam.month}월` : '', exam.subject || ''].filter(Boolean);
    return (
        <div className="rd rd-x">
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
            <Header />
            <div>
                <section className="rd-wrap rd-x-top">
                    <nav className="rd-mk-crumb" aria-label="위치">
                        <Link href="/모의고사">모의고사</Link><ChevronRight size={14} aria-hidden="true" />
                        <Link href={`/모의고사/${exam.category}`}>{exam.category}</Link><ChevronRight size={14} aria-hidden="true" />
                        <span>{exam.year} {exam.grade}</span>
                    </nav>
                    <h1 className="rd-x-h1">{exam.title}</h1>
                    <div className="rd-x-meta">
                        <span className="rd-pill is-accent">{exam.category}</span>
                        {meta.map(m => <span key={m} className="rd-pill">{m}</span>)}
                        {!exam.materialOnly && <MockAdminControls exam={{
                            id: exam.id, category: exam.category, year: exam.year, grade: exam.grade,
                            month: exam.month, subject: exam.subject || '', title: exam.title,
                            hasOriginalPdf: !!exam.original_pdf_path, hasOriginalHwp: !!exam.original_hwp_path,
                            hasVariantPdf: !!exam.variant_pdf_path, hasVariantHwp: !!exam.variant_hwp_path,
                        }} />}
                    </div>
                    <p className="rd-lead rd-mk-intro">{intro}</p>
                </section>

                <section className="rd-wrap">
                    <div className="rd-x-main">
                        <div className="rd-x-left">
                            <section id="exam-preview" className="rd-x-prev" aria-labelledby="mock-preview-title">
                                <div className="rd-x-prev-head">
                                    <h2 id="mock-preview-title">문제 미리보기</h2>
                                    <p>{exam.materialOnly ? '이 회차는 문항을 골라 시험지로 만들 수 있어요.' : '로그인 없이 볼 수 있어요.'}</p>
                                </div>
                                {previews.length > 0 ? <ExamPreview images={previews} label={exam.title} /> : <p className="rd-x-empty">{exam.materialOnly ? '원본 파일은 아직 등록되지 않았습니다.' : '미리보기를 준비 중이에요.'}</p>}
                            </section>
                        </div>

                        <aside id="exam-side" className="rd-x-side" aria-label="시험지 만들기와 파일 받기">
                            <div className="rd-get-stack">
                                {createHref ? <div className="rd-get-card">
                                    <p className="rd-get-kicker">시험지 만들기</p>
                                    <h2 className="rd-get-title">이 회차 문항으로 시험지 만들기</h2>
                                    <p className="rd-get-text">이 회차 문항을 바로 불러옵니다. 필요한 문제만 골라 나만의 시험지를 만드세요.</p>
                                    <Link href={createHref} className="rd-btn rd-btn-primary rd-btn-block">문항 골라 만들기</Link>
                                </div> : <p className="rd-get-card is-zone rd-get-text">이 회차의 출제 문항은 준비 중입니다. 등록된 파일은 아래에서 받을 수 있습니다.</p>}

                                {!exam.materialOnly && <div className="rd-get-card is-zone">
                                    <p className="rd-get-kicker is-gray">회원 무료</p>
                                    <h2 className="rd-get-title">파일 받기</h2>
                                    {downloads.length === 0 ? <p className="rd-get-text">등록된 파일이 없어요.</p> : (['원본', '변형'] as const).map(group => {
                                        const list = downloads.filter(d => d.group === group);
                                        if (!list.length) return null;
                                        return <div key={group} className="rd-mk-dl">
                                            <p><b>{group}</b> {group === '변형' ? '같은 유형·난이도의 새 문제' : '실제 시험 문제 그대로'}</p>
                                            <div>{list.map(d => <a key={d.kind} href={`/api/mock/download?slug=${encodeURIComponent(exam.slug)}&kind=${d.kind}`} className="rd-cart-btn">
                                                <Download size={17} aria-hidden="true" />{group} {d.fmt}
                                            </a>)}</div>
                                        </div>;
                                    })}
                                    <p className="rd-get-foot">로그인 후 받을 수 있어요.</p>
                                </div>}
                            </div>
                        </aside>
                    </div>
                </section>

                {related.length > 0 && <section className="rd-x-more" aria-labelledby="mock-related-title">
                    <div className="rd-wrap">
                        <h2 id="mock-related-title" className="rd-x-h2">같은 {exam.category} 다른 회차</h2>
                        <div className="rd-mk-grid rd-mk-grid-related">{related.map((e) => <MockExamCard key={e.slug} exam={e} />)}</div>
                        <div className="rd-x-links">
                            <Link href={`/모의고사/${exam.category}`} className="rd-link">{exam.category} 자료실 전체 보기</Link>
                            <Link href="/모의고사" className="rd-link">모의고사 전체 보기</Link>
                        </div>
                        <p className="rd-x-note">자료 출처: 해당 시험 주관 기관, 학습 목적 제공</p>
                    </div>
                </section>}
            </div>
        </div>
    );
}
