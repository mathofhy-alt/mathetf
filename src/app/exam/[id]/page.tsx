import { createAdminClient } from '@/utils/supabase/server-admin';
import Link from 'next/link';
import { Metadata } from 'next';
import { notFound } from 'next/navigation';

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
    return { row, siblings: siblings || [] };
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
    const { row, siblings } = ex;
    const label = buildLabel(row);
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
                        <p className="text-sm font-bold text-slate-700 mb-3">📄 문제 미리보기 <span className="text-slate-400 font-normal">(앞 {previews.length}페이지 · 해설 제외)</span></p>
                        <div className="space-y-4">
                            {previews.map((url, i) => (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                    key={i}
                                    src={url}
                                    alt={`${label} 수학 기출문제 미리보기 ${i + 1}페이지`}
                                    className="w-full rounded-lg border border-slate-100 shadow-sm"
                                    loading="lazy"
                                />
                            ))}
                        </div>
                        <p className="text-xs text-slate-400 mt-3 text-center">전체 문제와 해설은 다운로드로 제공됩니다.</p>
                    </div>
                ) : (
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 mb-6 text-center text-slate-400 text-sm">
                        미리보기 준비 중입니다.
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
