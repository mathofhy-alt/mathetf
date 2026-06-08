import Link from 'next/link';
import { Metadata } from 'next';
import { createAdminClient } from '@/utils/supabase/server-admin';

export const revalidate = 3600; // 1시간마다 갱신

export const metadata: Metadata = {
    title: '학교별 수학 기출 자료 모음 | 수학ETF',
    description: '전국 고등학교별 수학 내신 기출문제(문제·해설) 자료를 학교별로 모았습니다. 우리 학교 기출 시험지를 찾아보세요.',
    alternates: { canonical: '/schools' },
    openGraph: {
        title: '학교별 수학 기출 자료 모음 | 수학ETF',
        description: '전국 고등학교별 수학 내신 기출문제를 학교별로 모았습니다.',
        url: 'https://mathetf.com/schools',
    },
};

export default async function SchoolsIndexPage() {
    let schools: string[] = [];
    try {
        const supabase = createAdminClient();
        const { data } = await supabase
            .from('exam_materials')
            .select('school')
            .neq('school', 'DELETED');
        const set = new Set<string>();
        (data || []).forEach((r: any) => { if (r.school) set.add(r.school); });
        schools = Array.from(set).sort((a, b) => a.localeCompare(b, 'ko'));
    } catch {
        schools = [];
    }

    return (
        <div className="min-h-screen bg-[#f3f4f6]">
            <div className="max-w-4xl mx-auto px-4 py-12">
                <div className="mb-8">
                    <Link href="/" className="text-sm text-brand-600 hover:underline mb-3 inline-block">← 홈으로</Link>
                    <h1 className="text-3xl font-black text-slate-900">학교별 수학 기출 자료</h1>
                    <p className="text-slate-500 mt-2">
                        전국 고등학교별 수학 내신 기출문제(문제·해설)를 모았습니다.
                        {schools.length > 0 && <> 현재 <span className="font-bold text-brand-600">{schools.length}개</span> 학교.</>}
                    </p>
                </div>

                {schools.length > 0 ? (
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-1">
                            {schools.map((name) => (
                                <li key={name}>
                                    <Link
                                        href={`/school/${encodeURIComponent(name)}`}
                                        className="block py-2 px-2 rounded-lg text-slate-700 hover:bg-slate-50 hover:text-brand-600 transition-colors text-sm font-medium"
                                    >
                                        {name}
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </div>
                ) : (
                    <div className="py-20 text-center text-slate-400 bg-white rounded-2xl border border-slate-200">
                        <p>등록된 학교 자료가 없습니다.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
