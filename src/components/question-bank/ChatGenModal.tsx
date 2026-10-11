'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, Send, X } from 'lucide-react';
import { questionBankLoginUrl } from '@/lib/auth-return';
import { BuddyAvatar, type BuddyMood } from './QbBuddy';

/**
 * 시험지출제 'AI로 만들기' (2026-10-11) — 말로 요청하면 문항을 골라 시험지에 담는다.
 * "삼차함수 비율 30문항, 쉬운 것부터 어려운 것까지" → /api/pro/chat-generate → /api/questions/by-ids → onApply.
 * 이어서 "더 어렵게"·"10개만"이라고 하면 이 창이 직전에 담은 문항을 빼고 새로 담는다(직접 고른 문항은 그대로).
 */
type Msg = { role: 'user' | 'assistant'; content: string };

const EXAMPLES = [
    '삼차함수 비율 관련 30문항, 쉬운 것부터 어려운 것까지 전부',
    '수열 귀납적 정의 어려운 문제 15개',
    '공통수학1 나머지정리 쉬운 문제 20개',
];

export default function ChatGenModal({ open = true, onMood, onClose, onApply, selectedDbIds, scopeLabel, cartIds, excludedQuestionIds, includeOffCurriculum, maxCart }: {
    open?: boolean;             // 닫아도 대화를 남기려고 숨기기만 한다
    onMood?: (m: BuddyMood) => void;   // 캐릭터 표정 — 고르는 중 / 다 담음
    onClose: () => void;
    /** 새 문항을 담는다. replaceIds = 이 창이 직전에 담았던 문항(빼고 담는다). 실제로 담긴 수를 돌려준다 */
    onApply: (questions: any[], replaceIds: string[]) => number;
    selectedDbIds: string[];
    scopeLabel: string;         // '전체 출제자료' · '출제자료 N개'
    cartIds: string[];
    excludedQuestionIds: string[];
    includeOffCurriculum: boolean;
    maxCart: number;
}) {
    const [msgs, setMsgs] = useState<Msg[]>([]);
    const [input, setInput] = useState('');
    const [busy, setBusy] = useState(false);
    const [authNeeded, setAuthNeeded] = useState(false);
    const [mood, setMoodState] = useState<BuddyMood>('idle');
    const moodTimer = useRef<number | null>(null);
    const setMood = (m: BuddyMood) => {
        if (moodTimer.current) clearTimeout(moodTimer.current);
        setMoodState(m); onMood?.(m);
        if (m === 'done') moodTimer.current = window.setTimeout(() => { setMoodState('idle'); onMood?.('idle'); }, 3000);
    };
    const lastPlan = useRef<any>(null);
    const placed = useRef<string[]>([]);       // 이 창이 담은 문항 — 다음 요청 때 바꿔 끼운다
    const reqRef = useRef<AbortController | null>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => () => reqRef.current?.abort(), []);
    useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);
    useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' }); }, [msgs, busy]);

    const send = async (text: string) => {
        const t = text.trim();
        if (!t || busy) return;
        const history = [...msgs, { role: 'user' as const, content: t }];
        setMsgs(history); setInput(''); setBusy(true); setMood('busy');
        reqRef.current?.abort();
        const ctrl = new AbortController(); reqRef.current = ctrl;
        try {
            const keep = cartIds.filter(id => !placed.current.includes(id));   // 직접 고른 문항
            const res = await fetch('/api/pro/chat-generate', {
                method: 'POST', signal: ctrl.signal, headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: history, lastPlan: lastPlan.current, selectedDbs: selectedDbIds,
                    excludedQuestionIds: [...excludedQuestionIds, ...keep], includeOffCurriculum,
                    maxCount: Math.max(1, maxCart - keep.length),
                }),
            });
            if (res.status === 401) { setAuthNeeded(true); setMood('idle'); setMsgs(m => [...m, { role: 'assistant', content: '로그인하면 바로 만들어 드릴게요.' }]); return; }
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || '시험지를 만들지 못했어요.');
            if (data.plan) lastPlan.current = data.plan;
            const ids: string[] = (data.questions || []).map((q: any) => q.id);
            if (ids.length) {
                const detail = await fetch('/api/questions/by-ids', { method: 'POST', signal: ctrl.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }) });
                const loaded = await detail.json().catch(() => ({}));
                if (!detail.ok || !Array.isArray(loaded.data)) throw new Error('문항을 불러오지 못했어요. 다시 해 주세요.');
                const byId = new Map(loaded.data.map((q: any) => [q.id, q]));
                const ordered = ids.map(id => byId.get(id)).filter(Boolean);
                const added = onApply(ordered, placed.current);
                placed.current = ordered.slice(0, added).map((q: any) => q.id);
            }
            setMsgs(m => [...m, { role: 'assistant', content: data.reply }]);
            setMood(ids.length ? 'done' : 'idle');
        } catch (e) {
            if (ctrl.signal.aborted) return;
            setMsgs(m => [...m, { role: 'assistant', content: e instanceof Error ? e.message : '시험지를 만들지 못했어요.' }]);
            setMood('idle');
        } finally {
            if (reqRef.current === ctrl) reqRef.current = null;
            setBusy(false);
            inputRef.current?.focus();
        }
    };

    // [10/11] 가운데 모달 → 오른쪽 아래 캐릭터(QbBuddy) 위에 붙는 대화창. 뒤 화면을 가리지 않아 담기는 걸 보며 이어서 말할 수 있다
    return (
        <div role="dialog" aria-modal="false" aria-label="AI 시험지 도우미" className={`rd qbb-panel${open ? '' : ' is-hidden'}`} hidden={!open}>
            <div className="qbb-head">
                <BuddyAvatar size={44} mood={mood} />
                <div style={{ minWidth: 0, flex: 1 }}>
                    <h3>AI 시험지 도우미</h3>
                    <p>말로 적으면 문항을 골라 바로 담아요 · {scopeLabel}</p>
                </div>
                <button aria-label="닫기" onClick={onClose} className="qbb-x"><X size={20} /></button>
            </div>

            <div className="qbb-list" ref={listRef}>
                <div className="qbb-row">
                    <BuddyAvatar size={32} />
                    <div className="rd-chatgen-msg is-assistant">안녕하세요! 만들고 싶은 시험지를 말로 알려 주세요. 단원·주제·문항 수·난이도를 적으면 골라서 바로 담아 드려요.</div>
                </div>
                {msgs.length === 0 && (
                    <div className="rd-chatgen-empty">
                        {EXAMPLES.map(ex => <button key={ex} type="button" className="rd-chip-opt" onClick={() => send(ex)}>{ex}</button>)}
                        <p className="rd-help" style={{ margin: '6px 0 0' }}>담은 뒤 "더 어렵게", "10개만", "모자라면 채워 줘"처럼 이어서 고칠 수 있어요.</p>
                    </div>
                )}
                {msgs.map((m, i) => m.role === 'assistant'
                    ? <div key={i} className="qbb-row"><BuddyAvatar size={32} /><div className="rd-chatgen-msg is-assistant">{m.content}</div></div>
                    : <div key={i} className="rd-chatgen-msg is-user">{m.content}</div>)}
                {busy && <div className="qbb-row" role="status"><BuddyAvatar size={32} mood="busy" /><div className="rd-chatgen-msg is-assistant"><Loader2 size={16} className="animate-spin" /> 문항을 고르고 있어요…</div></div>}
                {authNeeded && <a className="rd-chatgen-login" href={questionBankLoginUrl()}>로그인하고 계속하기</a>}
            </div>

            {placed.current.length > 0 && !busy && (
                <button type="button" className="qbb-done" onClick={onClose}>담은 문항 {placed.current.length}개 보기</button>
            )}
            <form className="rd-chatgen-form" onSubmit={(e) => { e.preventDefault(); send(input); }}>
                <textarea ref={inputRef} className="rd-input" rows={2} value={input} maxLength={500}
                    placeholder="예: 미적분I 정적분으로 정의된 함수 어려운 문제 10개"
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(input); } }} />
                <button type="submit" className="rd-btn rd-btn-primary" disabled={busy || !input.trim()} aria-label="보내기"><Send size={18} /></button>
            </form>
        </div>
    );
}
