import Link from 'next/link';
import { Metadata } from 'next';
import { createAdminClient } from '@/utils/supabase/server-admin';
import Header from '@/components/Header';
import { ChevronRight } from 'lucide-react';

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

interface SchoolRow { name: string; region: string; count: number; }

export default async function SchoolsIndexPage() {
    let rows: SchoolRow[] = [];
    try {
        const supabase = createAdminClient();
        // 1) 학교별 시험지 수 (해설 PDF 기준)
        const { data: exams } = await supabase
            .from('exam_materials')
            .select('school')
            .eq('file_type', 'PDF').eq('content_type', '해설').neq('school', 'DELETED');
        const counts: Record<string, number> = {};
        (exams || []).forEach((r: any) => { if (r.school) counts[r.school] = (counts[r.school] || 0) + 1; });

        // 2) 학교 → 지역(구/군) 매핑 (schools 테이블, 페이지네이션)
        const regionMap: Record<string, string> = {};
        let from = 0;
        while (true) {
            const { data, error } = await supabase.from('schools').select('name, region, district').range(from, from + 999);
            if (error || !data || data.length === 0) break;
            data.forEach((s: any) => { if (s.name && !regionMap[s.name]) regionMap[s.name] = [s.region, s.district].filter(Boolean).join(' '); });
            if (data.length < 1000) break;
            from += 1000;
        }

        rows = Object.keys(counts).map((name) => ({ name, region: regionMap[name] || '', count: counts[name] }))
            .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'ko'));
    } catch {
        rows = [];
    }

    return (
        <div className="min-h-screen bg-[#F8FAFD] text-[#1E2D4F] font-sans">
            <Header />
            <main className="max-w-4xl mx-auto px-4 py-8 sm:py-10">
                <Link href="/" className="text-sm text-[#497AB7] hover:underline mb-4 inline-block">← 홈으로</Link>
                <h1 className="text-2xl sm:text-3xl font-black break-keep">학교별 수학 기출 자료</h1>
                <p className="text-slate-500 mt-2 text-sm">
                    전국 고등학교별 수학 내신 기출(문제·해설)을 모았습니다.
                    {rows.length > 0 && <> 현재 <span className="font-bold text-[#497AB7]">{rows.length}개</span> 학교 · 문제 미리보기 무료.</>}
                </p>

                {rows.length > 0 ? (
                    <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {rows.map((s) => (
                            <Link
                                key={s.name}
                                href={`/school/${encodeURIComponent(s.name)}`}
                                className="group flex items-center justify-between gap-2 bg-white rounded-xl border border-slate-100 shadow-sm hover:shadow-md transition-all px-4 py-3"
                            >
                                <div className="min-w-0">
                                    <p className="font-bold text-[#1E2D4F] group-hover:text-[#497AB7] transition-colors truncate">{s.name}</p>
                                    <p className="text-xs text-slate-400 mt-0.5">
                                        {s.region && <span>{s.region} · </span>}수학 기출 <span className="text-[#497AB7] font-bold">{s.count}개</span>
                                    </p>
                                </div>
                                <ChevronRight size={18} className="flex-shrink-0 text-[#497AB7] group-hover:translate-x-0.5 transition-transform" />
                            </Link>
                        ))}
                    </div>
                ) : (
                    <div className="py-20 text-center text-slate-400 bg-white rounded-2xl border border-slate-200 mt-6">
                        <p>등록된 학교 자료가 없습니다.</p>
                    </div>
                )}
            </main>
        </div>
    );
}
