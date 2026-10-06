import {questionBankHref} from '@/lib/discovery';
import Link from 'next/link';
import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Header from '@/components/Header';
import { buildRegionTree, findDistrict } from '@/lib/region-hub';
import { ChevronRight } from 'lucide-react';

export const revalidate = 3600;

interface Props { params: { sido: string; gu: string } }

const dec = (s: string) => { try { return decodeURIComponent(s); } catch { return s; } };

export async function generateStaticParams() {
    const tree = await buildRegionTree();
    return tree.flatMap((s) => s.districts.filter((d) => d.hasPage).map((d) => ({ sido: s.sido, gu: d.gu })));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const sido = dec(params.sido), gu = dec(params.gu);
    const node = findDistrict(await buildRegionTree(), sido, gu);
    if (!node) return { title: '지역별 수학 기출 | 수학ETF' };
    const names = node.schools.slice(0, 3).map((s) => s.name.replace('등학교', '')).join('·');
    const title = `${gu} 고등학교 수학 기출문제 (${node.schools.length}개교) | 수학ETF`;
    const description = `${sido} ${gu} ${names} 등 ${node.schools.length}개 고등학교의 수학 내신 기출 ${node.examCount}회차. 중간고사·기말고사 문제와 해설을 학교별로 확인하고 시험지를 만들어 보세요.`;
    return {
        title, description,
        alternates: { canonical: `/지역/${sido}/${gu}` },
        openGraph: { title, description, url: `https://mathetf.com/지역/${sido}/${gu}`, images: ['/og-image.png'] },
    };
}

export default async function DistrictPage({ params }: Props) {
    const sido = dec(params.sido), gu = dec(params.gu);
    const tree = await buildRegionTree();
    const node = findDistrict(tree, sido, gu);
    if (!node || !node.hasPage) notFound();

    const jsonLd = {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
            { '@type': 'ListItem', position: 1, name: '홈', item: 'https://mathetf.com' },
            { '@type': 'ListItem', position: 2, name: '지역별 기출', item: 'https://mathetf.com/지역' },
            { '@type': 'ListItem', position: 3, name: sido, item: `https://mathetf.com/지역/${sido}` },
            { '@type': 'ListItem', position: 4, name: gu, item: `https://mathetf.com/지역/${sido}/${gu}` },
        ],
    };

    const maxSubj = Math.max(1, ...node.subjects.map(s => s.count));
    return (
        <div className="rd rd-x">
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
            <Header />
            <div>
                <section className="rd-wrap rd-x-top">
                    <nav className="rd-mk-crumb" aria-label="위치"><Link href="/">홈</Link><ChevronRight size={14} aria-hidden="true" /><Link href="/지역">지역별 기출</Link><ChevronRight size={14} aria-hidden="true" /><Link href={`/지역/${sido}`}>{sido}</Link><ChevronRight size={14} aria-hidden="true" /><span>{gu}</span></nav>
                    <h1 className="rd-x-h1 rd-s-h1">{gu} 고등학교<br />수학 기출</h1>
                    <p className="rd-lead">{sido} {gu}의 <b>{node.schools.length}개 고등학교</b>, 수학 내신 기출 <b>{node.examCount}회차</b>가 등록되어 있습니다.
                        {node.subjects.length > 0 && <> 과목별로는 {node.subjects.slice(0, 3).map((s) => `${s.subject} ${s.count}회차`).join(', ')} 순으로 많고,</>}
                        {' '}학교를 고르면 회차별 문제·해설과 단원 분포를 볼 수 있어요.</p>
                    <div className="rd-s-actions"><Link href={questionBankHref({ region: sido, district: gu, origin: 'region' })} className="rd-btn rd-btn-primary">{gu} 기출로 시험지 만들기</Link></div>
                </section>

                <section className="rd-wrap rd-s-list" aria-labelledby="gu-schools">
                    <h2 id="gu-schools" className="rd-x-h2">학교별 기출</h2>
                    <div className="rd-x-rows rd-sd-rows">
                        {node.schools.map((sc) => <Link key={sc.name} href={`/school/${encodeURIComponent(sc.name)}`} className="rd-x-row">
                            <span><b>{sc.name}</b><small>기출 {sc.count}회차</small></span>
                            <ChevronRight size={22} aria-hidden="true" />
                        </Link>)}
                    </div>
                </section>

                {node.subjects.length > 0 && <section className="rd-s-zone" aria-labelledby="gu-subjects">
                    <div className="rd-wrap">
                        <h2 id="gu-subjects" className="rd-x-h2">{gu} 기출 과목 분포</h2>
                        <div className="rd-s-unitcard rd-rg-subj">
                            <div className="rd-x-bars is-tight">{node.subjects.map(s => <div key={s.subject} className="rd-x-bar is-small">
                                <span title={s.subject}>{s.subject}</span><div className="rd-x-track"><span style={{ width: `${Math.round(s.count / maxSubj * 100)}%` }} /></div><span>{s.count}</span>
                            </div>)}</div>
                        </div>
                    </div>
                </section>}

                <div className="rd-x-more rd-s-more"><div className="rd-wrap rd-x-links">
                    <Link href={`/지역/${sido}`} className="rd-link">{sido} 전체</Link>
                    <Link href="/지역" className="rd-link">다른 지역</Link>
                </div></div>
            </div>
        </div>
    );
}
