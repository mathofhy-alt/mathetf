import {questionBankHref} from '@/lib/discovery';
import Link from 'next/link';
import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Header from '@/components/Header';
import { ChevronRight } from 'lucide-react';
import { buildRegionTree, findSido } from '@/lib/region-hub';

export const revalidate = 3600;

interface Props { params: { sido: string } }

const dec = (s: string) => { try { return decodeURIComponent(s); } catch { return s; } };

export async function generateStaticParams() {
    const tree = await buildRegionTree();
    return tree.filter((s) => s.hasPage).map((s) => ({ sido: s.sido }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const sido = dec(params.sido);
    const node = findSido(await buildRegionTree(), sido);
    if (!node) return { title: '지역별 수학 기출 | 수학ETF' };
    const title = `${sido} 고등학교 수학 기출문제 (${node.schoolCount}개교) | 수학ETF`;
    const description = `${sido} ${node.districts.slice(0, 4).map((d) => d.gu).join('·')} 등 ${node.schoolCount}개 고등학교의 수학 내신 기출 ${node.examCount}회차. 중간고사·기말고사 문제와 해설을 학교별로 확인하세요.`;
    return {
        title, description,
        alternates: { canonical: `/지역/${sido}` },
        openGraph: { title, description, url: `https://mathetf.com/지역/${sido}`, images: ['/og-image.png'] },
    };
}

export default async function SidoPage({ params }: Props) {
    const sido = dec(params.sido);
    const tree = await buildRegionTree();
    const node = findSido(tree, sido);
    if (!node || !node.hasPage) notFound();

    const jsonLd = {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
            { '@type': 'ListItem', position: 1, name: '홈', item: 'https://mathetf.com' },
            { '@type': 'ListItem', position: 2, name: '지역별 기출', item: 'https://mathetf.com/지역' },
            { '@type': 'ListItem', position: 3, name: sido, item: `https://mathetf.com/지역/${sido}` },
        ],
    };

    return (
        <div className="rd rd-x">
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
            <Header />
            <div>
                <section className="rd-wrap rd-x-top">
                    <nav className="rd-mk-crumb" aria-label="위치"><Link href="/">홈</Link><ChevronRight size={14} aria-hidden="true" /><Link href="/지역">지역별 기출</Link><ChevronRight size={14} aria-hidden="true" /><span>{sido}</span></nav>
                    <h1 className="rd-x-h1 rd-s-h1">{sido} 고등학교<br />수학 기출</h1>
                    <p className="rd-lead">{sido}의 <b>{node.schoolCount}개 고등학교</b>, 수학 내신 기출 <b>{node.examCount}회차</b>가 등록되어 있습니다.
                        {node.subjects.length > 0 && <> 과목별로는 {node.subjects.slice(0, 3).map((s) => `${s.subject} ${s.count}회차`).join(', ')} 순으로 많습니다.</>}
                        {' '}구·군을 고르면 그 지역 학교의 중간고사·기말고사 기출을 볼 수 있어요.</p>
                </section>

                <section className="rd-wrap rd-s-list">
                    <div className="rd-rg-grid">
                        {node.districts.map((d) => (
                            <div key={d.gu} className="rd-rg-card">
                                <div className="rd-rg-head">
                                    {d.hasPage ? <Link href={`/지역/${sido}/${d.gu}`} className="rd-rg-name">{d.gu}</Link> : <span className="rd-rg-name">{d.gu}</span>}
                                    <span className="rd-pill">{d.schools.length}개교, {d.examCount}회차</span>
                                </div>
                                <ul className="rd-rg-list">
                                    {d.schools.slice(0, 6).map((sc) => <li key={sc.name}><Link href={`/school/${encodeURIComponent(sc.name)}`}>{sc.name}</Link><span>{sc.count}회차</span></li>)}
                                </ul>
                                {d.hasPage && <Link href={`/지역/${sido}/${d.gu}`} className="rd-link rd-rg-more">{d.schools.length > 6 ? `${d.gu} 학교 ${d.schools.length - 6}곳 더 보기` : `${d.gu} 전체 보기`}</Link>}
                            </div>
                        ))}
                    </div>
                </section>

                <div className="rd-x-more rd-s-more"><div className="rd-wrap rd-x-links">
                    <Link href="/지역" className="rd-link">다른 지역</Link>
                    <Link href={questionBankHref({ region: sido, origin: 'region' })} className="rd-link">{sido} 기출로 시험지 만들기</Link>
                </div></div>
            </div>
        </div>
    );
}
