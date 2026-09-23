import SchoolDirectory from '@/components/SchoolDirectory';
import { NOT_A_SCHOOL } from '@/lib/stats';
import Link from 'next/link';
import { Metadata } from 'next';
import { createAdminClient } from '@/utils/supabase/server-admin';
import Header from '@/components/Header';
import { ChevronRight } from 'lucide-react';
import { countExamGroupsBySchool } from '@/lib/exam-groups';

export const revalidate = 3600; // 1시간마다 갱신

export const metadata: Metadata = {
    title: '학교별 수학 기출 자료 모음 | 수학ETF',
    description: '전국 고등학교별 수학 내신 기출문제(문제·해설) 자료를 학교별로 모았습니다. 우리 학교 기출 시험지를 찾아보세요.',
    alternates: { canonical: '/schools' },
    openGraph: {
        title: '학교별 수학 기출 자료 모음 | 수학ETF',
        description: '전국 고등학교별 수학 내신 기출문제를 학교별로 모았습니다.',
        url: 'https://mathetf.com/schools',
        images: ['/og-image.png'],
    },
};

interface SchoolRow { name: string; region: string; count: number; }

export default async function SchoolsIndexPage() {
    let rows: SchoolRow[] = [];
    try {
        const supabase = createAdminClient();
        // 1) 학교별 시험지 수 — 상세 페이지와 동일한 '시험(회차) 그룹' 기준으로 통일
        //    (기존: 해설 PDF 행수 기준 → 업로드 시차 등으로 상세 카운트와 어긋날 수 있었음)
        // ⚠ PostgREST 는 limit 을 안 줘도 1000행에서 잘린다. 페이지네이션이 없어 자료 1,378건 중
        //    1,000건만 집계돼 학교 10곳이 목록에서 통째로 빠져 있었다(8/18 GSC 미크롤 89개의 일부).
        const exams: any[] = [];
        let exFrom = 0;
        while (true) {
            const { data, error } = await supabase
                .from('exam_materials')
                .select('school, title, exam_year, grade, semester, exam_type, subject, file_type, content_type')
                .neq('school', 'DELETED')
                .order('id').range(exFrom, exFrom + 999);
            if (error || !data || data.length === 0) break;
            exams.push(...data);
            if (data.length < 1000) break;
            exFrom += 1000;
        }
        // 내신 학교 목록이므로 해설 PDF가 하나도 없는 유사 학교(전국연합·사관학교 등 DB 전용)는 기존처럼 제외
        const hasSolutionPdf = new Set(
            exams.filter((r: any) => !NOT_A_SCHOOL.has(r.school) && ['해설','개인DB'].includes(r.content_type)).map((r: any) => r.school)
        );
        const counts = countExamGroupsBySchool(exams.filter((r: any) => hasSolutionPdf.has(r.school)));

        // 2) 학교 → 지역(구/군) 매핑 (schools 테이블, 페이지네이션)
        const regionMap: Record<string, string> = {};
        let from = 0;
        while (true) {
            const { data, error } = await supabase.from('schools').select('name, region, district').order('id').range(from, from + 999);
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
        <div className="min-h-screen bg-[#F2F3F0] text-[#294437] font-sans">
            <Header />
            <main className="discovery-page max-w-[1200px] mx-auto px-5 py-10 sm:py-14">
                <Link href="/" className="text-sm text-[#426D36] hover:underline mb-4 inline-block">← 홈으로</Link>
                <p className="eyebrow mt-4">SCHOOL LIBRARY</p><h1 className="discovery-title">우리 학교의 다음 시험을 위해.</h1>
                {/* 지역 허브로 가는 내부 링크 — 사이트맵에만 있고 사이트 안에서 도달할 수 없으면
                    색인이 잘 안 붙는다(8/18 학교 페이지에서 같은 문제를 겪었다). */}
                <Link href="/지역" className="inline-block mt-3 text-sm font-bold text-[#426D36] bg-[#EAF1E1] border border-[#C5D8B5]/60 px-3 py-1.5 rounded-full hover:bg-[#E0ECF9] transition-colors">
                    지역별로 찾기 (강남구·송파구 등) →
                </Link>
                <p className="text-slate-500 mt-2 text-sm">
                    전국 고등학교별 수학 내신 기출(문제·해설)을 모았습니다.
                    {rows.length > 0 && <> 현재 <span className="font-bold text-[#426D36]">{rows.length}개</span> 학교 · 제공 형식과 이용 조건은 자료마다 확인하세요.</>}
                </p>

                <SchoolDirectory rows={rows} />

            </main>
        </div>
    );
}
