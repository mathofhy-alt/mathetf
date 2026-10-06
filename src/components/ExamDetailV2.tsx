import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { examEditorials } from '@/lib/exam-editorials';
import ExamEditorialArticle from '@/components/ExamEditorial';
import Header from '@/components/Header';
import ExamPreview from '@/components/exam/ExamPreview';
import ExamSide from '@/components/exam/ExamSide';
import { ExamOpinion } from '@/components/ExamOpinions';
import FreeProblemCTA from '@/components/FreeProblemCTA';
import PaidMaterialChoice from '@/components/PaidMaterialChoice';
import { schoolDestination } from '@/lib/discovery';
import { getSchoolAddress } from '@/lib/school-address';

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
  paidMaterials: { id: string; type: 'PDF' | 'HWP'; price: number }[];
  opinionExamId: string | null;
  opinions: ExamOpinion[];
  narrative: string[];
  concepts: string[];
  composition: { total: number; byUnit: { unit: string; count: number }[]; easy: number; mid: number; hard: number } | null;
  relatedExams: { id: string; school: string; exam_year: number; grade: number; semester: number; exam_type: string; subject: string | null }[];
  relatedReport: { slug: string; title: string } | null;
};

// 단원 막대 위 큰 제목 — 숫자로 확인되는 사실만 말한다(동률이면 '가장 많고'라고 하지 않는다)
function unitHeadline(units: { unit: string; count: number }[]) {
  if (units.length === 0) return null;
  if (units.length === 1) return <>모든 문항이 {units[0].unit}<br />단원에서 나왔습니다</>;
  const top = units.filter(u => u.count === units[0].count);
  if (top.length > 1) return <>{top.slice(0, 3).map(u => u.unit).join(', ')}<br />단원이 가장 많이 나왔습니다</>;
  const next = units.slice(1, 3).map(u => u.unit).join(', ');
  return <>{units[0].unit} 단원이 가장 많고,<br />{next} 순입니다</>;
}

