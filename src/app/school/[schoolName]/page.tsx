import { createAdminClient } from '@/utils/supabase/server-admin';
import Link from 'next/link';
import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Header from '@/components/Header';
import { ChevronRight } from 'lucide-react';
import { examYearOf, examGroupKey } from '@/lib/exam-groups';

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
        .neq('school', 'DELETED');

    if (!data) return [];

    const schools = Array.from(new Set(data.map((item: any) => item.school)));
    return schools.map((school: string) => ({
        schoolName: school,  // Next.js가 URL 디코딩을 자동으로 처리하므로 인코딩 불필요
    }));
}

// 학교 대표 og:image — 그 학교 시험지 미리보기 첫 장 (없으면 공통 로고)
async function schoolOgImage(schoolName: string): Promise<string> {
    try {
        const supabase = createAdminClient();
        const { data } = await supabase
            .from('exam_materials')
            .select('preview_urls')
            .eq('school', schoolName)
            .not('preview_urls', 'is', null)
            .order('created_at', { ascending: false })
            .limit(5);
        const first = (data || [])
            .flatMap((r: any) => (Array.isArray(r.preview_urls) ? r.preview_urls : []))
            .find(Boolean);
        if (first) return first;
    } catch { }
    return '/og-image.png';
}

// 동적 메타 태그 - 학교명 포함
export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const schoolName = decodeURIComponent(params.schoolName);
    const ogImage = await schoolOgImage(schoolName);

    // 경찰대·사관학교·전국연합 특화 키워드
    const SPECIAL_SCHOOLS: Record<string, { title: string; description: string; keywords: string[] }> = {
        '경찰대학교': {
            title: '경찰대학교 수학 기출문제·변형문제 - 수학ETF',
            description: '경찰대학교 1차 수학 기출문제와 변형문제 다운로드. 원본 기출은 물론 같은 유형의 변형문제까지 HWP·PDF로 무료 제공.',
            keywords: ['경찰대 수학', '경찰대 기출문제', '경찰대 변형문제', '경찰대 수학 문제', '경찰대학교 입학시험', '경찰대 수학 기출'],
        },
        '육군사관학교': {
            title: '육군사관학교 수학 기출문제·변형문제 - 수학ETF',
            description: '육군사관학교 수학 기출문제와 변형문제 다운로드. 원본 기출과 같은 유형의 변형문제를 HWP·PDF로 무료 제공.',
            keywords: ['육군사관학교 수학', '사관학교 수학', '사관학교 기출문제', '사관학교 변형문제', '육사 수학 기출'],
        },
        '해군사관학교': {
            title: '해군사관학교 수학 기출문제·변형문제 - 수학ETF',
            description: '해군사관학교 수학 기출문제와 변형문제 다운로드. 원본 기출과 같은 유형의 변형문제를 HWP·PDF로 무료 제공.',
            keywords: ['해군사관학교 수학', '사관학교 수학', '사관학교 기출문제', '사관학교 변형문제', '해사 수학 기출'],
        },
        '공군사관학교': {
            title: '공군사관학교 수학 기출문제·변형문제 - 수학ETF',
            description: '공군사관학교 수학 기출문제와 변형문제 다운로드. 원본 기출과 같은 유형의 변형문제를 HWP·PDF로 무료 제공.',
            keywords: ['공군사관학교 수학', '사관학교 수학', '사관학교 기출문제', '사관학교 변형문제', '공사 수학 기출'],
        },
        '국군간호사관학교': {
            title: '국군간호사관학교 수학 기출문제·변형문제 - 수학ETF',
            description: '국군간호사관학교 수학 기출문제와 변형문제 다운로드. 원본 기출과 같은 유형의 변형문제를 HWP·PDF로 무료 제공.',
            keywords: ['국군간호사관학교 수학', '사관학교 수학', '사관학교 변형문제', '간호사관학교 수학 기출'],
        },
        '사관학교': {
            title: '사관학교 수학 기출문제·변형문제 (육·해·공·간호 1차) - 수학ETF',
            description: '사관학교 1차 필기 수학 기출문제와 변형문제 다운로드. 원본 기출은 물론 같은 유형의 변형문제까지 HWP·PDF로 무료 제공.',
            keywords: ['사관학교 수학', '사관학교 기출', '사관학교 변형문제', '사관학교 1차 수학', '육군사관학교 수학', '해군사관학교 수학', '공군사관학교 수학', '국군간호사관학교 수학', '사관학교 수학 기출'],
        },
        '전국연합': {
            title: '전국연합학력평가 수학 기출문제·변형문제 - 수학ETF',
            description: '전국연합학력평가 수학 기출문제와 변형문제 다운로드. 3월·6월·9월·11월 학력평가 원본과 변형문제를 HWP·PDF로 무료 제공.',
            keywords: ['전국연합학력평가 수학', '전국연합 변형문제', '수학 모의고사', '3월 모의고사 수학', '6월 모의고사 수학', '9월 모의고사 수학', '11월 모의고사 수학', '고1 모의고사 수학', '고2 모의고사 수학', '고3 모의고사 수학'],
        },
    };

    const special = SPECIAL_SCHOOLS[schoolName];
    if (special) {
        return {
            title: special.title,
            description: special.description,
            keywords: special.keywords,
            openGraph: {
                title: special.title,
                description: special.description,
                url: `https://mathetf.com/school/${encodeURIComponent(schoolName)}`,
                images: [ogImage],
            },
            alternates: { canonical: `/school/${encodeURIComponent(schoolName)}` },
        };
    }

    return {
        title: `${schoolName} 수학 기출문제 - 수학ETF`,
        description: `${schoolName} 수학 내신 기출문제 다운로드. 중간고사, 기말고사 HWP, PDF 형식 제공. 수학ETF에서 즉시 확인하세요.`,
        keywords: [`${schoolName} 수학 기출문제`, `${schoolName} 내신`, `${schoolName} 중간고사`, `${schoolName} 기말고사`, '수학 내신 기출문제', '수학 문제은행'],
        openGraph: {
            title: `${schoolName} 수학 기출문제 - 수학ETF`,
            description: `${schoolName} 수학 내신 기출문제를 즉시 다운로드하세요.`,
            url: `https://mathetf.com/school/${encodeURIComponent(schoolName)}`,
            images: [ogImage],
        },
        alternates: { canonical: `/school/${encodeURIComponent(schoolName)}` },
    };
}

