import { createAdminClient } from '@/utils/supabase/server-admin';
import Link from 'next/link';
import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import ExamPreviewCarousel from '@/components/ExamPreviewCarousel';
import FreeProblemCTA from '@/components/FreeProblemCTA';
import { buildSourceDbId } from '@/lib/examKey';

export const revalidate = 3600; // 1시간마다 갱신 (미리보기/가격 반영)

interface Props {
    params: { id: string };
}

// 시험 라벨 (중간/기말 → N학기, 모의 → N월)
function buildLabel(row: any) {
    const isMock = row.exam_type === '모의고사' || row.exam_type === '수능';
    const sem = isMock ? `${row.semester}월` : `${row.semester}학기`;
    const grade = row.grade ? `${row.grade}학년 ` : '';
    const subject = row.subject ? ` ${row.subject}` : '';
    return `${row.school} ${row.exam_year}년 ${grade}${sem} ${row.exam_type || ''}${subject}`.replace(/\s+/g, ' ').trim();
}

async function getExam(id: string) {
    const supabase = createAdminClient();
    const { data: row } = await supabase
        .from('exam_materials')
        .select('*')
        .eq('id', id)
        .neq('school', 'DELETED')
        .single();
    if (!row) return null;
    // 같은 시험의 다른 형식(HWP/개인DB) 확인
    const { data: siblings } = await supabase
        .from('exam_materials')
        .select('file_type, content_type')
        .eq('school', row.school)
        .eq('exam_year', row.exam_year)
        .eq('grade', row.grade)
        .eq('semester', row.semester)
        .eq('exam_type', row.exam_type)
        .eq('subject', row.subject || '')
        .neq('school', 'DELETED');

    // 같은 학교·같은 시험(학년·학기·시험·과목)의 다른 연도 → 상세페이지 링크
    const { data: otherYears } = await supabase
        .from('exam_materials')
        .select('id, exam_year')
        .eq('school', row.school)
        .eq('grade', row.grade)
        .eq('semester', row.semester)
        .eq('exam_type', row.exam_type)
        .eq('subject', row.subject || '')
        .eq('file_type', 'PDF')
        .eq('content_type', '해설')
        .neq('id', row.id)
        .neq('school', 'DELETED')
        .order('exam_year', { ascending: false });

    // 시험 구성(단원별·난이도별 문항수) — source_db_id 로 questions 조회 (DB 변경 없이 즉석 매칭)
    let composition: null | { total: number; byUnit: { unit: string; count: number }[]; avg: number; easy: number; mid: number; hard: number } = null;
    const sourceKey = buildSourceDbId(row);
    if (sourceKey) {
        const { data: qs } = await supabase
            .from('questions')
            .select('unit, difficulty')
            .eq('source_db_id', sourceKey);
        if (qs && qs.length > 0) {
            const unitMap: Record<string, number> = {};
            let diffSum = 0, easy = 0, mid = 0, hard = 0;
            for (const q of qs) {
                const unit = (q.unit || '기타').toString();
                unitMap[unit] = (unitMap[unit] || 0) + 1;
                const d = Number(q.difficulty) || 0;
                diffSum += d;
                if (d <= 3) easy++; else if (d <= 6) mid++; else hard++;
            }
            const byUnit = Object.entries(unitMap)
                .map(([unit, count]) => ({ unit, count }))
                .sort((a, b) => b.count - a.count);
            composition = { total: qs.length, byUnit, avg: diffSum / qs.length, easy, mid, hard };
        }
    }

    return { row, siblings: siblings || [], otherYears: otherYears || [], composition };
}

