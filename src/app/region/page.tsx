import Link from 'next/link';
import { Metadata } from 'next';
import Header from '@/components/Header';
import { ChevronRight } from 'lucide-react';
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
        <div className="rd rd-x">
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
            <Header />
            <div>
                <section className="rd-wrap rd-x-top">
                    <nav className="rd-mk-crumb" aria-label="위치"><Link href="/">홈</Link><ChevronRight size={14} aria-hidden="true" /><span>지역별 기출</span></nav>
                    <h1 className="rd-x-h1 rd-s-h1">지역별 고등학교<br />수학 기출</h1>
                    <p className="rd-lead">전국 <b>{totalSchools}개 고등학교</b>의 수학 내신 기출 <b>{totalExams}회차</b>를 시·도와 구·군으로 묶었습니다. 지역을 고르면 그 지역 학교의 중간고사·기말고사 기출을 한눈에 볼 수 있어요.</p>
                </section>

                <section className="rd-wrap rd-s-list">
                    {tree.map((s) => (
                        <div key={s.sido} className="rd-rg-sido">
                            <div className="rd-rg-head">
                                {s.hasPage ? <Link href={`/지역/${s.sido}`} className="rd-rg-name">{s.sido}</Link> : <span className="rd-rg-name">{s.sido}</span>}
                                <span className="rd-pill">{s.schoolCount}개교, {s.examCount}회차</span>
                                {s.hasPage && <Link href={`/지역/${s.sido}`} className="rd-link rd-rg-all">{s.sido} 전체 보기</Link>}
                            </div>
                            <div className="rd-rg-chips">
                                {s.districts.map((d) =>
                                    d.hasPage ? (
                                        <Link key={d.gu} href={`/지역/${s.sido}/${d.gu}`} className="rd-rg-chip">{d.gu}<small>{d.schools.length}</small></Link>
                                    ) : (
                                        /* 학교가 2곳 이하인 지역은 자체 페이지를 만들지 않는다 —
                                           내용이 거의 없는 페이지를 늘리면 색인에 해가 된다. 학교로 바로 보낸다. */
                                        <span key={d.gu} className="rd-rg-chip is-plain">{d.gu}{' '}
                                            {d.schools.map((sc, i) => <span key={sc.name}>{i > 0 && ', '}<Link href={`/school/${encodeURIComponent(sc.name)}`}>{sc.name.replace('등학교', '')}</Link></span>)}
                                        </span>
                                    )
                                )}
                            </div>
                        </div>
                    ))}
                    {tree.length === 0 && <p className="rd-cat-empty">지역 정보를 불러오지 못했어요.</p>}
                </section>

                <div className="rd-x-more rd-s-more"><div className="rd-wrap rd-x-links">
                    <Link href="/schools" className="rd-link">학교 이름으로 찾기</Link>
                    <Link href="/question-bank" className="rd-link">기출로 시험지 만들기</Link>
                </div></div>
            </div>
        </div>
    );
}