// 특수 페이지(사관학교·경찰대·전국연합 등)는 '내신'이 아니므로 전용 소개문 사용 (검색의도 일치 + CTR)
const SPECIAL_INTRO: Record<string, string> = {
    '사관학교': '사관학교(육군·해군·공군·국군간호) 1차 필기시험 수학 영역 기출문제 모음입니다. 원본 기출은 물론 같은 유형의 변형문제까지 제공해, 한 번 더 실전 연습할 수 있어요. 문제와 해설을 PDF·한글(HWP)로 무료로 받을 수 있습니다.',
    '육군사관학교': '육군사관학교 1차시험 수학 기출문제 모음입니다. 원본 기출과 같은 유형의 변형문제를 함께 제공해 상위권 실전 대비에 좋습니다. 문제와 해설을 PDF·한글(HWP)로 무료 제공합니다.',
    '해군사관학교': '해군사관학교 1차시험 수학 기출문제 모음입니다. 원본 기출과 같은 유형의 변형문제를 함께 제공해 상위권 실전 대비에 좋습니다. 문제와 해설을 PDF·한글(HWP)로 무료 제공합니다.',
    '공군사관학교': '공군사관학교 1차시험 수학 기출문제 모음입니다. 원본 기출과 같은 유형의 변형문제를 함께 제공해 상위권 실전 대비에 좋습니다. 문제와 해설을 PDF·한글(HWP)로 무료 제공합니다.',
    '국군간호사관학교': '국군간호사관학교 1차시험 수학 기출문제 모음입니다. 원본 기출과 같은 유형의 변형문제를 함께 제공합니다. 문제와 해설을 PDF·한글(HWP)로 무료 제공합니다.',
    '경찰대학교': '경찰대학교 1차시험 수학 기출문제 모음입니다. 원본 기출은 물론 같은 유형의 변형문제까지 제공해 상위권 실전 감각 훈련에 좋습니다. 문제와 해설을 PDF·한글(HWP)로 무료 제공합니다.',
    '전국연합': '전국연합학력평가(시·도 교육청 주관) 수학 기출문제 모음입니다. 3월·6월·9월·11월 학력평가 원본 문제와 같은 유형의 변형문제를 학년·연도별로 정리했어요. 문제와 해설을 PDF·한글(HWP)로 무료로 받을 수 있습니다.',
};

