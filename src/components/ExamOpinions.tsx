'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export type ExamOpinion = { question_number: number; reason: string; comment: string; created_at: string };
type OwnOpinion = Pick<ExamOpinion, 'question_number' | 'reason' | 'comment'>;

const reasons = [
    { label: '발상·조건 해석', color: '#236B56' },
    { label: '계산량', color: '#C18B52' },
    { label: '개념 융합', color: '#5A8AA0' },
    { label: '시간 부족', color: '#89968D' },
];

export default function ExamOpinions({ examId, questionCount, initialOpinions, compactEmpty = false }: {
    examId: string; questionCount: number; initialOpinions: ExamOpinion[]; compactEmpty?: boolean;
}) {
    const router = useRouter();
    const [expanded, setExpanded] = useState(false);
    useEffect(() => { if (window.location.hash === '#opinion-form') setExpanded(true); }, []);
    const [opinions, setOpinions] = useState(initialOpinions);
    // [10/5] 의견은 문항마다 1개씩 여러 개. 포인트는 시험지당 첫 의견 1회(examRewarded), 하루 2개 시험지(todayCount).
    const [mine, setMine] = useState<OwnOpinion[]>([]);
    const [examRewarded, setExamRewarded] = useState(false);
    const [loggedIn, setLoggedIn] = useState(false);
    const [todayCount, setTodayCount] = useState(0);
    const [number, setNumber] = useState(Math.min(21, questionCount));
    const [reason, setReason] = useState(reasons[0].label);
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
        setNotice(''); setError('');
        if (found) { setReason(found.reason); setComment(found.comment); }
        else if (editing) { setReason(reasons[0].label); setComment(''); }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { void load().then(list => { const found = list?.find(item => item.question_number === number); if (found) { setReason(found.reason); setComment(found.comment); } }); }, [examId]);

    const summary = useMemo(() => {
        const reasonCounts = reasons.map(item => opinions.filter(opinion => opinion.reason === item.label).length);
        const numberCounts = new Map<number, number>();
        for (const opinion of opinions) numberCounts.set(opinion.question_number, (numberCounts.get(opinion.question_number) || 0) + 1);
        return { reasonCounts, topNumbers: [...numberCounts].sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, 5) };
    }, [opinions]);

    let offset = 0;
    const slices = reasons.map((item, index) => {
        const start = offset;
        offset += opinions.length ? summary.reasonCounts[index] / opinions.length * 100 : 0;
        return `${item.color} ${start}% ${offset}%`;
    });

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
                : data.isNew ? `${number}번 의견이 등록되었습니다.${data.examRewarded ? ' (포인트는 시험지당 1회 적립)' : ' (오늘 적립 한도 2회를 채워 포인트는 적립되지 않았습니다)'}`
                : `${number}번 의견을 수정했습니다.`);
            await load();
            router.refresh();
        } catch (cause: any) { setError(cause.message || '저장하지 못했습니다.'); }
        finally { setSaving(false); }
    };

    if (compactEmpty && opinions.length === 0 && !expanded) return <section id="question-difficulty" aria-label="이용자 분석" className="scroll-mt-24 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#DCE5EE] bg-white px-5 py-4 sm:px-6">
        <div><h2 className="text-base font-bold text-[#193740]">이용자 분석 <span className="ml-1 text-sm font-normal text-[#83918C]">0개</span></h2><p className="mt-1 text-sm leading-6 text-[#657873]">아직 등록된 의견이 없습니다. 어려웠던 문항과 이유를 남겨주세요.</p><p className="mt-2 text-sm font-semibold leading-6 text-[#365B55]">의견을 남기면 자료 결제 시 사용할 수 있는 500P를 드립니다.</p><p className="mt-1 text-xs leading-5 text-[#71847B]">시험지당 첫 작성 1회 적립 · 하루 최대 2회, 총 1,000P</p></div>
        <button type="button" onClick={() => setExpanded(true)} aria-expanded={false} className="shrink-0 rounded-xl border border-[#CDDBD2] px-4 py-2.5 text-sm font-bold text-[#365B55] hover:bg-[#F0F5F3]">첫 의견 남기기 →</button>
    </section>;

    return <section id="question-difficulty" className={compactEmpty ? "scroll-mt-24 rounded-2xl border border-[#DBE4E0] bg-white p-5 sm:p-7" : "scroll-mt-24 border-t border-[#DBE4E0] pt-10 sm:pt-14"}>
        {compactEmpty && opinions.length === 0 && <button type="button" aria-expanded={true} onClick={() => setExpanded(false)} className="mb-4 block ml-auto text-xs font-semibold text-[#657873] underline underline-offset-4">의견 작성 접기</button>}
        <div className="grid gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-14">
            <div>
                <p className="text-xs font-extrabold tracking-[0.15em] text-[#A07446]">이 시험의 이용자 분석</p>
                <h2 className="mt-3 text-2xl font-black tracking-tight text-[#193740] sm:text-3xl">어느 문항이 어려웠나요?</h2>
                <p className="mt-3 max-w-md text-sm leading-7 text-[#657873]">직접 풀어본 사람이 꼽은 문항과 이유를 모았습니다. 의견이 쌓일수록 이 시험만의 분석이 완성됩니다.</p>
                {opinions.length > 0 ? <>
                    <div className="mt-6 flex items-center gap-6 rounded-2xl border border-[#D7E3DE] bg-white p-5">
                        <div className="h-28 w-28 shrink-0 rounded-full" role="img" aria-label="어려웠던 이유의 비율" style={{ background: `conic-gradient(${slices.join(', ')})` }} />
                        <div className="space-y-2 text-xs text-[#46635A]">
                            <p className="font-extrabold">의견 {opinions.length}개</p>
                            {reasons.map((item, index) => <p key={item.label} className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />{item.label} {summary.reasonCounts[index]}개</p>)}
                        </div>
                    </div>
                    <p className="mt-4 text-sm font-bold text-[#365B55]">많이 꼽힌 문항 {summary.topNumbers.map(([n, count]) => <span key={n} className="ml-2 inline-block rounded-full bg-[#E6F0EB] px-3 py-1 text-xs text-[#1F6D55]">{n}번 · {count}명</span>)}</p>
                    <div className="mt-5 space-y-3">{opinions.slice(0, 5).map((opinion, index) => <article key={`${opinion.created_at}-${index}`} className="rounded-2xl border border-[#D7E3DE] bg-white p-4"><p className="text-xs font-bold text-[#607872]">{opinion.question_number}번 · {opinion.reason}</p><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-[#334E53]">{opinion.comment}</p></article>)}</div>
                </> : <div className="mt-7 rounded-2xl border border-dashed border-[#CBD9D2] bg-white/70 px-5 py-7"><strong className="block text-sm text-[#365B55]">아직 등록된 의견이 없습니다</strong><p className="mt-1 text-xs leading-6 text-[#7B8B84]">첫 의견부터 실제 분석에 반영됩니다.</p><a href="#opinion-form" className="mt-3 inline-block text-xs font-bold text-[#176C56] underline underline-offset-2">첫 의견 남기기 →</a></div>}
            </div>

            <div id="opinion-form" className="scroll-mt-24 rounded-[28px] border border-[#D7E2DB] bg-white p-5 shadow-[0_18px_50px_rgba(25,55,64,0.06)] sm:p-7">
                <div className="border-b border-[#E9EFEB] pb-5"><h3 className="text-lg font-black text-[#193740]">{editing ? `${number}번 의견 수정` : '내 의견 남기기'}</h3><p className="mt-2 text-sm font-semibold leading-6 text-[#365B55]">의견을 남기면 자료 결제 시 사용할 수 있는 500P를 드립니다.</p><p className="mt-1 text-xs leading-5 text-[#71847B]">의견은 문항마다 남길 수 있어요 · 적립은 시험지당 첫 의견 1회, 하루 최대 2개 시험지(총 1,000P)</p>{loggedIn && <p className="mt-1 text-xs font-bold text-[#3B725C]">{examRewarded ? '이 시험지는 500P 적립 완료' : `오늘 적립 ${todayCount}/2회`}</p>}
                    {loggedIn && mine.length > 0 && <div className="mt-3 flex flex-wrap items-center gap-1.5"><span className="text-xs font-bold text-[#3F5956]">내 의견 {mine.length}개</span>{mine.map(item => <button key={item.question_number} type="button" onClick={() => selectNumber(item.question_number)} aria-pressed={item.question_number === number} className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${item.question_number === number ? 'border-[#176C56] bg-[#E6F0EB] text-[#176C56]' : 'border-[#CDDBD2] text-[#536C64] hover:bg-[#F0F5F3]'}`}>{item.question_number}번</button>)}{editing && <button type="button" onClick={() => { const next = Array.from({ length: questionCount }, (_, i) => i + 1).find(n => !mine.some(item => item.question_number === n)); if (next) selectNumber(next); }} className="ml-1 text-xs font-semibold text-[#176C56] underline underline-offset-2">+ 다른 문항 쓰기</button>}</div>}</div>
                {loggedIn ? <form onSubmit={submit}>
                    <div className="mt-5 grid gap-4 sm:grid-cols-[140px_1fr]"><div><label htmlFor="opinion-number" className="block text-xs font-bold text-[#3F5956]">어려웠던 문항</label><select id="opinion-number" value={number} onChange={e => selectNumber(Number(e.target.value))} className="mt-2 h-11 w-full rounded-xl border border-[#CDDBD2] bg-white px-3 text-sm">{Array.from({ length: questionCount }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n}번{mine.some(item => item.question_number === n) ? ' (내 의견)' : ''}</option>)}</select></div><fieldset><legend className="text-xs font-bold text-[#3F5956]">어려웠던 이유</legend><div className="mt-2 flex flex-wrap gap-2">{reasons.map(item => <button key={item.label} type="button" aria-pressed={reason === item.label} onClick={() => setReason(item.label)} className={`rounded-full border px-3 py-2 text-xs font-semibold ${reason === item.label ? 'border-[#176C56] bg-[#176C56] text-white' : 'border-[#CDDBD2] text-[#536C64]'}`}>{item.label}</button>)}</div></fieldset></div>
                    <label htmlFor="opinion-comment" className="mt-5 block text-xs font-bold text-[#3F5956]">어떤 점이 어려웠나요?</label><textarea id="opinion-comment" value={comment} onChange={e => setComment(e.target.value)} minLength={15} maxLength={400} rows={4} required placeholder="문항 번호를 고르고, 막혔던 이유를 적어 주세요." className="mt-2 w-full resize-y rounded-xl border border-[#CDDBD2] p-3 text-sm leading-6 outline-none focus:border-[#176C56]" />
                    <p className="mt-1 text-right text-[11px] text-[#88978E]">{comment.length}/400</p>
                    {error && <p role="alert" className="mt-2 text-xs font-semibold text-red-600">{error}</p>}{notice && <p role="status" className="mt-2 text-xs font-semibold text-[#176C56]">{notice}</p>}
                    <button type="submit" disabled={saving} className="mt-4 rounded-xl bg-[#193740] px-5 py-3 text-sm font-extrabold text-white disabled:opacity-50">{saving ? '저장 중…' : editing ? `${number}번 의견 수정하기` : '의견 남기기'} →</button>
                </form> : <div className="pt-5"><p className="text-sm leading-6 text-[#657873]">의견 작성과 포인트 적립은 로그인 후 이용할 수 있습니다.</p><Link href={`/login?next=${encodeURIComponent(`/exam/${examId}#question-difficulty`)}`} className="mt-4 inline-block rounded-xl bg-[#193740] px-5 py-3 text-sm font-extrabold text-white">로그인하고 의견 남기기 →</Link></div>}
            </div>
        </div>
    </section>;
}
