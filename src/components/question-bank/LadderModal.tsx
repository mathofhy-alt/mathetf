'use client';

import { useEffect, useMemo, useState } from 'react';
import { X, Loader2, RefreshCw } from 'lucide-react';
import QuestionRenderer from '@/components/QuestionRenderer';

/**
 * 수업 사다리 창 (10/7). 목표 문항 하나 → 기초·유형·목표 순서로 미리 보고, 단계별 개수를 고르고,
 * 마음에 안 드는 문항은 '다른 문항'으로 바꾼 뒤 한 번에 담는다.
 * 예전엔 버튼을 누르면 단계마다 1문항씩 바로 장바구니에 들어가, 보지도 바꾸지도 못했다(사용자 지적).
 * 고르는 규칙은 /api/pro/ladder 주석 참고.
 */
type Item = { id: string; difficulty: number; reasons: string[] };
type Step = { label: string; picks: Item[]; alternates: Item[] };

const STEP_NOTE: Record<string, string> = {
    '기초': '같은 개념을 쉽게 익히는 문항',
    '유형': '목표와 비슷한 모양으로 한 단계 올린 문항',
    '목표': '수업에서 풀 목표 문항',
};

export default function LadderModal({ target, cartIds, onClose, onAdd }: {
    target: any; cartIds: Set<string>; onClose: () => void; onAdd: (qs: any[], summary: string) => void;
}) {
    const [perStep, setPerStep] = useState(2);
    const [steps, setSteps] = useState<Step[] | null>(null);
    const [error, setError] = useState('');
    const [detail, setDetail] = useState<Map<string, any>>(new Map());

    useEffect(() => {
        let alive = true;
        setSteps(null); setError('');
        (async () => {
            try {
                const r = await fetch('/api/pro/ladder', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: target.id, perStep, exclude: Array.from(cartIds).filter(x => x !== target.id) }),
                });
                const j = await r.json();
                if (!r.ok || !j.success) throw new Error(j.error || '사다리를 만들지 못했습니다.');
                const got: Step[] = j.steps || [];
                if (got.length <= 1) throw new Error(j.reason || '이 문항은 아래 단계 문항을 찾지 못했습니다.');
                // 고른 문항 + 교체 후보의 내용(그림 포함)을 한 번에
                const ids = Array.from(new Set(got.flatMap(s => [...s.picks, ...s.alternates].map(x => x.id)).filter(x => x !== target.id)));
                const d = await fetch('/api/questions/by-ids', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }) }).then(x => x.json());
                if (!alive) return;
                setDetail(new Map([[target.id, target], ...((d?.data || []) as any[]).map(q => [q.id, q] as [string, any])]));
                setSteps(got);
            } catch (e: any) { if (alive) setError(e?.message || '사다리를 만들지 못했습니다.'); }
        })();
        return () => { alive = false; };
    }, [target, perStep]);   // eslint-disable-line react-hooks/exhaustive-deps

    // 한 문항을 그 단계의 다음 후보로 바꾼다. 빠진 문항은 후보 맨 뒤로 — 계속 누르면 돌아간다.
    const swap = (si: number, pi: number) => setSteps(prev => {
        if (!prev) return prev;
        const s = prev[si];
        const next = s.alternates.find(a => detail.has(a.id));
        if (!next) return prev;
        const picks = s.picks.slice(); const out = picks[pi]; picks[pi] = next;
        const alternates = [...s.alternates.filter(a => a.id !== next.id), out];
        return prev.map((x, i) => i === si ? { ...x, picks, alternates } : x);
    });

    const ordered = useMemo(() => (steps || []).flatMap(s => s.picks.map(p => detail.get(p.id)).filter(Boolean)), [steps, detail]);
    const fresh = ordered.filter(q => !cartIds.has(q.id));
    const range = (s: Step) => { const ds = s.picks.map(p => p.difficulty); return ds.length ? (Math.min(...ds) === Math.max(...ds) ? `Lv.${ds[0]}` : `Lv.${Math.min(...ds)}~${Math.max(...ds)}`) : ''; };

    return (
        <div role="dialog" aria-modal="true" aria-labelledby="ladder-title" className="rd rd-overlay" onWheel={e => e.stopPropagation()} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="rd-modal rd-modal-flush rd-ladder" style={{ maxWidth: 1080 }}>
                <div className="rd-sheet-handle" />
                <div className="rd-modal-band rd-modal-head">
                    <div style={{ minWidth: 0 }}>
                        <h2 id="ladder-title" className="rd-modal-title">수업 사다리</h2>
                        <p className="rd-modal-sub">쉬운 문항부터 목표 문항까지 올라가는 순서예요. 마음에 안 드는 문항은 바꿔서 담으세요.</p>
                    </div>
                    <button aria-label="사다리 닫기" className="rd-modal-x" onClick={onClose}><X size={20} /></button>
                </div>
                <div className="rd-ladder-bar">
                    <span>단계별 문항 수</span>
                    <div className="rd-seg rd-seg-inline" role="group" aria-label="단계별 문항 수">
                        {[1, 2, 3].map(n => <button key={n} type="button" aria-pressed={perStep === n} onClick={() => setPerStep(n)}>{n}개</button>)}
                    </div>
                </div>
                <div data-modal-scroll className="rd-ladder-body">
                    {error ? <p className="rd-ladder-msg">{error}</p>
                        : !steps ? <p className="rd-ladder-msg"><Loader2 size={18} className="animate-spin" /> 단원 전체에서 사다리를 찾는 중…</p>
                        : steps.map((s, si) => (
                            <section key={s.label} className={`rd-ladder-step ${s.label === '목표' ? 'is-goal' : ''}`}>
                                <header>
                                    <b><span className="rd-ladder-no">{si + 1}</span>{s.label}</b>
                                    <small>{STEP_NOTE[s.label] || ''} · {range(s)}</small>
                                </header>
                                <div className="rd-ladder-items">
                                    {s.picks.map((p, pi) => {
                                        const q = detail.get(p.id);
                                        return <div key={p.id} className="rd-ladder-item">
                                            <div className="rd-ladder-meta">
                                                <span>{q?.school ? `${String(q.school).replace(/고등학교$/, '고')} ${q.year || ''}` : ''} {q?.question_number ? `${q.question_number}번` : ''}</span>
                                                {p.reasons.map(r => <em key={r}>{r}</em>)}
                                                {cartIds.has(p.id) && <em className="is-in">이미 담음</em>}
                                            </div>
                                            <div className="rd-qview">{q ? <QuestionRenderer xmlContent={q.content_xml} externalImages={q.question_images} displayMode="question" showDownloadAction={false} className="border-none shadow-none p-0" /> : <p className="rd-ladder-msg">불러오는 중…</p>}</div>
                                            {s.label !== '목표' && <button type="button" className="rd-btn rd-btn-gray rd-ladder-swap" onClick={() => swap(si, pi)} disabled={!s.alternates.some(a => detail.has(a.id))}>
                                                <RefreshCw size={14} aria-hidden="true" /> 다른 문항으로
                                            </button>}
                                        </div>;
                                    })}
                                </div>
                            </section>
                        ))}
                </div>
                <div className="rd-modal-band-foot">
                    <span className="rd-ladder-sum">{steps ? `${steps.map(s => `${s.label} ${s.picks.length}`).join(' → ')}` : ''}</span>
                    <button type="button" className="rd-btn rd-btn-primary" disabled={!steps || fresh.length === 0}
                        onClick={() => onAdd(fresh, steps!.map(s => `${s.label} ${s.picks.length}`).join(' → '))}>
                        {fresh.length ? `${fresh.length}문항 순서대로 담기` : '모두 담겨 있어요'}
                    </button>
                </div>
            </div>
        </div>
    );
}
