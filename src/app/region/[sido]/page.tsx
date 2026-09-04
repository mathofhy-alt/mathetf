import Link from 'next/link';
import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Header from '@/components/Header';
import { ChevronRight, MapPin } from 'lucide-react';
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
        <div className="min-h-screen bg-[#F8FAFD] text-[#1E2D4F] font-sans">
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
            <Header />
            <main className="max-w-5xl mx-auto px-4 py-8">
                <nav className="text-xs text-slate-400 mb-3">
                    <Link href="/" className="hover:text-[#497AB7]">홈</Link>
                    <span className="mx-1.5">/</span>
                    <Link href="/지역" className="hover:text-[#497AB7]">지역별 기출</Link>
                    <span className="mx-1.5">/</span>
                    <span className="text-slate-500 font-semibold">{sido}</span>
                </nav>

                <h1 className="text-2xl sm:text-3xl font-black break-keep">{sido} 고등학교 수학 기출</h1>
                <p className="text-slate-500 mt-2 break-keep">
                    {sido}의 <strong className="text-[#1E2D4F]">{node.schoolCount}개 고등학교</strong>, 수학 내신 기출{' '}
                    <strong className="text-[#1E2D4F]">{node.examCount}회차</strong>가 등록되어 있습니다.
                    {node.subjects.length > 0 && (
                        <> 과목별로는 {node.subjects.slice(0, 3).map((s) => `${s.subject} ${s.count}회차`).join(', ')} 순으로 많습니다.</>
                    )}
                    {' '}구·군을 고르면 그 지역 학교의 중간고사·기말고사 기출을 볼 수 있어요.
                </p>

                <div className="mt-8 grid gap-4 sm:grid-cols-2">
                    {node.districts.map((d) => (
                        <section key={d.gu} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                            <div className="flex items-center justify-between gap-2 mb-3">
                                <div className="flex items-center gap-2 min-w-0">
                                    <MapPin size={16} className="text-[#497AB7] shrink-0" />
                                    {d.hasPage ? (
                                        <Link href={`/지역/${sido}/${d.gu}`} className="font-extrabold hover:text-[#497AB7] transition-colors truncate">{d.gu}</Link>
                                    ) : (
                                        <span className="font-extrabold truncate">{d.gu}</span>
                                    )}
                                    <span className="text-[11px] font-bold text-slate-400 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-full shrink-0">
                                        {d.schools.length}개교 · {d.examCount}회차
                                    </span>
                                </div>
                                {d.hasPage && (
                                    <Link href={`/지역/${sido}/${d.gu}`} className="text-[#497AB7] hover:text-[#3A6CAE] shrink-0" aria-label={`${d.gu} 전체보기`}>
                                        <ChevronRight size={16} />
                                    </Link>
                                )}
                            </div>
                            <ul className="space-y-1">
                                {d.schools.slice(0, 6).map((sc) => (
                                    <li key={sc.name} className="flex items-center justify-between gap-2 text-sm">
                                        <Link href={`/school/${encodeURIComponent(sc.name)}`} className="text-slate-600 hover:text-[#497AB7] font-semibold truncate">
                                            {sc.name}
                                        </Link>
                                        <span className="text-xs text-slate-400 shrink-0 tabular-nums">{sc.count}회차</span>
                                    </li>
                                ))}
                            </ul>
                            {d.schools.length > 6 && d.hasPage && (
                                <Link href={`/지역/${sido}/${d.gu}`} className="inline-block mt-2 text-xs font-bold text-[#497AB7] hover:underline">
                                    + {d.schools.length - 6}개교 더 보기
                                </Link>
                            )}
                        </section>
                    ))}
                </div>

                <div className="mt-8 flex flex-wrap gap-2">
                    <Link href="/지역" className="text-sm font-bold text-[#497AB7] bg-white border border-slate-200 px-4 py-2 rounded-xl hover:border-[#497AB7] transition-colors">← 다른 지역</Link>
                    <Link href="/question-bank" className="text-sm font-bold text-white bg-[#497AB7] px-4 py-2 rounded-xl hover:bg-[#3A6CAE] transition-colors">기출로 시험지 만들기 →</Link>
                </div>
            </main>
        </div>
    );
}
