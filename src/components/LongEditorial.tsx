import type { SimilarExamSets } from '@/components/SimilarExams';

export interface LongEditorial {
    title: string;
    reviewedAt: string;
    summary: string[];
    sections: {
        heading: string;
        paragraphs?: string[];
        table?: { head: string[]; rows: string[][] };
        items?: { label: string; text: string }[];
        list?: string[];
    }[];
    faq: { q: string; a: string }[];
    scope: string;
    similar_exams?: SimilarExamSets;   // 올릴 때 붙인다(scripts/exam_long/upload.py)
}

// 시험지 장문 분석(10/22 대표: 내신판처럼 시험지 페이지마다, 맨 끝에 — 내신 이용자는 잘 안 읽고 검색용).
// 접지 않고 펼쳐 둔다(숨긴 글은 검색엔진이 덜 쳐준다).
export default function LongEditorialArticle({ editorial }: { editorial: LongEditorial }) {
    return <section className="rd-wrap rd-se" aria-labelledby="exam-long-title">
        <p className="rd-kicker">시험 분석 <span className="rd-x-date">{editorial.reviewedAt} 작성</span></p>
        <h2 id="exam-long-title" className="rd-x-h2">{editorial.title}</h2>
        <h3 className="rd-se-h3">핵심 요약</h3>
        <ul className="rd-x-sum">{editorial.summary.map(text => <li key={text}>{text}</li>)}</ul>
        {editorial.sections.map(sec => <div key={sec.heading} className="rd-se-sec">
            <h3 className="rd-se-h3">{sec.heading}</h3>
            {sec.paragraphs?.map(text => <p key={text} className="rd-se-p">{text}</p>)}
            {sec.table && <div className="rd-se-tablewrap"><table className="rd-se-table">
                <thead><tr>{sec.table.head.map(h => <th key={h} scope="col">{h}</th>)}</tr></thead>
                <tbody>{sec.table.rows.map(row => <tr key={row[0]}>{row.map((c, i) => i === 0 ? <th key={i} scope="row">{c}</th> : <td key={i}>{c}</td>)}</tr>)}</tbody>
            </table></div>}
            {sec.items && <div className="rd-se-items">{sec.items.map(it => <article key={it.label} className="rd-se-item">
                <h4>{it.label}</h4><p>{it.text}</p>
            </article>)}</div>}
            {sec.list && <ol className="rd-se-list">{sec.list.map(text => <li key={text}>{text}</li>)}</ol>}
        </div>)}
        <h3 className="rd-se-h3">자주 묻는 질문</h3>
        <dl className="rd-se-faq">{editorial.faq.map(f => <div key={f.q}><dt>{f.q}</dt><dd>{f.a}</dd></div>)}</dl>
        <p className="rd-x-note">{editorial.scope}</p>
    </section>;
}
