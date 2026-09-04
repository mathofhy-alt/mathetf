import Link from 'next/link';
import { Metadata } from 'next';
import Header from '@/components/Header';
import { ChevronRight, MapPin } from 'lucide-react';
import { buildRegionTree } from '@/lib/region-hub';

// [PERF] ISR — 자료 등록 배치가 끝나면 revalidate 로 즉시 갱신된다. 주기 재생성은 보험용 1시간.
export const revalidate = 3600;

// ⚠ 정식 주소는 한글 `/지역` 이다. next start 에서 리터럴 한글 라우트 매칭이 깨져
//   미들웨어가 /지역 → /region 으로 rewrite 한다 (/모의고사 와 같은 방식).
export const metadata: Metadata = {
    title: '지역별 고등학교 수학 기출 자료 | 수학ETF',
    description: '서울 강남구·송파구를 비롯한 전국 시·도, 구·군별 고등학교 수학 내신 기출문제를 모았습니다. 우리 지역 학교의 중간고사·기말고사 기출을 찾아보세요.',
    alternates: { canonical: '/지역' },
    openGraph: {
        title: '지역별 고등학교 수학 기출 자료 | 수학ETF',
        description: '전국 시·도, 구·군별 고등학교 수학 내신 기출문제 모음.',
        url: 'https://mathetf.com/지역',
        images: ['/og-image.png'],
    },
};

export default async function RegionHubPage() {
    const tree = await buildRegionTree();
    const totalSchools = tree.reduce((n, s) => n + s.schoolCount, 0);
    const totalExams = tree.reduce((n, s) => n + s.examCount, 0);

    const jsonLd = {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
            { '@type': 'ListItem', position: 1, name: '홈', item: 'https://mathetf.com' },
            { '@type': 'ListItem', position: 2, name: '지역별 기출', item: 'https://mathetf.com/지역' },
        ],
    };

    return (
        <div className="min-h-screen bg-[#F8FAFD] text-[#1E2D4F] font-sans">
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
            <Header />
            <main className="max-w-5xl mx-auto px-4 py-8">
                <nav className="text-xs text-slate-400 mb-3">
                    <Link href="/" className="hover:text-[#497AB7]">홈</Link>
                    <span className="mx-1.5">/</span>
                    <span className="text-slate-500 font-semibold">지역별 기출</span>
                </nav>

                <h1 className="text-2xl sm:text-3xl font-black break-keep">지역별 고등학교 수학 기출</h1>
                <p className="text-slate-500 mt-2 break-keep">
                    전국 <strong className="text-[#1E2D4F]">{totalSchools}개 고등학교</strong>의 수학 내신 기출{' '}
                    <strong className="text-[#1E2D4F]">{totalExams}회차</strong>를 시·도와 구·군으로 묶었습니다.
                    지역을 고르면 그 지역 학교의 중간고사·기말고사 기출을 한눈에 볼 수 있어요.
                </p>

                <div className="mt-8 space-y-5">
                    {tree.map((s) => (
                        <section key={s.sido} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                            <div className="flex items-center justify-between gap-3 mb-3">
                                <div className="flex items-center gap-2">
                                    <MapPin size={17} className="text-[#497AB7]" />
                                    {s.hasPage ? (
                                        <Link href={`/지역/${s.sido}`} className="text-lg font-extrabold hover:text-[#497AB7] transition-colors">
                                            {s.sido}
                                        </Link>
                                    ) : (
                                        <span className="text-lg font-extrabold">{s.sido}</span>
                                    )}
                                    <span className="text-xs font-bold text-slate-400 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-full">
                                        {s.schoolCount}개교 · {s.examCount}회차
                                    </span>
                                </div>
                                {s.hasPage && (
                                    <Link href={`/지역/${s.sido}`} className="group inline-flex items-center gap-1 text-sm font-bold text-[#497AB7] hover:text-[#3A6CAE] shrink-0">
                                        전체보기 <ChevronRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
                                    </Link>
                                )}
                            </div>

                            <div className="flex flex-wrap gap-2">
                                {s.districts.map((d) =>
                                    d.hasPage ? (
                                        <Link
                                            key={d.gu}
                                            href={`/지역/${s.sido}/${d.gu}`}
                                            className="text-sm font-bold text-[#497AB7] bg-[#EEF4FB] border border-[#B7D1EA]/60 px-3 py-1.5 rounded-full hover:bg-[#E0ECF9] transition-colors"
                                        >
                                            {d.gu} <span className="font-normal text-[#5b7ea8]">{d.schools.length}</span>
                                        </Link>
                                    ) : (
                                        /* 학교가 2곳 이하인 지역은 자체 페이지를 만들지 않는다 —
                                           내용이 거의 없는 페이지를 늘리면 색인에 해가 된다. 학교로 바로 보낸다. */
                                        <span key={d.gu} className="text-sm text-slate-500 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-full">
                                            {d.gu}{' '}
                                            {d.schools.map((sc, i) => (
                                                <span key={sc.name}>
                                                    {i > 0 && ' · '}
                                                    <Link href={`/school/${encodeURIComponent(sc.name)}`} className="font-bold text-slate-600 hover:text-[#497AB7]">
                                                        {sc.name.replace('등학교', '')}
                                                    </Link>
                                                </span>
                                            ))}
                                        </span>
                                    )
                                )}
                            </div>
                        </section>
                    ))}
                </div>

                {tree.length === 0 && (
                    <div className="py-20 text-center bg-white rounded-2xl border border-slate-200 mt-8">
                        <p className="text-slate-400 font-semibold">지역 정보를 불러오지 못했어요.</p>
                    </div>
                )}

                <div className="mt-8 flex flex-wrap gap-2">
                    <Link href="/schools" className="text-sm font-bold text-[#497AB7] bg-white border border-slate-200 px-4 py-2 rounded-xl hover:border-[#497AB7] transition-colors">학교명으로 찾기 →</Link>
                    <Link href="/question-bank" className="text-sm font-bold text-white bg-[#497AB7] px-4 py-2 rounded-xl hover:bg-[#3A6CAE] transition-colors">기출로 시험지 만들기 →</Link>
                </div>
            </main>
        </div>
    );
}
