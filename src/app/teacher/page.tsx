import { createAdminClient } from '@/utils/supabase/server-admin';
import Link from 'next/link';
import { Metadata } from 'next';
import Header from '@/components/Header';
import { PencilRuler, FileDown, Search, Database, ChevronRight, CheckCircle2 } from 'lucide-react';

// 1시간마다 재검증 (문항 수·학교 수 갱신)
export const revalidate = 3600;

const PAGE_URL = 'https://mathetf.com/teacher';

export const metadata: Metadata = {
    title: '수학 시험지 만들기 | 학교 기출 유사문제로 1분 만에 — 수학ETF',
    description: '전국 고등학교 내신 기출을 단원·난이도별로 골라 나만의 수학 시험지를 만드세요. 기출과 같은 유형의 유사문제 자동 추천, 한글(HWP)·PDF 다운로드. 수학 선생님·과외 강사를 위한 무료 문제은행.',
    keywords: [
        '수학 시험지 만들기', '수학 시험지 제작', '내신 시험지 만들기', '수학 학습지 제작',
        '수학 문제은행', '학교별 기출 문제은행', '기출 유사문제', '수학 문제 출제',
        '수학 강사 문제은행', '과외 시험지 제작', 'HWP 수학 시험지', '내신 대비 문제 제작',
    ],
    alternates: { canonical: PAGE_URL },
    openGraph: {
        title: '수학 시험지 만들기 — 학교 기출 유사문제로 1분 만에',
        description: '전국 학교 내신 기출을 단원·난이도로 골라 나만의 시험지를 만들고 한글(HWP)로 받으세요. 선생님·강사 전용 기능, 현재 무료.',
        url: PAGE_URL,
        siteName: '수학ETF',
        locale: 'ko_KR',
        type: 'website',
        images: [{ url: '/og-image.png', width: 1200, height: 630, alt: '수학 시험지 만들기 - 수학ETF' }],
    },
    robots: { index: true, follow: true },
};

const FAQ = [
    {
        q: '수학 시험지를 만드는 데 얼마나 걸리나요?',
        a: '학교와 단원을 고르고 문항을 담으면 1~3분이면 완성됩니다. 담은 문제와 비슷한 유형을 자동으로 찾아주는 유사문제 추천 기능이 있어 빈 시험지를 처음부터 채울 필요가 없습니다.',
    },
    {
        q: '만든 시험지를 한글(HWP) 파일로 받을 수 있나요?',
        a: '네. 완성한 시험지는 한글(HWP)과 PDF로 내려받아 수업 자료로 편집·인쇄할 수 있습니다. 수식과 그림이 원본 그대로 유지됩니다.',
    },
    {
        q: '어떤 문제로 시험지를 만드나요?',
        a: '전국 고등학교의 실제 내신 기출문제입니다. 각 문항은 단원과 난이도가 분류되어 있어 원하는 조건으로 골라낼 수 있고, 학교별 출제 경향을 그대로 반영한 시험지를 만들 수 있습니다.',
    },
    {
        q: '비용이 드나요?',
        a: '현재 회원가입만 하면 기출 DB와 시험지 만들기 기능을 무료로 이용할 수 있습니다.',
    },
    {
        q: '모의고사나 사관학교·경찰대 문제도 있나요?',
        a: '전국연합학력평가, 사관학교 1차, 경찰대 1차 수학 기출과 변형문제도 제공합니다. 원본과 같은 유형의 변형문제까지 있어 실전 연습용 시험지를 만들 수 있습니다.',
    },
];

