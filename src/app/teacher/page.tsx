import {FREE_ACCESS_LABEL} from '@/lib/config';
import RdAccessPolicy from '@/components/RdAccessPolicy';
import { getSiteStats } from '@/lib/stats';
import Link from 'next/link';
import Image from 'next/image';
import { Metadata } from 'next';
import Header from '@/components/Header';
import TeacherWorkflow from '@/components/TeacherWorkflow';
import { ChevronRight } from 'lucide-react';

// 1시간마다 재검증 (문항 수·학교 수 갱신)
export const revalidate = 3600;

const PAGE_URL = 'https://mathetf.com/teacher';

export const metadata: Metadata = {
    title: '수학 시험지 만들기 | 학교 기출 유사문제로 직접 — 수학ETF',
    description: '전국 고등학교 내신 기출을 단원·난이도별로 골라 나만의 수학 시험지를 만드세요. 기출과 같은 유형의 유사문제 자동 추천, 편집용 HML 다운로드 · PDF는 한글에서 변환. 수학 선생님·과외 강사를 위한 무료 문제은행.',
    keywords: [
        '수학 시험지 만들기', '수학 시험지 제작', '내신 시험지 만들기', '수학 학습지 제작',
        '수학 문제은행', '학교별 기출 문제은행', '기출 유사문제', '수학 문제 출제',
        '수학 강사 문제은행', '과외 시험지 제작', 'HWP 수학 시험지', '내신 대비 문제 제작',
    ],
    alternates: { canonical: PAGE_URL },
    openGraph: {
        title: '수학 시험지 만들기 — 학교 기출 유사문제로 직접',
        description: `전국 학교 내신 기출을 단원·난이도로 골라 나만의 시험지를 만들고 한글 호환 HML로 받으세요. 학생·교사 모두 무료로 써 볼 수 있습니다.`,
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
        a: '학교와 단원을 고르고 문항을 담은 뒤 구성을 확인하고 저장할 수 있습니다. 담은 문제와 비슷한 유형을 자동으로 찾아주는 유사문제 추천 기능이 있어 빈 시험지를 처음부터 채울 필요가 없습니다.',
    },
    {
        q: '만든 시험지를 한글 호환 HML 파일로 받을 수 있나요?',
        a: '네. 완성한 시험지는 HML 파일로 받습니다. 한글에서 열어 편집·인쇄하고 PDF로 저장할 수 있습니다. 내려받은 파일의 수식·그림·페이지 배치는 출력 전에 확인하세요.',
    },
    {
        q: '어떤 문제로 시험지를 만드나요?',
        a: '전국 고등학교의 실제 내신 기출문제입니다. 각 문항은 단원과 난이도가 분류되어 있어 원하는 조건으로 골라낼 수 있고, 학교별 출제 경향을 그대로 반영한 시험지를 만들 수 있습니다.',
    },
    {
        q: '비용이 드나요?',
        a: FREE_ACCESS_LABEL,
    },
    {
        q: '모의고사나 사관학교·경찰대 문제도 있나요?',
        a: '전국연합학력평가, 사관학교 1차, 경찰대 1차 수학 기출과 변형문제도 제공합니다. 원본과 같은 유형의 변형문제까지 있어 실전 연습용 시험지를 만들 수 있습니다.',
    },
];

