import { createAdminClient } from '@/utils/supabase/server-admin';
import Link from 'next/link';
import { Metadata } from 'next';
import { notFound } from 'next/navigation';

// 1시간마다 자동 재검증 (새 시험지 추가 반영)
export const revalidate = 3600;

interface Props {
    params: { schoolName: string };
}

// 빌드 시 실제 데이터 있는 학교만 미리 생성
export async function generateStaticParams() {
    const supabase = createAdminClient();
    const { data } = await supabase
        .from('exam_materials')
        .select('school')
        .neq('school', 'DELETED')
        .neq('school', '전국연합');

    if (!data) return [];

    const schools = Array.from(new Set(data.map((item: any) => item.school)));
    return schools.map((school: string) => ({
        schoolName: school,  // Next.js가 URL 디코딩을 자동으로 처리하므로 인코딩 불필요
    }));
}

// 동적 메타 태그 - 학교명 포함
export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const schoolName = decodeURIComponent(params.schoolName);
    return {
        title: `${schoolName} 기출문제 - 수학ETF`,
        description: `${schoolName} 내신 기출문제 다운로드. 중간고사, 기말고사 HWP, PDF 형식 제공. 수학ETF에서 즉시 확인하세요.`,
        keywords: [`${schoolName} 기출문제`, `${schoolName} 내신`, `${schoolName} 중간고사`, `${schoolName} 기말고사`, '내신 기출문제'],
        openGraph: {
            title: `${schoolName} 기출문제 - 수학ETF`,
            description: `${schoolName} 내신 기출문제를 즉시 다운로드하세요.`,
        },
    };
}

export default async function SchoolPage({ params }: Props) {
    const schoolName = decodeURIComponent(params.schoolName);
    const supabase = createAdminClient();

    const { data: exams } = await supabase
        .from('exam_materials')
        .select('*')
        .eq('school', schoolName)
        .neq('school', 'DELETED')
        .order('created_at', { ascending: false });

    if (!exams || exams.length === 0) {
        notFound();
    }

    // 시험 단위로 그룹핑
    const groups: Record<string, any> = {};
    exams.forEach((item: any) => {
        const titleYear = item.title?.match(/20\d{2}/)?.[0];
        const year = titleYear ? parseInt(titleYear) : (item.exam_year || 2024);
        const key = `${year}-${item.grade}-${item.semester}-${item.exam_type}-${item.subject || ''}`;
        if (!groups[key]) {
            groups[key] = {
                year,
                grade: item.grade,
                semester: item.semester,
                examType: item.exam_type,
                subject: item.subject || '',
                files: [],
            };
        }
        groups[key].files.push(item);
    });

    const examList = Object.values(groups).sort((a: any, b: any) => b.year - a.year);

    return (
        <div className="min-h-screen bg-[#f3f4f6]">
            <div className="max-w-4xl mx-auto px-4 py-12">
                {/* 헤더 */}
                <div className="mb-8">
                    <Link href="/" className="text-sm text-brand-600 hover:underline mb-4 inline-block">
                        ← 전체 목록으로
                    </Link>
                    <h1 className="text-3xl font-black text-slate-900 mt-2">
                        {schoolName} 기출문제
                    </h1>
                    <p className="text-slate-500 mt-2">
                        총 <span className="font-bold text-brand-600">{examList.length}개</span>의 시험 자료가 있습니다.
                    </p>
                </div>

                {/* 시험 목록 */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    {examList.map((group: any, idx: number) => {
                        const isMock = group.examType === '모의고사' || group.examType === '수능';
                        const semLabel = isMock ? `${group.semester}월` : `${group.semester}학기`;
                        const hasPdf = group.files.some((f: any) => f.file_type === 'PDF');
                        const hasHwp = group.files.some((f: any) => f.file_type === 'HWP');
                        const hasDb = group.files.some((f: any) => f.file_type === 'DB');

                        return (
                            <div
                                key={idx}
                                className="flex items-center justify-between px-6 py-4 border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors"
                            >
                                <div>
                                    <p className="font-bold text-slate-800">
                                        {group.year}년 {group.grade}학년 {semLabel} {group.examType}
                                        {group.subject && <span className="ml-1 text-brand-600">{group.subject}</span>}
                                    </p>
                                    <div className="flex gap-2 mt-1">
                                        {hasPdf && (
                                            <span className="text-[11px] bg-red-50 text-red-600 font-bold px-2 py-0.5 rounded">PDF</span>
                                        )}
                                        {hasHwp && (
                                            <span className="text-[11px] bg-blue-50 text-blue-600 font-bold px-2 py-0.5 rounded">HWP</span>
                                        )}
                                        {hasDb && (
                                            <span className="text-[11px] bg-indigo-50 text-indigo-600 font-bold px-2 py-0.5 rounded">개인DB</span>
                                        )}
                                    </div>
                                </div>
                                <Link
                                    href={`/?school=${encodeURIComponent(schoolName)}`}
                                    className="text-sm font-bold text-white bg-brand-600 hover:bg-brand-700 px-4 py-2 rounded-lg transition-colors"
                                >
                                    다운로드
                                </Link>
                            </div>
                        );
                    })}
                </div>

                {/* CTA */}
                <div className="mt-8 bg-indigo-50 rounded-xl p-6 text-center border border-indigo-100">
                    <p className="text-indigo-800 font-bold text-lg mb-2">더 많은 학교 기출문제 보기</p>
                    <p className="text-indigo-600 text-sm mb-4">전국 중고등학교 내신 기출문제를 한 곳에서</p>
                    <Link
                        href="/"
                        className="inline-block bg-indigo-600 text-white font-bold px-6 py-3 rounded-lg hover:bg-indigo-700 transition-colors"
                    >
                        수학ETF 홈으로
                    </Link>
                </div>
            </div>
        </div>
    );
}