export default async function SchoolPage({ params }: Props) {
    const schoolName = decodeURIComponent(params.schoolName);
    const specialIntro = SPECIAL_INTRO[schoolName];
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

    // 시험 단위로 그룹핑 (/schools 목록 카운트와 동일 기준 — lib/exam-groups)
    const groups: Record<string, any> = {};
    exams.forEach((item: any) => {
        const year = examYearOf(item);
        const key = examGroupKey(item);
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

    // [SEO] 학교 지역 + 단원 분포 (얇은 콘텐츠 방지용 고유 텍스트)
    let region = '';
    try {
        // 동명 학교로 중복행이 있으면 maybeSingle()이 에러 → 첫 행 사용으로 지역 항상 표시
        const { data: sc } = await supabase.from('schools').select('region, district').eq('name', schoolName).limit(1);
        if (sc && sc[0]) region = [sc[0].region, sc[0].district].filter(Boolean).join(' ');
    } catch { }
    // 단원 분포는 '과목별'로 분리 (학년·과목 다른 시험을 한 표로 합치면 의미 없음)
    let subjUnits: { subject: string; total: number; units: { unit: string; count: number }[] }[] = [];
    try {
        const { data: qs } = await supabase.from('questions').select('subject, unit').eq('school', schoolName);
        if (qs && qs.length) {
            const bySubj: Record<string, Record<string, number>> = {};
            qs.forEach((q: any) => {
                const s = (q.subject || '기타').toString();
                const un = (q.unit || '기타').toString();
                (bySubj[s] = bySubj[s] || {})[un] = (bySubj[s][un] || 0) + 1;
            });
            subjUnits = Object.entries(bySubj).map(([subject, m]) => ({
                subject,
                total: Object.values(m).reduce((a, b) => a + b, 0),
                units: Object.entries(m).map(([unit, count]) => ({ unit, count })).sort((a, b) => b.count - a.count).slice(0, 6),
            })).sort((a, b) => b.total - a.total);
        }
    } catch { }
    const subjects = Array.from(new Set(examList.map((g: any) => g.subject).filter(Boolean)));
    const years = Array.from(new Set(examList.map((g: any) => g.year))).sort((a: number, b: number) => b - a);

    return (
        <div className="min-h-screen bg-[#F8FAFD] text-[#1E2D4F] font-sans">
            <Header />
            <main className="max-w-3xl mx-auto px-4 py-8 sm:py-10">
                {/* 브레드크럼 */}
                <Link href="/" className="text-sm text-[#497AB7] hover:underline mb-4 inline-flex items-center gap-1">
                    ← 전체 기출 목록
                </Link>

                {/* 제목 */}
                <div className="mb-6">
                    <h1 className="text-2xl sm:text-3xl font-black break-keep">
                        {schoolName} 수학 기출문제
                    </h1>
                    <p className="text-slate-500 mt-2 text-sm">
                        총 <span className="font-bold text-[#497AB7]">{examList.length}개</span>의 시험 자료 · 문제 미리보기 무료
                    </p>
                </div>

                {/* 학교 소개 (SEO 고유 텍스트) */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 mb-4">
                    {specialIntro ? (
                        <p className="text-slate-600 leading-relaxed break-keep text-sm">
                            {specialIntro} 현재 <strong className="text-[#497AB7]">{examList.length}개</strong> 회차의 문제와 해설을 제공하며,
                            문제 미리보기와 워터마크 없는 PDF·한글(HWP)은 회원가입 시 무료로 받을 수 있습니다.
                        </p>
                    ) : (
                        <p className="text-slate-600 leading-relaxed break-keep text-sm">
                            <strong className="text-[#1E2D4F]">{schoolName}</strong>
                            {region ? ` (${region})` : ''}의 수학 내신 기출문제 모음입니다.
                            {years.length > 0 && <> {years[0]}{years.length > 1 ? `~${years[years.length - 1]}` : ''}년 </>}
                            {subjects.length > 0 && <>{subjects.join('·')} 등 </>}
                            총 <strong className="text-[#497AB7]">{examList.length}개</strong> 시험지의 문제와 해설을 제공하며,
                            문제 미리보기와 워터마크 없는 문제 PDF는 회원가입 시 무료로 받을 수 있습니다.
                        </p>
                    )}

                    {subjUnits.length > 0 && (
                        <div className="mt-4 pt-4 border-t border-slate-100 space-y-3">
                            <p className="text-xs font-bold text-slate-700">📊 과목별 출제 단원</p>
                            {subjUnits.map((s) => (
                                <div key={s.subject}>
                                    <p className="text-xs font-bold text-[#497AB7] mb-1.5">{s.subject} <span className="text-slate-400 font-normal">({s.total}문항)</span></p>
                                    <div className="flex flex-wrap gap-1.5">
                                        {s.units.map((u) => (
                                            <span key={u.unit} className="text-[11px] bg-[#EEF4FB] text-[#1E2D4F] border border-[#B7D1EA]/60 px-2 py-0.5 rounded-full">
                                                {u.unit} <span className="text-[#497AB7] font-bold">{u.count}</span>
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* 시험 목록 (홈 카드 스타일) */}
                <div className="space-y-2">
                    {examList.map((group: any, idx: number) => {
                        const isMock = group.examType === '모의고사' || group.examType === '수능';
                        const semLabel = isMock ? `${group.semester}월` : `${group.semester}학기`;
                        const hasPdf = group.files.some((f: any) => f.file_type === 'PDF');
                        const hasHwp = group.files.some((f: any) => f.file_type === 'HWP');
                        const hasDb = group.files.some((f: any) => f.file_type === 'DB');
                        // 상세페이지(/exam/[id]) 앵커 = 해설 PDF 행
                        const detailFile = group.files.find((f: any) => f.file_type === 'PDF' && f.content_type === '해설') || group.files.find((f: any) => f.file_type === 'PDF');
                        const href = detailFile ? `/exam/${detailFile.id}` : `/?school=${encodeURIComponent(schoolName)}`;

                        return (
                            <Link
                                key={idx}
                                href={href}
                                className="group flex items-center justify-between gap-3 bg-white rounded-xl shadow-sm hover:shadow-md transition-all duration-200 border-l-4 border-l-[#497AB7] border border-slate-100 px-4 sm:px-5 py-4"
                            >
                                <div className="min-w-0">
                                    <p className="font-bold text-base text-[#1E2D4F] group-hover:text-[#497AB7] transition-colors break-keep leading-snug">
                                        {group.year}년 {group.grade}학년 {semLabel} {group.examType}
                                        {group.subject && <span className="ml-1 text-[#497AB7]">{group.subject}</span>}
                                    </p>
                                    <div className="flex gap-1.5 mt-1.5 flex-wrap">
                                        {hasPdf && <span className="text-[10px] bg-emerald-50 text-emerald-600 border border-emerald-100 font-bold px-2 py-0.5 rounded-full">문제 무료</span>}
                                        {hasPdf && <span className="text-[10px] bg-red-50 text-red-500 border border-red-100 font-bold px-2 py-0.5 rounded-full">PDF</span>}
                                        {hasHwp && <span className="text-[10px] bg-[#E0F7F6] text-[#3AADA9] border border-teal-100 font-bold px-2 py-0.5 rounded-full">HWP</span>}
                                        {hasDb && <span className="text-[10px] bg-[#E8F0FB] text-[#497AB7] border border-blue-100 font-bold px-2 py-0.5 rounded-full">개인DB</span>}
                                    </div>
                                </div>
                                <span className="flex-shrink-0 text-[#497AB7] group-hover:translate-x-0.5 transition-transform">
                                    <ChevronRight size={20} />
                                </span>
                            </Link>
                        );
                    })}
                </div>

                {/* CTA (브랜드 그라데이션) */}
                <div className="mt-8 bg-gradient-to-br from-[#497AB7] to-[#3AADA9] rounded-2xl p-6 text-center text-white shadow-md">
                    <p className="font-bold text-lg mb-1">다른 학교 기출도 찾아보세요</p>
                    <p className="text-white/85 text-sm mb-4 break-keep">전국 중·고등학교 수학 내신 기출을 한 곳에서</p>
                    <div className="flex flex-col sm:flex-row justify-center gap-2.5">
                        <Link
                            href="/schools"
                            className="inline-block bg-white text-[#497AB7] font-extrabold px-6 py-3 rounded-xl hover:bg-slate-50 transition-colors"
                        >
                            학교별 기출 목록
                        </Link>
                        <Link
                            href="/"
                            className="inline-block border-2 border-white/70 text-white font-extrabold px-6 py-3 rounded-xl hover:bg-white/10 transition-colors"
                        >
                            전체 기출 보러가기
                        </Link>
                    </div>
                </div>
            </main>
        </div>
    );
}
