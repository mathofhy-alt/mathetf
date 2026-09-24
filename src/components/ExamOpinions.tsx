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

export default function ExamOpinions({ examId, questionCount, initialOpinions }: {
    examId: string; questionCount: number; initialOpinions: ExamOpinion[];
}) {
    const router = useRouter();
    const [opinions, setOpinions] = useState(initialOpinions);
    const [mine, setMine] = useState<OwnOpinion | null>(null);
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
        setMine(data.mine || null);
        if (data.mine) {
            setNumber(data.mine.question_number);
            setReason(data.mine.reason);
            setComment(data.mine.comment);
        }
    };
    useEffect(() => { void load(); }, [examId]);

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
            setNotice(data.rewarded === 500 ? '의견이 등록되고 500P가 적립되었습니다.' : '의견을 수정했습니다. 추가 포인트는 적립되지 않습니다.');
            await load();
            router.refresh();
        } catch (cause: any) { setError(cause.message || '저장하지 못했습니다.'); }
        finally { setSaving(false); }
    };

    return <section id="question-difficulty" className="scroll-mt-24 border-t border-[#DBE4E0] pt-10 sm:pt-14">
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
                </> : <div className="mt-7 rounded-2xl border border-dashed border-[#CBD9D2] bg-white/70 px-5 py-7"><strong className="block text-sm text-[#365B55]">아직 등록된 의견이 없습니다</strong><p className="mt-1 text-xs leading-6 text-[#7B8B84]">첫 의견부터 실제 분석에 반영됩니다.</p></div>}
            </div>

            <div className="rounded-[28px] border border-[#D7E2DB] bg-white p-5 shadow-[0_18px_50px_rgba(25,55,64,0.06)] sm:p-7">
                <div className="border-b border-[#E9EFEB] pb-5"><h3 className="text-lg font-black text-[#193740]">{mine ? '내 의견 수정' : '내 의견 남기기'}</h3><p className="mt-1 text-xs leading-5 text-[#71847B]">첫 작성에 500P · 시험지당 1회 · 하루 최대 2회(1,000P)</p>{loggedIn && <p className="mt-1 text-xs font-bold text-[#3B725C]">오늘 {todayCount}/2회 작성</p>}</div>
                {loggedIn ? <form onSubmit={submit}>
                    <div className="mt-5 grid gap-4 sm:grid-cols-[140px_1fr]"><div><label htmlFor="opinion-number" className="block text-xs font-bold text-[#3F5956]">어려웠던 문항</label><select id="opinion-number" value={number} onChange={e => setNumber(Number(e.target.value))} className="mt-2 h-11 w-full rounded-xl border border-[#CDDBD2] bg-white px-3 text-sm">{Array.from({ length: questionCount }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n}번</option>)}</select></div><fieldset><legend className="text-xs font-bold text-[#3F5956]">어려웠던 이유</legend><div className="mt-2 flex flex-wrap gap-2">{reasons.map(item => <button key={item.label} type="button" aria-pressed={reason === item.label} onClick={() => setReason(item.label)} className={`rounded-full border px-3 py-2 text-xs font-semibold ${reason === item.label ? 'border-[#176C56] bg-[#176C56] text-white' : 'border-[#CDDBD2] text-[#536C64]'}`}>{item.label}</button>)}</div></fieldset></div>
                    <label htmlFor="opinion-comment" className="mt-5 block text-xs font-bold text-[#3F5956]">어떤 점이 어려웠나요?</label><textarea id="opinion-comment" value={comment} onChange={e => setComment(e.target.value)} minLength={15} maxLength={400} rows={4} required placeholder="문항 번호를 고르고, 막혔던 이유를 적어 주세요." className="mt-2 w-full resize-y rounded-xl border border-[#CDDBD2] p-3 text-sm leading-6 outline-none focus:border-[#176C56]" />
                    <p className="mt-1 text-right text-[11px] text-[#88978E]">{comment.length}/400</p>
                    {error && <p role="alert" className="mt-2 text-xs font-semibold text-red-600">{error}</p>}{notice && <p role="status" className="mt-2 text-xs font-semibold text-[#176C56]">{notice}</p>}
                    <button type="submit" disabled={saving || (!mine && todayCount >= 2)} className="mt-4 rounded-xl bg-[#193740] px-5 py-3 text-sm font-extrabold text-white disabled:opacity-50">{saving ? '저장 중…' : mine ? '의견 수정하기' : '의견 남기기'} →</button>
                </form> : <div className="pt-5"><p className="text-sm leading-6 text-[#657873]">의견 작성과 포인트 적립은 로그인 후 이용할 수 있습니다.</p><Link href={`/login?next=${encodeURIComponent(`/exam/${examId}#question-difficulty`)}`} className="mt-4 inline-block rounded-xl bg-[#193740] px-5 py-3 text-sm font-extrabold text-white">로그인하고 의견 남기기 →</Link></div>}
            </div>
        </div>
    </section>;
}