export default function ExamDetailV2({ row, previews, questionCount, sourceKey, hasDb, hasSolutionMaterial, canStartWithQuestions, createHref, otherYears, paidMaterials, opinionExamId, opinions, narrative, concepts, composition, relatedExams, relatedReport }: Props) {
  const editorial = examEditorials[row.id];
  const isMock = row.exam_type === '모의고사' || row.exam_type === '수능';
  const period = isMock ? `${row.semester}월` : `${row.semester}학기`;
  const title = `${row.school} ${row.exam_year}년 ${row.grade ? `${row.grade}학년 ` : ''}${period} ${row.exam_type || ''}`.replace(/\s+/g, ' ').trim();
  const titleRest = title.slice(String(row.school).length).trim();
  const subject = row.subject || '수학';
  const previewLabel = `${title} ${subject}`;
  const schoolAddress = isMock ? null : getSchoolAddress(row.school, row.region, row.district);
  const units = composition ? [...composition.byUnit].sort((a, b) => b.count - a.count) : [];
  const maxUnit = Math.max(1, ...units.map(u => u.count));
  const hasMore = otherYears.length > 0 || relatedExams.length > 0;

  return (
    <div className="rd rd-x">
      <Header />
      <div>
        <section className="rd-wrap rd-x-top">
          <Link href={schoolDestination(row.school)} className="rd-x-back"><ChevronLeft size={18} aria-hidden="true" />{row.school} 시험지 목록</Link>
          <h1 className="rd-x-h1">{row.school}{' '}<br />{titleRest}</h1>
          <div className="rd-x-meta">
            <span className="rd-pill is-accent">{subject}</span>
            {questionCount ? <span className="rd-pill">{questionCount}문항</span> : null}
            {schoolAddress && <span className="rd-x-addr">{schoolAddress}</span>}
          </div>
        </section>

        <section className="rd-wrap">
          <div className="rd-x-main">
            <div className="rd-x-left">
              <section id="exam-preview" className="rd-x-prev" aria-labelledby="exam-preview-title">
                <div className="rd-x-prev-head">
                  <h2 id="exam-preview-title">시험지 전체 미리보기</h2>
                  <p>로그인 없이 볼 수 있어요. 해설은 빠져 있습니다.</p>
                </div>
                {previews.length > 0 ? <ExamPreview images={previews} label={previewLabel} /> : <p className="rd-x-empty">미리보기를 준비 중입니다.</p>}
              </section>

              {editorial && <ExamEditorialArticle editorial={editorial} />}

              {!editorial && composition && <section className="rd-x-analysis" aria-labelledby="exam-analysis-title">
                <p className="rd-kicker">시험 분석</p>
                <h2 id="exam-analysis-title" className="rd-x-h2">{unitHeadline(units)}</h2>
                <div className="rd-x-bars">
                  {units.slice(0, 8).map(u => <div key={u.unit} className="rd-x-bar">
                    <span title={u.unit}>{u.unit}</span>
                    <div className="rd-x-track"><span style={{ width: `${Math.round(u.count / maxUnit * 100)}%` }} /></div>
                    <span>{u.count}문항</span>
                  </div>)}
                </div>

                <h3 className="rd-x-sub">문항 난이도 분포</h3>
                <div className="rd-x-bars is-tight">
                  {[{ label: '쉬움', count: composition.easy }, { label: '보통', count: composition.mid }, { label: '어려움', count: composition.hard }].map(item => <div key={item.label} className="rd-x-bar">
                    <span>{item.label}</span>
                    <div className="rd-x-track"><span style={{ width: `${Math.round(item.count / Math.max(1, composition.total) * 100)}%` }} /></div>
                    <span>{item.count}문항</span>
                  </div>)}
                </div>
                <p className="rd-x-note">연결된 {composition.total}개 문항의 분류 결과이며, 학생 평균 점수나 정답률이 아닙니다.</p>

                {concepts.length > 0 && <>
                  <h3 className="rd-x-sub">대표 개념과 유형</h3>
                  <div className="rd-x-concepts">{concepts.slice(0, 12).map(concept => <span key={concept}>{concept.replace(/[:_]/g, ' ')}</span>)}</div>
                </>}

                {narrative.length > 0 && <div className="rd-x-box">{narrative.map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div>}
              </section>}
            </div>

            <aside id="exam-side" className="rd-x-side" aria-label="자료 받기와 이용자 의견">
              <ExamSide opinion={opinionExamId && questionCount ? { examId: opinionExamId, questionCount, initialOpinions: opinions } : null}>
                <div className="rd-get-stack">
                  {row.free_pdf_url && <FreeProblemCTA compact examId={row.id} filename={`${row.school}_${row.exam_year}_${row.grade}_${row.semester}_${row.exam_type}_문제.pdf`} sourceKey={sourceKey} school={row.school} />}
                  {hasSolutionMaterial && <PaidMaterialChoice examId={row.id} title={previewLabel} materials={paidMaterials} />}
                  {hasDb && <Link href={createHref} className="rd-get-row">
                    <span><b>{canStartWithQuestions ? `${questionCount}문항으로 시험지 만들기` : '문항 출제 자료 확인하기'}</b><small>필요한 문항만 골라 새 시험지로</small></span>
                    <ChevronRight size={22} aria-hidden="true" />
                  </Link>}
                  {!row.free_pdf_url && !hasSolutionMaterial && !hasDb && <p className="rd-get-card is-zone rd-get-text">현재 이용할 수 있는 파일을 확인 중입니다.</p>}
                </div>
              </ExamSide>
              <Link href="/guide#access" className="rd-get-guide">이용 범위 안내</Link>
            </aside>
          </div>
        </section>

        <section className="rd-x-more" aria-labelledby="exam-more-title">
          <div className="rd-wrap">
            <h2 id="exam-more-title" className="rd-x-h2">{row.school}의 다른 시험지</h2>
            {hasMore && <div className="rd-x-rows">
              {relatedExams.map(item => <Link key={item.id} href={`/exam/${item.id}`} className="rd-x-row">
                <span><b>{item.exam_year}년 {item.grade}학년 {item.semester}학기 {item.exam_type}</b><small>{item.subject || '수학'}</small></span>
                <ChevronRight size={22} aria-hidden="true" />
              </Link>)}
              {otherYears.map(year => <Link key={year.id} href={`/exam/${year.id}`} className="rd-x-row">
                <span><b>{year.exam_year}년 {row.grade ? `${row.grade}학년 ` : ''}{period} {row.exam_type}</b><small>같은 시험, 다른 연도</small></span>
                <ChevronRight size={22} aria-hidden="true" />
              </Link>)}
            </div>}
            <div className="rd-x-links">
              <Link href={schoolDestination(row.school)} className="rd-link">{row.school} 시험지 전체 보기</Link>
              {relatedReport && <Link href={`/insights/${relatedReport.slug}`} className="rd-link">{relatedReport.title} 출제 동향</Link>}
              <Link href="/schools" className="rd-link">전국 학교별 기출 보기</Link>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
