import Link from 'next/link';
import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Header from '@/components/Header';
import { buildRegionTree, findDistrict } from '@/lib/region-hub';

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

    return (
        <div className="min-h-screen bg-[#F8FAFD] text-[#1E2D4F] font-sans">
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
            <Header />
            <main className="max-w-4xl mx-auto px-4 py-8">
                <nav className="text-xs text-slate-400 mb-3">
                    <Link href="/" className="hover:text-[#497AB7]">홈</Link>
                    <span className="mx-1.5">/</span>
                    <Link href="/지역" className="hover:text-[#497AB7]">지역별 기출</Link>
                    <span className="mx-1.5">/</span>
                    <Link href={`/지역/${sido}`} className="hover:text-[#497AB7]">{sido}</Link>
                    <span className="mx-1.5">/</span>
                    <span className="text-slate-500 font-semibold">{gu}</span>
                </nav>

                <h1 className="text-2xl sm:text-3xl font-black break-keep">{gu} 고등학교 수학 기출</h1>
                <p className="text-slate-500 mt-2 break-keep">
                    {sido} {gu}의 <strong className="text-[#1E2D4F]">{node.schools.length}개 고등학교</strong>, 수학 내신 기출{' '}
                    <strong className="text-[#1E2D4F]">{node.examCount}회차</strong>가 등록되어 있습니다.
                    {node.subjects.length > 0 && (
                        <> 과목별로는 {node.subjects.slice(0, 3).map((s) => `${s.subject} ${s.count}회차`).join(', ')} 순으로 많고,</>
                    )}
                    {' '}학교를 고르면 회차별 문제·해설과 단원 분포를 볼 수 있어요.
                </p>

                {node.subjects.length > 0 && (
                    <div className="mt-5 bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                        <h2 className="text-sm font-extrabold text-slate-700 mb-3">{gu} 기출 과목 분포</h2>
                        <div className="flex flex-wrap gap-2">
                            {node.subjects.map((s) => (
                                <span key={s.subject} className="text-xs font-bold text-[#2F5A92] bg-[#EEF4FB] border border-[#B7D1EA]/60 px-3 py-1.5 rounded-full">
                                    {s.subject} <span className="font-normal tabular-nums">{s.count}회차</span>
                                </span>
                            ))}
                        </div>
                    </div>
                )}

                <h2 className="mt-8 mb-3 text-lg font-extrabold">학교별 기출</h2>
                <div className="grid gap-3 sm:grid-cols-2">
                    {node.schools.map((sc) => (
                        <Link
                            key={sc.name}
                            href={`/school/${encodeURIComponent(sc.name)}`}
                            className="flex items-center justify-between gap-3 bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3.5 hover:border-[#497AB7] transition-colors"
                        >
                            <span className="font-bold text-[#1E2D4F] truncate">{sc.name}</span>
                            <span className="text-xs font-bold text-slate-400 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-full shrink-0 tabular-nums">
                                {sc.count}회차
                            </span>
                        </Link>
                    ))}
                </div>

                <div className="mt-8 flex flex-wrap gap-2">
                    <Link href={`/지역/${sido}`} className="text-sm font-bold text-[#497AB7] bg-white border border-slate-200 px-4 py-2 rounded-xl hover:border-[#497AB7] transition-colors">← {sido} 전체</Link>
                    <Link href="/question-bank" className="text-sm font-bold text-white bg-[#497AB7] px-4 py-2 rounded-xl hover:bg-[#3A6CAE] transition-colors">기출로 시험지 만들기 →</Link>
                </div>
            </main>
        </div>
    );
}
