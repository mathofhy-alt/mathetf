'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export type ExamOpinion = { question_number: number; reason: string; comment: string; created_at: string };
type OwnOpinion = Pick<ExamOpinion, 'question_number' | 'reason' | 'comment'>;

const reasons = ['발상·조건 해석', '계산량', '개념 융합', '시간 부족'];

/**
 * 시험지 상세 오른쪽 '의견' 탭 내용(새 디자인). 목록 ↔ 작성 폼을 같은 자리에서 바꾼다.
 * [10/5] 의견은 문항마다 1개씩 여러 개. 포인트는 시험지당 첫 의견 1회(examRewarded), 하루 2개 시험지(todayCount).
 */
export default function ExamOpinions({ examId, questionCount, initialOpinions, writeRequest = 0, onCount }: {
    examId: string; questionCount: number; initialOpinions: ExamOpinion[]; writeRequest?: number; onCount?: (n: number) => void;
}) {
    const router = useRouter();
    const [opinions, setOpinions] = useState(initialOpinions);
    const [mine, setMine] = useState<OwnOpinion[]>([]);
    const [examRewarded, setExamRewarded] = useState(false);
    const [loggedIn, setLoggedIn] = useState(false);
    const [todayCount, setTodayCount] = useState(0);
    const [writing, setWriting] = useState(false);
    const [filter, setFilter] = useState<number | null>(null);
    const [number, setNumber] = useState(Math.min(21, questionCount));
    const [reason, setReason] = useState(reasons[0]);
    const [comment, setComment] = useState('');
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [saving, setSaving] = useState(false);

    const load = async () => {
        const response = await fetch(`/api/exam-opinions?examId=${encodeURIComponent(examId)}`, { cache: 'no-store' });
        if (!response.ok) return;
        const data = await response.json();
        setOpinions(data.opinions || []);
        setLoggedIn(Boolean(data.loggedIn));
        setTodayCount(data.todayCount || 0);
        setExamRewarded(Boolean(data.examRewarded));
        const list: OwnOpinion[] = Array.isArray(data.mine) ? data.mine : [];
        setMine(list);
        return list;
    };
    const editing = mine.find(item => item.question_number === number) || null;
    // 문항을 고르면: 내가 이미 쓴 문항이면 그 의견을 불러와 수정, 아니면 새로 쓰기(수정하던 글은 비운다)
    const selectNumber = (n: number, list: OwnOpinion[] = mine) => {
        const found = list.find(item => item.question_number === n);
        setNumber(n);
        setError('');
        if (found) { setReason(found.reason); setComment(found.comment); }
        else if (editing) { setReason(reasons[0]); setComment(''); }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { void load().then(list => { const found = list?.find(item => item.question_number === number); if (found) { setReason(found.reason); setComment(found.comment); } }); }, [examId]);
    useEffect(() => { onCount?.(opinions.length); }, [opinions.length, onCount]);
    useEffect(() => { if (writeRequest > 0) { setWriting(true); setNotice(''); } }, [writeRequest]);

    const topNumbers = useMemo(() => {
        const counts = new Map<number, number>();
        for (const opinion of opinions) counts.set(opinion.question_number, (counts.get(opinion.question_number) || 0) + 1);
        return [...counts].sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, 4);
    }, [opinions]);
    const shown = useMemo(() => [...opinions]
        .filter(o => filter === null || o.question_number === filter)
        .sort((a, b) => a.question_number - b.question_number || b.created_at.localeCompare(a.created_at)), [opinions, filter]);

    const rewardOpen = loggedIn && !examRewarded && todayCount < 2;
    const loginHref = `/login?next=${encodeURIComponent(`/exam/${examId}#question-difficulty`)}`;

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (saving) return;
        setSaving(true);
        setError('');
        setNotice('');
        try {
            const response = await fetch('/api/exam-opinions', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ examId, questionNumber: number, reason, comment }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || '의견을 저장하지 못했습니다.');
            setNotice(data.rewarded === 500 ? `${number}번 의견이 등록되고 500P가 적립되었습니다. 다른 문항 의견도 남길 수 있어요.`
                : data.isNew ? `${number}번 의견이 등록되었습니다.${data.examRewarded ? ' 포인트는 시험지당 1회 적립돼요.' : ' 오늘 적립 한도 2회를 채워 포인트는 적립되지 않았습니다.'}`
                : `${number}번 의견을 수정했습니다.`);
            await load();
            setWriting(false);
            router.refresh();
        } catch (cause: any) { setError(cause.message || '저장하지 못했습니다.'); }
        finally { setSaving(false); }
    };

    const writeButton = loggedIn
        ? <button type="button" className="rd-btn rd-btn-primary rd-btn-block" onClick={() => { setWriting(true); setNotice(''); }}>{rewardOpen ? '의견 남기기 +500P' : '의견 남기기'}</button>
        : <Link href={loginHref} className="rd-btn rd-btn-primary rd-btn-block">로그인하고 의견 남기기</Link>;

    if (writing && loggedIn) return <form id="opinion-form" className="rd-op-form" onSubmit={submit}>
        <h3>{editing ? `${number}번 의견 수정` : '어느 문항이 어려웠나요?'}</h3>
        {mine.length > 0 && <div className="rd-op-mine"><span>내 의견</span>{mine.map(item => <button key={item.question_number} type="button" aria-pressed={item.question_number === number} onClick={() => selectNumber(item.question_number)}>{item.question_number}번</button>)}</div>}
        <label htmlFor="opinion-number" className="rd-op-label">문항 번호</label>
        <select id="opinion-number" className="rd-op-select" value={number} onChange={e => selectNumber(Number(e.target.value))}>
            {Array.from({ length: questionCount }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n}번{mine.some(item => item.question_number === n) ? ' (내 의견)' : ''}</option>)}
        </select>
        <fieldset className="rd-op-fieldset">
            <legend className="rd-op-label">어려운 이유</legend>
            <div className="rd-op-reasons">{reasons.map(label => <button key={label} type="button" className="rd-op-reason" aria-pressed={reason === label} onClick={() => setReason(label)}>{label}</button>)}</div>
        </fieldset>
        <label htmlFor="opinion-comment" className="rd-op-label">의견 <small>15~400자</small></label>
        <textarea id="opinion-comment" className="rd-op-textarea" value={comment} onChange={e => setComment(e.target.value)} minLength={15} maxLength={400} rows={5} required placeholder="어디서 막혔는지, 무엇을 알아차려야 풀리는지 적어 주세요" />
        <p className="rd-op-count">{comment.length}/400</p>
        {error && <p role="alert" className="rd-op-error">{error}</p>}
        <button type="submit" disabled={saving} className="rd-btn rd-btn-primary rd-btn-block">{saving ? '저장하는 중' : editing ? `${number}번 의견 수정하기` : rewardOpen ? '등록하고 500P 받기' : '의견 등록하기'}</button>
        <button type="button" className="rd-btn rd-btn-ghost rd-btn-block" onClick={() => { setWriting(false); setError(''); }}>취소</button>
        <p className="rd-op-rule">{examRewarded ? '이 시험지는 500P 적립을 마쳤어요. 의견은 문항마다 더 남길 수 있습니다.' : `포인트는 시험지당 첫 의견에 한 번, 하루 2개 시험지까지 적립돼요. 오늘 ${todayCount}/2회.`}</p>
    </form>;

    return <div>
        {notice && <p role="status" className="rd-op-notice">{notice}</p>}
        {opinions.length === 0 ? <div className="rd-op-empty">
            <h3>아직 의견이 없어요</h3>
            <p>시험지를 보면서 어려웠던 문항과 이유를 남겨 주세요. 첫 의견에는 자료 결제에 쓰는 500P를 드려요.</p>
            <div className="rd-op-empty-btn">{writeButton}</div>
        </div> : <>
            <div className="rd-op-filter" aria-label="문항으로 거르기">
                <button type="button" className="rd-op-fbtn" aria-pressed={filter === null} onClick={() => setFilter(null)}>전체 {opinions.length}</button>
                {topNumbers.map(([n, c]) => <button key={n} type="button" className="rd-op-fbtn" aria-pressed={filter === n} onClick={() => setFilter(filter === n ? null : n)}>{n}번 {c}</button>)}
            </div>
            <div className="rd-op-list">
                {shown.map((opinion, index) => <article key={`${opinion.created_at}-${index}`} className="rd-op-card">
                    <div className="rd-op-card-top"><b>{opinion.question_number}번</b><span>{opinion.reason}</span></div>
                    <p>{opinion.comment}</p>
                </article>)}
            </div>
            <div className="rd-op-actions">{writeButton}</div>
        </>}
    </div>;
}
