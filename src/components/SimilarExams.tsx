import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

export type SimilarExam = { exam_id: string; label: string; pairs: [number, number][] };
export type SimilarExamSets = { hard_similar: SimilarExam[]; method_similar: SimilarExam[] };

// [10/23 대표] 분석글보다 위 — 학생·강사가 바로 써먹는 연습 시험지 추천.
//   A: 이 시험의 고난도 문항과 '추천' 기준으로 닮은 문항이 나온 시험지
//   B: 이 시험 전체 문항과 '풀이 유사' 기준으로 닮은(같은 방법으로 풀리는) 문항이 나온 시험지
//   계산: scripts/exam_long/similar_exams.py (같은 학교 제외, A·B 중복 없음)
function Rows({ items }: { items: SimilarExam[] }) {
    return <div className="rd-x-rows">
        {items.map(x => <Link key={x.exam_id} href={`/exam/${x.exam_id}`} className="rd-x-row">
            <span>
                <b>{x.label}</b>
                <small>{x.pairs.map(p => `${p[0]}번↔${p[1]}번`).join(' · ')}</small>
            </span>
            <ChevronRight size={22} aria-hidden="true" />
        </Link>)}
    </div>;
}

export default function SimilarExams({ sets }: { sets: SimilarExamSets }) {
    const a = sets.hard_similar || [], b = sets.method_similar || [];
    if (!a.length && !b.length) return null;
    return <section className="rd-x-more rd-sx" aria-labelledby="similar-exams-title">
        <div className="rd-wrap">
            <h2 id="similar-exams-title" className="rd-x-h2">비슷한 문제가 나온<br />다른 학교 시험지</h2>
            <div className="rd-sx-grid">
                {a.length > 0 && <div>
                    <h3 className="rd-sx-h3">고난도 문항과 닮은 문제가 나온 시험지 Top {a.length}</h3>
                    <p className="rd-sx-sub">이 시험의 분석상 고난도 문항과 비슷한 문항이 많이 나온 순서예요. 「이 시험 번호↔그 시험 번호」로 짝을 보여 드려요.</p>
                    <Rows items={a} />
                </div>}
                {b.length > 0 && <div>
                    <h3 className="rd-sx-h3">같은 풀이법이 통하는 시험지 Top {b.length}</h3>
                    <p className="rd-sx-sub">문제 모양은 달라도 같은 방법으로 풀리는 문항이 많이 나온 순서예요.</p>
                    <Rows items={b} />
                </div>}
            </div>
        </div>
    </section>;
}