export default async function TeacherLandingPage() {
    const supabase = createAdminClient();

    // 실데이터 통계 (얇은 페이지 방지 + 신뢰도)
    let questionCount = 0;
    let schoolCount = 0;
    let topSchools: string[] = [];
    try {
        const { count: qc } = await supabase
            .from('questions').select('id', { count: 'exact', head: true }).eq('work_status', 'sorted');
        questionCount = qc ?? 0;

        const { data: mats } = await supabase
            .from('exam_materials').select('school').neq('school', 'DELETED').limit(5000);
        const bySchool: Record<string, number> = {};
        (mats || []).forEach((m: any) => {
            if (m.school) bySchool[m.school] = (bySchool[m.school] || 0) + 1;
        });
        schoolCount = Object.keys(bySchool).length;
        topSchools = Object.entries(bySchool)
            .filter(([s]) => !['경찰대학교', '사관학교', '전국연합'].includes(s))
            .sort((a, b) => b[1] - a[1]).slice(0, 12).map(([s]) => s);
    } catch { }

    const jsonLd = [
        {
            '@context': 'https://schema.org',
            '@type': 'WebPage',
            name: '수학 시험지 만들기',
            description: '전국 학교 내신 기출 유사문제로 나만의 수학 시험지를 만들고 한글(HWP)로 받는 기능. 수학 선생님·강사용.',
            url: PAGE_URL,
        },
        {
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: FAQ.map((f) => ({
                '@type': 'Question',
                name: f.q,
                acceptedAnswer: { '@type': 'Answer', text: f.a },
            })),
        },
        {
            '@context': 'https://schema.org',
            '@type': 'BreadcrumbList',
            itemListElement: [
                { '@type': 'ListItem', position: 1, name: '수학ETF', item: 'https://mathetf.com/' },
                { '@type': 'ListItem', position: 2, name: '수학 시험지 만들기', item: PAGE_URL },
            ],
        },
    ];

    return (
        <div className="min-h-screen bg-[#F8FAFD] text-[#1E2D4F] font-sans">
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
            <Header />
            <main className="max-w-3xl mx-auto px-4 py-8 sm:py-10">
                {/* 히어로 */}
                <section className="text-center">
                    <span className="inline-flex items-center gap-1.5 text-xs font-black text-[#3AADA9] bg-[#E0F7F6] px-3 py-1.5 rounded-full">
                        <PencilRuler size={13} /> 선생님·강사 전용 기능
                    </span>
                    <h1 className="text-3xl sm:text-4xl font-black mt-4 break-keep leading-tight">
                        수학 시험지 만들기
                    </h1>
                    <p className="text-base sm:text-lg text-slate-600 mt-3 break-keep leading-relaxed">
                        전국 학교 내신 기출을 단원·난이도로 골라<br className="hidden sm:block" />
                        <strong className="text-[#1E2D4F]">나만의 시험지를 1분 만에</strong> 만들고 한글(HWP)로 받으세요.
                    </p>

                    {(questionCount > 0 || schoolCount > 0) && (
                        <div className="flex justify-center gap-3 mt-6">
                            {questionCount > 0 && (
                                <div className="bg-white border border-slate-200 rounded-xl px-5 py-3 shadow-sm">
                                    <p className="text-2xl font-black text-[#497AB7]">{questionCount.toLocaleString()}</p>
                                    <p className="text-[11px] font-bold text-slate-500 mt-0.5">분류된 기출 문항</p>
                                </div>
                            )}
                            {schoolCount > 0 && (
                                <div className="bg-white border border-slate-200 rounded-xl px-5 py-3 shadow-sm">
                                    <p className="text-2xl font-black text-[#3AADA9]">{schoolCount.toLocaleString()}</p>
                                    <p className="text-[11px] font-bold text-slate-500 mt-0.5">기출 보유 학교</p>
                                </div>
                            )}
                        </div>
                    )}

                    <div className="flex flex-col sm:flex-row justify-center gap-2.5 mt-6">
                        <Link
                            href="/question-bank?tour=1"
                            className="bg-[#3AADA9] hover:bg-[#2E948F] text-white font-extrabold px-7 py-3.5 rounded-xl transition-colors"
                        >
                            시험지 만들러 가기 →
                        </Link>
                        <a
                            href="https://www.youtube.com/watch?v=2Yt94Ps8rk8&t=5s"
                            target="_blank" rel="noopener noreferrer"
                            className="border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-bold px-6 py-3.5 rounded-xl transition-colors"
                        >
                            ▶ 1분 사용법 영상
                        </a>
                    </div>
                    <p className="text-xs text-slate-400 mt-3">회원가입만 하면 현재 전부 무료</p>
                </section>

                {/* 3단계 */}
                <section className="mt-12">
                    <h2 className="text-xl font-black break-keep">시험지 만드는 순서</h2>
                    <div className="grid gap-3 sm:grid-cols-3 mt-4">
                        {[
                            { icon: Database, n: 'STEP 1', t: '학교 기출 DB 선택', d: '가르치는 학교의 기출 회차를 담습니다. 여러 학교를 함께 담아도 됩니다.' },
                            { icon: Search, n: 'STEP 2', t: '단원·난이도로 검색', d: '출제 범위에 맞는 단원과 난이도를 지정해 문항을 골라냅니다. 유사문제 자동 추천도 있습니다.' },
                            { icon: FileDown, n: 'STEP 3', t: 'HWP·PDF 다운로드', d: '완성한 시험지를 한글 파일로 받아 편집·인쇄합니다. 수식과 그림이 그대로 유지됩니다.' },
                        ].map((s) => (
                            <div key={s.n} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                                <span className="w-10 h-10 rounded-xl bg-[#EEF4FB] text-[#497AB7] flex items-center justify-center mb-3">
                                    <s.icon size={19} />
                                </span>
                                <p className="text-[11px] font-black text-[#497AB7]">{s.n}</p>
                                <p className="font-bold text-[#1E2D4F] mt-0.5 break-keep">{s.t}</p>
                                <p className="text-xs text-slate-500 mt-1.5 leading-relaxed break-keep">{s.d}</p>
                            </div>
                        ))}
                    </div>
                </section>

                {/* 차별점 */}
                <section className="mt-12 bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                    <h2 className="text-xl font-black break-keep">시중 문제은행과 다른 점</h2>
                    <ul className="mt-4 space-y-3">
                        {[
                            ['실제 학교 기출이 원본입니다', '출판사 문제집이 아니라 전국 고등학교가 실제로 출제한 내신 시험지에서 문항을 뽑습니다. 학교별 출제 경향이 그대로 담깁니다.'],
                            ['학교 단위로 골라 담습니다', '가르치는 학생의 학교 기출만 모아 대비 시험지를 만들 수 있습니다. 최근 회차부터 과년도까지 함께 볼 수 있습니다.'],
                            ['한글(HWP)로 받아 바로 편집합니다', '완성본을 HWP로 내려받아 학원·수업 양식에 맞게 고쳐 쓸 수 있습니다. 이미지 캡처가 아니라 편집 가능한 문서입니다.'],
                            ['학원 관리 시스템이 아닙니다', '가입·영업·계약 없이, 검색해서 들어와 바로 만들고 받아 가면 됩니다.'],
                        ].map(([t, d]) => (
                            <li key={t} className="flex gap-2.5">
                                <CheckCircle2 size={17} className="text-[#3AADA9] shrink-0 mt-0.5" />
                                <div>
                                    <p className="font-bold text-sm text-[#1E2D4F] break-keep">{t}</p>
                                    <p className="text-xs text-slate-500 mt-0.5 leading-relaxed break-keep">{d}</p>
                                </div>
                            </li>
                        ))}
                    </ul>
                </section>

                {/* 학교 바로가기 (내부링크) */}
                {topSchools.length > 0 && (
                    <section className="mt-12">
                        <h2 className="text-xl font-black break-keep">학교별 기출로 시작하기</h2>
                        <p className="text-sm text-slate-500 mt-1.5 break-keep">학교 페이지에서 바로 그 학교 기출로 시험지를 만들 수 있습니다.</p>
                        <div className="flex flex-wrap gap-2 mt-4">
                            {topSchools.map((s) => (
                                <Link
                                    key={s}
                                    href={`/school/${encodeURIComponent(s)}`}
                                    className="text-sm bg-white border border-slate-200 hover:border-[#497AB7] hover:text-[#497AB7] text-slate-600 font-bold px-3.5 py-2 rounded-lg transition-colors"
                                >
                                    {s}
                                </Link>
                            ))}
                        </div>
                        <Link href="/schools" className="inline-flex items-center gap-1 text-sm text-[#497AB7] font-bold mt-4 hover:underline">
                            전체 학교 목록 보기 <ChevronRight size={15} />
                        </Link>
                    </section>
                )}

                {/* FAQ */}
                <section className="mt-12">
                    <h2 className="text-xl font-black break-keep">자주 묻는 질문</h2>
                    <div className="space-y-2.5 mt-4">
                        {FAQ.map((f) => (
                            <div key={f.q} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                                <h3 className="font-bold text-[#1E2D4F] break-keep">{f.q}</h3>
                                <p className="text-sm text-slate-600 mt-2 leading-relaxed break-keep">{f.a}</p>
                            </div>
                        ))}
                    </div>
                </section>

                {/* 마무리 CTA */}
                <section className="mt-12 bg-gradient-to-br from-[#497AB7] to-[#3AADA9] rounded-2xl p-7 text-center text-white shadow-md">
                    <p className="font-black text-xl break-keep">수업에 쓸 시험지, 지금 만들어보세요</p>
                    <p className="text-white/85 text-sm mt-2 break-keep">
                        {questionCount > 0 ? `${questionCount.toLocaleString()}개 기출 문항이 단원·난이도별로 준비돼 있습니다.` : '전국 학교 기출이 단원·난이도별로 준비돼 있습니다.'}
                    </p>
                    <Link
                        href="/question-bank?tour=1"
                        className="inline-block bg-white text-[#497AB7] font-extrabold px-7 py-3.5 rounded-xl mt-5 hover:bg-slate-50 transition-colors"
                    >
                        시험지 만들기 시작 →
                    </Link>
                </section>
            </main>
        </div>
    );
}
