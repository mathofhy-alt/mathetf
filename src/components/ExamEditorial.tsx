import type { ExamEditorial } from '@/lib/exam-editorials';

// 손으로 쓴 시험 분석(새 디자인). 시험지 상세 왼쪽 열, 미리보기 아래에 놓인다.
export default function ExamEditorialArticle({ editorial }: { editorial: ExamEditorial }) {
    return <section className="rd-x-analysis" aria-labelledby="exam-analysis-title">
        <p className="rd-kicker">시험 분석 <span className="rd-x-date">{editorial.reviewedAt} 작성</span></p>
        <h2 id="exam-analysis-title" className="rd-x-h2">{editorial.title}</h2>
        {editorial.summary.length > 0 && <ul className="rd-x-sum">{editorial.summary.map(text => <li key={text}>{text}</li>)}</ul>}
        <p className="rd-x-intro">{editorial.introduction}</p>
        <div className="rd-x-box">
            <div className="rd-x-qs">{editorial.questions.map(question => <article key={question.number} className="rd-x-q">
                <span className="rd-x-qno">{question.number}번</span>
                <div><h3>{question.title}</h3>{question.paragraphs.map(text => <p key={text}>{text}</p>)}</div>
            </article>)}</div>
        </div>
        <h3 className="rd-x-sub">다음 시험을 위한 연습</h3>
        {editorial.preparation.map(text => <p key={text} className="rd-x-intro">{text}</p>)}
        <p className="rd-x-note">{editorial.scope}</p>
        <a href="#exam-preview" className="rd-link rd-x-up">원본 문제와 함께 다시 보기</a>
    </section>;
}
