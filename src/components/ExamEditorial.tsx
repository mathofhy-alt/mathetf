import type { ExamEditorial } from '@/lib/exam-editorials';

export function ExamEditorialSummary({ editorial }: { editorial: ExamEditorial }) {
    return <section aria-label="시험 분석 핵심 요약" className="mb-8 rounded-2xl border border-[#DCE5F1] bg-white px-5 py-5 sm:px-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-bold text-[#244679]">먼저 읽는 시험 분석</h2>
            <a href="#exam-analysis-title" className="rounded-md text-xs font-semibold text-[#2858D5] underline underline-offset-4 focus-visible:outline focus-visible:outline-2">상세 분석 읽기 ↓</a>
        </div>
        <ul className="mt-3 space-y-2 text-sm leading-6 text-[#52657A]">{editorial.summary.map(text => <li key={text} className="flex gap-2"><span aria-hidden="true" className="text-[#7294C7]">·</span><span>{text}</span></li>)}</ul>
    </section>;
}

export default function ExamEditorialArticle({ editorial }: { editorial: ExamEditorial }) {
    return <section aria-labelledby="exam-analysis-title" className="mt-12 rounded-[24px] border border-[#DEE5EE] bg-white px-5 py-8 sm:mt-16 sm:px-10 sm:py-10">
        <div className="mx-auto max-w-[780px]">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs"><p className="font-bold tracking-wider text-[#4972A7]">문항으로 읽는 시험 분석</p><p className="text-[#8290A2]">분석 작성 {editorial.reviewedAt}</p></div>
            <h2 id="exam-analysis-title" className="mt-4 scroll-mt-28 text-[24px] font-extrabold leading-snug tracking-tight text-[#1C344F] sm:text-[30px] break-keep">{editorial.title}</h2>
            <p className="mt-5 text-[15px] leading-8 text-[#53657A] break-keep">{editorial.introduction}</p>
            <div className="mt-9 space-y-9">{editorial.questions.map(question => <article key={question.number} className="border-t border-[#E8EDF3] pt-7">
                <div className="mb-3 flex items-start gap-3"><span className="shrink-0 rounded-lg bg-[#EFF4FD] px-3 py-1.5 text-xs font-bold text-[#2858D5]">{question.number}번</span><h3 className="pt-0.5 text-lg font-bold leading-7 text-[#213D5C] break-keep">{question.title}</h3></div>
                {question.paragraphs.map(text => <p key={text} className="mt-3 text-[15px] leading-8 text-[#53657A] break-keep">{text}</p>)}
            </article>)}</div>
            <div className="mt-9 rounded-2xl bg-[#F5F8FC] px-5 py-5 sm:px-6"><h3 className="text-lg font-bold text-[#213D5C]">다음 시험을 위한 연습</h3>{editorial.preparation.map(text => <p key={text} className="mt-3 text-[15px] leading-8 text-[#53657A] break-keep">{text}</p>)}</div>
            <p className="mt-6 text-xs leading-6 text-[#7D8B9D]">{editorial.scope}</p>
            <a href="#exam-preview" className="mt-5 inline-block text-sm font-semibold text-[#2858D5] underline underline-offset-4">원본 문제와 함께 다시 보기 ↑</a>
        </div>
    </section>;
}
