import Link from 'next/link';
import Header from '@/components/Header';
import ExamPreviewCarousel from '@/components/ExamPreviewCarousel';
import ExamOpinions, { ExamOpinion } from '@/components/ExamOpinions';
import FreeProblemCTA from '@/components/FreeProblemCTA';
import { schoolDestination } from '@/lib/discovery';

type Props = {
  row: any;
  previews: string[];
  questionCount: number | null;
  sourceKey: string | null;
  hasDb: boolean;
  hasSolutionMaterial: boolean;
  canStartWithQuestions: boolean;
  createHref: string;
  otherYears: { id: string; exam_year: number }[];
  paidPdfId: string | null;
  opinionExamId: string | null;
  opinions: ExamOpinion[];
  narrative: string[];
  concepts: string[];
  composition: { total: number; byUnit: { unit: string; count: number }[]; easy: number; mid: number; hard: number } | null;
  relatedExams: { id: string; school: string; exam_year: number; grade: number; semester: number; exam_type: string; subject: string | null }[];
  relatedReport: { slug: string; title: string } | null;
};

export default function ExamDetailV2({ row, previews, questionCount, sourceKey, hasDb, hasSolutionMaterial, canStartWithQuestions, createHref, otherYears, paidPdfId, opinionExamId, opinions, narrative, concepts, composition, relatedExams, relatedReport }: Props) {
  const isMock = row.exam_type === '모의고사' || row.exam_type === '수능';
  const period = isMock ? `${row.semester}월` : `${row.semester}학기`;
  const title = `${row.school} ${row.exam_year}년 ${row.grade ? `${row.grade}학년 ` : ''}${period} ${row.exam_type || ''}`.replace(/\s+/g, ' ').trim();
  const subject = row.subject || '수학';
  const previewLabel = `${title} ${subject}`;

  return (
    <div className="min-h-screen bg-[#F8F9F5] font-sans text-[#193740]">
      <Header />
      <main className="mx-auto max-w-[1160px] px-4 pb-20 pt-6 sm:px-6 sm:pt-10">
        <div className="mb-7 flex flex-wrap items-center justify-between gap-3">
          <Link href={schoolDestination(row.school)} className="text-sm font-semibold text-[#62776F] transition hover:text-[#176C56]">← {row.school} 시험지 목록</Link>
          <span className="text-xs font-semibold text-[#62776F]">수학ETF 기출 아카이브</span>
        </div>

        <header className="mb-8 border-b border-[#DDE6DE] pb-8 sm:mb-10 sm:pb-10">
          <div className="mb-4 flex items-center gap-3 text-[11px] font-extrabold tracking-[0.17em] text-[#9C7A4B]"><span className="h-px w-8 bg-[#B99766]" /> 기출 시험지</div>
          <h1 className="max-w-[850px] text-[28px] font-black leading-[1.35] tracking-tight text-[#16353D] sm:text-[40px] lg:text-[46px] break-keep">{title}</h1>
          <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm font-semibold text-[#62776F]">
            <span>{subject}</span><span aria-hidden="true" className="text-[#B7C8BE]">/</span>
            {questionCount ? <span>{questionCount}문항</span> : <span>문항 수 확인 중</span>}
          </div>
          <p className="mt-3 text-xs leading-5 text-[#7A8E83]">미리보기는 전체 공개 · {row.free_pdf_url ? '문제 PDF는 회원 무료' : '문제 PDF 제공 여부 확인 중'}{hasSolutionMaterial ? ' · 해설 포함 PDF·HWP는 유료' : ''}</p>
        </header>

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-8">
          <section id="exam-preview" className="order-2 min-w-0 overflow-hidden rounded-[28px] border border-[#DCE6DE] bg-white shadow-[0_16px_50px_rgba(25,55,64,0.05)] lg:order-1">
            <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[#E6EEE8] px-5 py-5 sm:px-7 sm:py-6">
              <div><p className="text-xs font-extrabold tracking-[0.15em] text-[#9C7A4B]">원본 확인</p><h2 className="mt-1 text-xl font-black text-[#193740]">시험지 전체 미리보기</h2></div>
              <span className="rounded-full bg-[#EFF5F0] px-3 py-1.5 text-[11px] font-bold text-[#4D755C]">로그인 없이 열람</span>
            </div>
            {previews.length > 0 ? <div className="bg-[#FAFBF8] px-4 py-5 sm:px-7 sm:py-7"><ExamPreviewCarousel images={previews} label={previewLabel} /></div> : <div className="px-6 py-24 text-center text-sm text-[#83948B]">미리보기를 준비 중입니다.</div>}
            <p className="border-t border-[#E6EEE8] px-5 py-4 text-xs leading-5 text-[#83948B] sm:px-7">미리보기는 문제 전체를 보여줍니다. 해설은 포함되지 않습니다.</p>
          </section>

          <aside className="order-1 lg:order-2 lg:sticky lg:top-24" aria-label="시험지 이용 경로">
            <div className="rounded-[28px] border border-[#DCE6DE] bg-white p-5 shadow-[0_16px_50px_rgba(25,55,64,0.05)] sm:p-6">
              <p className="text-xs font-extrabold tracking-[0.14em] text-[#9C7A4B]">이용 방법</p>
              <h2 className="mt-1 text-xl font-black text-[#193740]">필요한 자료를 선택하세요</h2>
              <div className="mt-5 space-y-4">
                {row.free_pdf_url && <FreeProblemCTA compact examId={row.id} filename={`${row.school}_${row.exam_year}_${row.grade}_${row.semester}_${row.exam_type}_문제.pdf`} sourceKey={sourceKey} school={row.school} />}
                {hasSolutionMaterial && <Link href={paidPdfId ? `/#material=${paidPdfId}` : `/?school=${encodeURIComponent(row.school)}`} rel="nofollow" className="block rounded-2xl border border-[#E4DDCE] bg-[#FBF8F0] p-4 transition hover:border-[#BEA77C]"><span className="block text-[11px] font-extrabold tracking-[0.1em] text-[#9C7A4B]">해설이 필요하다면</span><strong className="mt-1 block text-sm text-[#4F493E]">해설 포함 PDF·HWP 보기 ↗</strong><span className="mt-1 block text-xs leading-5 text-[#847A68]">결제 완료 후 즉시 다운로드 · 30일간 이용</span></Link>}
                {hasDb && <Link href={createHref} className="block rounded-2xl border border-[#CADCD1] bg-[#F0F6F1] p-4 transition hover:border-[#83AE95]"><span className="block text-[11px] font-extrabold tracking-[0.1em] text-[#497D5F]">직접 출제하려면</span><strong className="mt-1 block text-sm text-[#245442]">{canStartWithQuestions ? `${questionCount}문항으로 시험지 만들기 →` : '문항 출제 자료 확인하기 →'}</strong><span className="mt-1 block text-xs leading-5 text-[#698271]">문항을 골라 새 시험지로 편집</span></Link>}
                {!row.free_pdf_url && !hasSolutionMaterial && !hasDb && <p className="rounded-2xl bg-[#F5F7F2] p-4 text-sm text-[#718079]">현재 이용할 수 있는 파일을 확인 중입니다.</p>}
              </div>
              <Link href="/guide#access" className="mt-5 block text-right text-xs font-semibold text-[#76887E] hover:text-[#176C56]">이용 범위 안내 ↗</Link>
            </div>
          </aside>
        </div>

        {opinionExamId && questionCount && <div className="mt-12 sm:mt-16"><ExamOpinions examId={opinionExamId} questionCount={questionCount} initialOpinions={opinions} /></div>}

        {narrative.length > 0 && <section className="mt-12 border-t border-[#DDE6DE] pt-8" aria-labelledby="exam-analysis-title"><p className="text-xs font-extrabold tracking-[0.15em] text-[#A07446]">시험 분석</p><h2 id="exam-analysis-title" className="mt-2 text-xl font-black text-[#193740]">이 시험의 출제 흐름</h2><div className="mt-4 max-w-4xl space-y-3 text-sm leading-7 text-[#506960]">{narrative.map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div>{composition && <div className="mt-5 flex flex-wrap gap-2 text-xs font-bold text-[#456557]"><span className="rounded-full bg-white px-3 py-1.5">쉬움 {composition.easy}문항</span><span className="rounded-full bg-white px-3 py-1.5">보통 {composition.mid}문항</span><span className="rounded-full bg-white px-3 py-1.5">어려움 {composition.hard}문항</span></div>}{concepts.length > 0 && <p className="mt-4 max-w-4xl text-xs leading-6 text-[#71867A]">주요 개념: {concepts.join(' · ')}</p>}</section>}

        {otherYears.length > 0 && <section className="mt-12 border-t border-[#DDE6DE] pt-8"><h2 className="text-lg font-black text-[#193740]">같은 시험, 다른 연도</h2><div className="mt-4 flex flex-wrap gap-2">{otherYears.map(year => <Link key={year.id} href={`/exam/${year.id}`} className="rounded-full border border-[#D5E2D8] bg-white px-4 py-2 text-sm font-semibold text-[#4B6D59] hover:bg-[#EFF5F0]">{year.exam_year}년 →</Link>)}</div></section>}
        {relatedExams.length > 0 && <section className="mt-8"><h2 className="text-lg font-black text-[#193740]">{row.school}의 관련 시험지</h2><div className="mt-4 flex flex-wrap gap-2">{relatedExams.map(item => <Link key={item.id} href={`/exam/${item.id}`} className="rounded-full border border-[#D5E2D8] bg-white px-4 py-2 text-sm font-semibold text-[#4B6D59] hover:bg-[#EFF5F0]">{item.exam_year}년 {item.grade}학년 {item.semester}학기 {item.exam_type} →</Link>)}</div></section>}
        {relatedReport && <Link href={`/insights/${relatedReport.slug}`} className="mt-7 block text-sm font-semibold text-[#4B6D59] hover:underline">{relatedReport.title} · 출제 동향 보기 →</Link>}
        <div className="mt-12 text-center"><Link href="/schools" className="text-sm font-semibold text-[#71867A] hover:text-[#176C56]">전국 학교별 기출 자료 보기 →</Link></div>
      </main>
    </div>
  );
}