export default async function TeacherLandingPage() {
    // 실데이터 통계 (얇은 페이지 방지 + 신뢰도)
    // 예전엔 여기서 exam_materials 를 .limit(5000) 으로 받아 학교를 셌는데,
    // PostgREST 가 1,000행에서 잘라 120개로 나왔다(실제 121). 세는 일은 lib/stats 로 옮겼다.
    const { questionCount, holdingCount, recentCount, topSchools } = await getSiteStats();   // 숫자 칸 '보유' = 공개 + 시중교재(10/7), 본문 '기출 문항' = 공개만

    const jsonLd = [
        {
            '@context': 'https://schema.org',
            '@type': 'WebPage',
            name: '수학 시험지 만들기',
            description: '전국 학교 내신 기출 유사문제로 나만의 수학 시험지를 만들고 한글 호환 HML로 받는 기능. 수학 선생님·강사용.',
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
        <div className="rd rd-x rd-tc">
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
            <Header />
            <div>
                {/* 첫 화면 */}
                <section className="rd-wrap rd-tc-hero" aria-labelledby="teacher-title">
                    <p className="rd-kicker">학생과 교사 모두 이용 가능</p>
                    <h1 id="teacher-title" className="rd-tc-h1">수학 시험지 만들기</h1>
                    <p className="rd-lead">우리 학교 기출에서 필요한 문제만 골라, <strong>수업과 복습에 쓸 시험지</strong>를 직접 만드세요. 실제 기출을 골라 구성하고, 편집용 HML로 받습니다.</p>
                    <div className="rd-tc-actions">
                        <Link href="/question-bank?tour=1" className="rd-btn rd-btn-primary">시험지 만들기 시작</Link>
                        <a href="#workflow-title" className="rd-btn rd-btn-gray">실제 화면 먼저 보기</a>
                    </div>
                </section>

                <section className="rd-wrap" aria-label="실제 서비스 화면">
                    <div className="rd-showcase">
                        <div className="rd-showcase-head">
                            <span>실제 서비스 화면, 고1 1학기 중간고사 기출</span>
                            <span className="rd-pill">담은 문항을 검토하는 화면</span>
                        </div>
                        <Image src="/home/review.webp" alt="학교 기출 문항을 담아 검토하는 시험지 만들기 화면" width={2200} height={653} priority sizes="(max-width: 1160px) 100vw, 1048px" />
                    </div>
                </section>

                {/* [10/7] 홈과 같은 세 칸(사용자 요청) */}
                {holdingCount > 0 && (
                    <section className="rd-wrap rd-stats rd-tc-stats" aria-label="수학ETF 자료 규모">
                        <div className="rd-stat"><b>{holdingCount.toLocaleString()}</b><span>보유 문항 수</span></div>
                        <div className="rd-stat"><b>{recentCount.toLocaleString()}</b><span>최근 7일간 업로드된 문항 수</span></div>
                        <div className="rd-stat"><b>2006–2026</b><span>전국연합, 평가원, 수능</span></div>
                    </section>
                )}

                <TeacherWorkflow />

                {/* 이용 범위 */}
                <section className="rd-wrap rd-tc-sec" aria-labelledby="teacher-access">
                    <RdAccessPolicy headingId="teacher-access" />
                </section>

                {/* 차별점 */}
                <section className="rd-wrap rd-tc-sec" aria-labelledby="teacher-diff">
                    <h2 id="teacher-diff" className="rd-x-h2">시중 문제은행과 다른 점</h2>
                    <ul className="rd-tc-diff">
                        {[
                            ['실제 학교 기출이 원본입니다', '출판사 문제집이 아니라 전국 고등학교가 실제로 출제한 내신 시험지에서 문항을 뽑습니다. 학교별 출제 경향이 그대로 담깁니다.'],
                            ['학교 단위로 골라 담습니다', '가르치는 학생의 학교 기출만 모아 대비 시험지를 만들 수 있습니다. 최근 회차부터 과년도까지 함께 볼 수 있습니다.'],
                            ['한글 호환 HML로 받아 바로 편집합니다', '완성본을 HML로 내려받아 학원과 수업 양식에 맞게 고쳐 쓸 수 있습니다. 이미지 캡처가 아니라 편집 가능한 문서입니다.'],
                            ['학원 관리 시스템이 아닙니다', '영업이나 계약 없이, 검색해서 들어와 바로 만들고 받아 가면 됩니다.'],   // [2026-09-14] 가입은 필요하다 — '가입 없이'는 거짓이었다
                        ].map(([t, d]) => (
                            <li key={t}>
                                <h3>{t}</h3>
                                <p>{d}</p>
                            </li>
                        ))}
                    </ul>
                </section>

                {/* 학교 바로가기 (내부링크) */}
                {topSchools.length > 0 && (
                    <section className="rd-wrap rd-tc-sec" aria-labelledby="teacher-schools">
                        <h2 id="teacher-schools" className="rd-x-h2">학교별 기출로 시작하기</h2>
                        <p className="rd-lead">학교 페이지에서 바로 그 학교 기출로 시험지를 만들 수 있습니다.</p>
                        <div className="rd-rg-chips rd-tc-schools">
                            {topSchools.map((s) => (
                                <Link key={s} href={`/school/${encodeURIComponent(s)}`} className="rd-rg-chip">{s}</Link>
                            ))}
                        </div>
                        <Link href="/schools" className="rd-link rd-tc-more">전체 학교 목록 보기<ChevronRight size={18} aria-hidden="true" /></Link>
                    </section>
                )}

                {/* FAQ */}
                <section className="rd-tc-faqzone" aria-labelledby="teacher-faq">
                    <div className="rd-wrap">
                        <h2 id="teacher-faq" className="rd-x-h2">자주 묻는 질문</h2>
                        <div className="rd-tc-faq">
                            {FAQ.map((f) => (
                                <div key={f.q} className="rd-tc-qa">
                                    <h3>{f.q}</h3>
                                    <p>{f.a}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* 마무리 */}
                <section className="rd-wrap rd-finale rd-tc-finale" aria-labelledby="teacher-finale">
                    <h2 id="teacher-finale" className="rd-h2">수업에 쓸 시험지,<br />지금 만들어보세요</h2>
                    <p className="rd-lead">
                        {questionCount > 0 ? `${questionCount.toLocaleString()}개 기출 문항이 단원과 난이도별로 준비돼 있습니다.` : '전국 학교 기출이 단원과 난이도별로 준비돼 있습니다.'}
                    </p>
                    <Link href="/question-bank?tour=1" className="rd-btn rd-btn-primary">시험지 만들기 시작</Link>
                </section>
            </div>
        </div>
    );
}
