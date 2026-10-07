import Link from 'next/link';
import { mockQuestionHref } from '@/lib/mock-question-link';
import { ChevronRight } from 'lucide-react';

// 분류별 표시값. 10/7 새 디자인부터는 색 대신 글리프만 쓴다(색은 청록 하나 — 디자인 규칙).
//   grad·text 등 옛 값은 아직 옛 화면이 참조할 수 있어 남겨 둔다.
export const MOCK_CATEGORIES = {
    '수능': { label: '수능', grad: 'from-rose-500 to-pink-500', glyph: '∫', text: 'text-rose-600', soft: 'bg-rose-50', solid: 'group-hover:bg-rose-500', bar: 'from-rose-500 to-pink-500' },
    '평가원': { label: '평가원', grad: 'from-brand-500 to-violet-500', glyph: '∑', text: 'text-brand-600', soft: 'bg-brand-50', solid: 'group-hover:bg-brand-500', bar: 'from-brand-500 to-violet-500' },
    '전국연합': { label: '전국연합', grad: 'from-sky-500 to-brand-500', glyph: '√', text: 'text-sky-600', soft: 'bg-sky-50', solid: 'group-hover:bg-sky-500', bar: 'from-sky-500 to-brand-500' },
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
    original_pdf_path?: string | null;
    original_hwp_path?: string | null;
    variant_pdf_path?: string | null;
    variant_hwp_path?: string | null;
    materialOnly?: boolean;
    materialDbs?: { id: string; subject: string }[];
}

// 회차 카드(10/7 새 디자인) — 허브·분류·상세 '다른 회차'에서 같이 쓴다
export default function MockExamCard({ exam }: { exam: MockExam }) {
    const createHref = mockQuestionHref(exam);
    const tags = [
        exam.materialOnly ? '문항별 출제' : null,
        (exam.original_pdf_path || exam.original_hwp_path) ? '원본' : null,
        (exam.hasVariant === true || exam.variant_pdf_path || exam.variant_hwp_path) ? '변형' : null,
    ].filter(Boolean) as string[];
    const meta = [exam.grade, exam.month ? `${exam.month}월` : '', exam.subject || ''].filter(Boolean).join(', ');
    return <div className="rd-mk-card">
        <Link href={`/모의고사/${exam.slug}`} className="rd-mk-card-main">
            <span className="rd-mk-card-top"><span>{exam.category}</span><span>{exam.year}</span></span>
            <b>{exam.title}</b>
            {meta && <small>{meta}</small>}
            {tags.length > 0 && <span className="rd-mk-tags">{tags.map(t => <em key={t}>{t}</em>)}</span>}
        </Link>
        {createHref && <Link href={createHref} className="rd-mk-card-make">이 회차로 시험지 만들기<ChevronRight size={16} aria-hidden="true" /></Link>}
    </div>;
}
