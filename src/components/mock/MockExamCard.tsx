import Link from 'next/link';
import { ArrowRight, FileText } from 'lucide-react';

// 분류별 디자인 토큰 (그라데이션·글리프·색). 클래스는 리터럴이라 Tailwind JIT가 인식함.
export const MOCK_CATEGORIES = {
    '수능': { label: '수능', grad: 'from-rose-500 to-pink-500', glyph: '∫', text: 'text-rose-600', soft: 'bg-rose-50', solid: 'group-hover:bg-rose-500', bar: 'from-rose-500 to-pink-500' },
    '평가원': { label: '평가원', grad: 'from-indigo-500 to-violet-500', glyph: '∑', text: 'text-indigo-600', soft: 'bg-indigo-50', solid: 'group-hover:bg-indigo-500', bar: 'from-indigo-500 to-violet-500' },
    '전국연합': { label: '전국연합', grad: 'from-sky-500 to-blue-500', glyph: '√', text: 'text-sky-600', soft: 'bg-sky-50', solid: 'group-hover:bg-sky-500', bar: 'from-sky-500 to-blue-500' },
    '경찰대': { label: '경찰대', grad: 'from-teal-500 to-emerald-500', glyph: 'π', text: 'text-teal-600', soft: 'bg-teal-50', solid: 'group-hover:bg-teal-500', bar: 'from-teal-500 to-emerald-500' },
    '사관학교': { label: '사관학교', grad: 'from-emerald-500 to-green-600', glyph: '∞', text: 'text-emerald-600', soft: 'bg-emerald-50', solid: 'group-hover:bg-emerald-500', bar: 'from-emerald-500 to-green-600' },
} as const;

export type MockCategory = keyof typeof MOCK_CATEGORIES;

// 분류별 설명 (허브·분류 페이지 공용 SEO 텍스트)
export const CATEGORY_DESC: Record<string, string> = {
    '전국연합': '전국연합학력평가는 시·도 교육청이 주관하는 전국 단위 모의고사로, 내 위치를 전국 기준으로 점검할 수 있는 시험입니다.',
    '평가원': '한국교육과정평가원이 주관하는 6월·9월 모의평가로, 그해 수능 출제 경향을 가장 잘 보여주는 핵심 시험입니다.',
    '수능': '대학수학능력시험 수학 영역 기출입니다. 실제 수능과 동일한 형식으로 실전 감각을 익힐 수 있습니다.',
    '경찰대': '경찰대학 1차시험 수학 기출입니다. 일반 수능보다 까다로운 문항으로 상위권 변별에 활용됩니다.',
    '사관학교': '사관학교(육군·해군·공군·국군간호) 1차시험 수학 기출입니다. 높은 난이도로 실전 대비에 좋습니다.',
};

export interface MockExam {
    slug: string;
    category: MockCategory;
    title: string;
    year: number;
    grade: string;
    month: number;
    subject?: string;
    hasVariant?: boolean;
}

export default function MockExamCard({ exam }: { exam: MockExam }) {
    const cat = MOCK_CATEGORIES[exam.category] ?? MOCK_CATEGORIES['전국연합'];
    return (
        <Link
            href={`/모의고사/${exam.slug}`}
            className="group relative overflow-hidden rounded-2xl bg-white border border-slate-200/80 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300"
        >
            {/* 상단 그라데이션 액센트 바 */}
            <div className={`h-1.5 w-full bg-gradient-to-r ${cat.bar}`} />

            {/* 큰 수학기호 워터마크 */}
            <span className={`pointer-events-none absolute -right-3 bottom-1 text-[120px] leading-none font-black italic select-none ${cat.text} opacity-[0.07] group-hover:opacity-[0.12] transition-opacity duration-300`}>
                {cat.glyph}
            </span>

            <div className="relative p-4">
                {/* 분류 배지 + 연도 */}
                <div className="flex items-center justify-between">
                    <span className={`text-[11px] font-extrabold text-white px-2.5 py-1 rounded-full bg-gradient-to-r ${cat.grad} shadow-sm`}>
                        {cat.label}
                    </span>
                    <span className="text-xs font-bold text-slate-300 tabular-nums">{exam.year}</span>
                </div>

                {/* 제목 */}
                <h3 className="mt-3 text-[15px] font-bold text-[#1E2D4F] leading-snug break-keep line-clamp-2 group-hover:text-[#497AB7] transition-colors">
                    {exam.title}
                </h3>

                {/* 메타 */}
                <p className="mt-1 text-xs text-slate-400 font-medium">
                    {exam.grade} · {exam.month}월{exam.subject ? ` · ${exam.subject}` : ''}
                </p>

                {/* 하단: 포맷 배지 + 화살표 */}
                <div className="mt-4 flex items-center justify-between">
                    <div className="flex flex-wrap items-center gap-1">
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-500">
                            <FileText size={10} /> 원본
                        </span>
                        {exam.hasVariant !== false && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-[#497AB7]/10 text-[#497AB7]">변형</span>
                        )}
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-400">PDF·HWP</span>
                    </div>
                    <span className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${cat.soft} ${cat.text} ${cat.solid} group-hover:text-white transition-all duration-300`}>
                        <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
                    </span>
                </div>
            </div>
        </Link>
    );
}