// 빌드 시 실제 해설 PDF 시험만 미리 생성
export async function generateStaticParams() {
    const supabase = createAdminClient();
    const { data } = await supabase
        .from('exam_materials')
        .select('id')
        .eq('file_type', 'PDF')
        .eq('content_type', '해설')
        .neq('school', 'DELETED');
    return (data || []).map((r: any) => ({ id: r.id }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const ex = await getExam(params.id);
    if (!ex) return { title: '시험지 | 수학ETF' };
    const label = buildLabel(ex.row);
    const title = `${label} 수학 기출문제 및 해설 | 수학ETF`;
    const description = `${label} 수학 기출문제와 해설. 실제 시험지 미리보기를 확인하고 PDF·HWP로 받아보세요. 수학ETF 전국 내신 기출 자료.`;
    return {
        title,
        description,
        keywords: [
            `${ex.row.school} 수학 기출`, `${ex.row.school} ${ex.row.exam_year} 수학`,
            `${ex.row.school} ${ex.row.exam_type}`, `${ex.row.subject || ''} 기출문제`,
            '수학 내신 기출문제', '수학 시험지',
        ].filter(Boolean),
        alternates: { canonical: `/exam/${params.id}` },
        openGraph: { title, description, url: `https://mathetf.com/exam/${params.id}`, type: 'article' },
    };
}

export default async function ExamDetailPage({ params }: Props) {
    const ex = await getExam(params.id);
    if (!ex) notFound();
    const { row, siblings, otherYears, composition } = ex;
    const label = buildLabel(row);
    const isMock = row.exam_type === '모의고사' || row.exam_type === '수능';
    const examShort = `${row.grade ? row.grade + '학년 ' : ''}${isMock ? row.semester + '월' : row.semester + '학기'} ${row.exam_type || ''}`.trim();
    const previews: string[] = Array.isArray(row.preview_urls) ? row.preview_urls : [];

    const hasPdf = siblings.some((f: any) => f.file_type === 'PDF');
    const hasHwp = siblings.some((f: any) => f.file_type === 'HWP');
    const hasDb = siblings.some((f: any) => f.file_type === 'DB');

    return (
        <div className="min-h-screen bg-[#f3f4f6]">
            <div className="max-w-3xl mx-auto px-4 py-10">
                {/* 헤더 */}
                <div className="mb-6">
                    <Link href={`/school/${encodeURIComponent(row.school)}`} className="text-sm text-brand-600 hover:underline mb-3 inline-block">
                        ← {row.school} 전체 시험지
                    </Link>
                    <h1 className="text-2xl sm:text-3xl font-black text-slate-900 break-keep">
                        {label} 수학 기출문제 및 해설
                    </h1>
                    <div className="flex flex-wrap gap-2 mt-3">
                        {hasPdf && <span className="text-xs bg-red-50 text-red-600 font-bold px-2.5 py-1 rounded">PDF (문제+해설)</span>}
                        {hasHwp && <span className="text-xs bg-blue-50 text-blue-600 font-bold px-2.5 py-1 rounded">HWP</span>}
                        {hasDb && <span className="text-xs bg-indigo-50 text-indigo-600 font-bold px-2.5 py-1 rounded">개인DB</span>}
                    </div>
                </div>

                {/* 무료 문제 PDF CTA (회원가입 유도 / 로그인 시 즉시 다운로드) — 페이지 상단 강조 */}
                {row.free_pdf_url && (
                    <FreeProblemCTA
                        freePdfUrl={row.free_pdf_url}
                        filename={`${row.school}_${row.exam_year}_${row.grade}_${row.semester}_${row.exam_type}_문제.pdf`}
                        pageCount={previews.length}
                    />
                )}

                {/* 설명 텍스트 (SEO + 사용자) */}
                <p className="text-slate-600 leading-relaxed break-keep mb-6">
                    <strong className="text-slate-800">{row.school}</strong>의 {row.exam_year}년
                    {row.grade ? ` ${row.grade}학년` : ''} {buildLabel(row).includes('월') ? `${row.semester}월` : `${row.semester}학기`} {row.exam_type}
                    {row.subject ? ` ${row.subject}` : ''} 수학 기출문제입니다. 아래에서 실제 시험지 문제 미리보기를 확인할 수 있으며,
                    문제와 해설이 담긴 전체 자료는 PDF로, 편집 가능한 자료는 HWP·개인DB로 제공합니다.
                </p>

                {/* 문제 미리보기 */}
                {previews.length > 0 ? (
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-6 mb-6">
                        <p className="text-sm font-bold text-slate-700 mb-3">📄 문제 미리보기 <span className="text-slate-400 font-normal">(문제 전체 {previews.length}페이지 · 해설 제외)</span></p>
                        <ExamPreviewCarousel images={previews} label={label} />
                        <p className="text-xs text-slate-400 mt-3 text-center">해설은 다운로드로 제공됩니다.</p>
                    </div>
                ) : (
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 mb-6 text-center text-slate-400 text-sm">
                        미리보기 준비 중입니다.
                    </div>
                )}

                {/* 시험 구성 (단원별·난이도별 문항수) */}
                {composition && (
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 mb-6">
                        <p className="text-sm font-bold text-slate-700 mb-3">📊 시험 구성</p>
                        <p className="text-sm text-slate-600 mb-4 break-keep">
                            총 <strong className="text-[#1E2D4F]">{composition.total}문항</strong> · 출제 단원{' '}
                            <strong className="text-[#1E2D4F]">{composition.byUnit.length}개</strong> · 평균 난이도{' '}
                            <strong className="text-[#1E2D4F]">{composition.avg.toFixed(1)}/10</strong>
                        </p>

                        {/* 단원별 문항수 */}
                        <table className="w-full text-sm mb-4">
                            <thead>
                                <tr className="text-slate-400 text-xs border-b border-slate-100">
                                    <th className="text-left font-medium pb-2">출제 단원</th>
                                    <th className="text-right font-medium pb-2 w-20">문항수</th>
                                </tr>
                            </thead>
                            <tbody>
                                {composition.byUnit.map((u) => (
                                    <tr key={u.unit} className="border-b border-slate-50 last:border-0">
                                        <td className="py-2 text-slate-700">{u.unit}</td>
                                        <td className="py-2 text-right">
                                            <span className="inline-flex items-center gap-2 justify-end">
                                                <span className="inline-block h-1.5 rounded-full bg-[#497AB7]/30" style={{ width: `${Math.max(8, (u.count / composition.total) * 80)}px` }} />
                                                <span className="font-bold text-[#497AB7] w-5 text-right">{u.count}</span>
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>

                        {/* 난이도 분포 */}
                        <div className="flex flex-wrap gap-2 text-xs">
                            <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-600 font-bold">쉬움 {composition.easy}</span>
                            <span className="px-2.5 py-1 rounded-full bg-amber-50 text-amber-600 font-bold">보통 {composition.mid}</span>
                            <span className="px-2.5 py-1 rounded-full bg-rose-50 text-rose-600 font-bold">어려움 {composition.hard}</span>
                        </div>
                    </div>
                )}

                {/* 다운로드 CTA */}
                <div className="bg-gradient-to-br from-[#497AB7] to-[#3AADA9] rounded-2xl p-6 text-center text-white shadow-md">
                    <p className="font-bold text-lg mb-1">문제 + 해설 전체 받기</p>
                    <p className="text-white/85 text-sm mb-4 break-keep">{label} 시험지의 전체 문제와 해설을 받아보세요.</p>
                    <Link
                        href={`/?school=${encodeURIComponent(row.school)}`}
                        className="inline-block bg-white text-[#497AB7] font-extrabold px-6 py-3 rounded-xl hover:bg-slate-50 transition-colors"
                    >
                        다운로드 하러 가기
                    </Link>
                </div>

                {/* 같은 시험 · 다른 연도 */}
                {otherYears.length > 0 && (
                    <div className="mt-6 bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                        <p className="text-sm font-bold text-slate-700 mb-3">
                            📚 {row.school} {examShort} · 다른 연도
                        </p>
                        <div className="flex flex-wrap gap-2">
                            {otherYears.map((r: any) => (
                                <Link
                                    key={r.id}
                                    href={`/exam/${r.id}`}
                                    className="text-sm font-bold text-[#497AB7] bg-[#EEF4FB] hover:bg-[#DCE9F8] px-3.5 py-2 rounded-lg transition-colors"
                                >
                                    {r.exam_year}년 기출
                                </Link>
                            ))}
                        </div>
                    </div>
                )}

                {/* 하단 링크 */}
                <div className="mt-8 text-center">
                    <Link href="/schools" className="text-sm text-slate-500 hover:text-brand-600 hover:underline">
                        전국 학교별 기출 자료 모두 보기 →
                    </Link>
                </div>
            </div>
        </div>
    );
}
