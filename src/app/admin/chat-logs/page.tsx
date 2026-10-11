'use client';

import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, ChevronDown, ChevronRight, AlertTriangle } from 'lucide-react';

/**
 * 관리자 — AI 시험지 도우미 대화 (2026-10-12). 회원이 챗봇에 쓴 말·챗봇 답·담은 문항·걸린 시간.
 * 데이터는 /api/admin/chat-logs (qb_chat_logs, 서버 전용 표).
 */
const BY: Record<string, string> = { keyword: '본문 키워드', concept: '개념 태그', similarity: '발문 유사도', unit: '단원 전체', ask: '되물음' };
const byLabel = (b?: string | null) => !b ? '' : b.split('+').map(x => BY[x] || x).join(' + ');
const fmt = (s: string) => new Date(s).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });

export default function ChatLogsAdmin() {
    const [rows, setRows] = useState<any[]>([]);
    const [summary, setSummary] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [more, setMore] = useState(true);
    const [q, setQ] = useState('');
    const [errorsOnly, setErrorsOnly] = useState(false);
    const [open, setOpen] = useState<Record<number, any[] | 'loading'>>({});
    const [err, setErr] = useState('');

    const load = useCallback(async (before?: number) => {
        setLoading(true); setErr('');
        const sp = new URLSearchParams();
        if (before) sp.set('before', String(before));
        if (q.trim()) sp.set('q', q.trim());
        if (errorsOnly) sp.set('errors', '1');
        const r = await fetch(`/api/admin/chat-logs?${sp}`);
        const j = await r.json().catch(() => ({}));
        setLoading(false);
        if (!r.ok) { setErr(j.error || `불러오지 못했습니다 (${r.status})`); return; }
        setRows(prev => before ? [...prev, ...j.rows] : j.rows);
        if (j.summary) setSummary(j.summary);
        setMore(j.rows.length === 100);
    }, [q, errorsOnly]);

    useEffect(() => { void load(); }, [errorsOnly]); // eslint-disable-line react-hooks/exhaustive-deps

    const toggle = async (id: number) => {
        if (open[id]) { setOpen(o => { const n = { ...o }; delete n[id]; return n; }); return; }
        setOpen(o => ({ ...o, [id]: 'loading' }));
        const j = await fetch(`/api/admin/chat-logs?id=${id}`).then(r => r.json()).catch(() => ({ questions: [] }));
        setOpen(o => ({ ...o, [id]: j.questions || [] }));
    };

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-lg font-bold text-slate-800">AI 시험지 도우미 대화</h2>
                {summary && <span className="text-sm text-slate-500">오늘 {summary.count}건 · {summary.users}명 · 평균 {(summary.avgMs / 1000).toFixed(1)}초{summary.errors ? ` · 오류 ${summary.errors}건` : ''}</span>}
                <div className="ml-auto flex items-center gap-2">
                    <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void load(); }}
                        placeholder="요청·답 검색" className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm w-48" />
                    <label className="text-sm text-slate-600 flex items-center gap-1"><input type="checkbox" checked={errorsOnly} onChange={e => setErrorsOnly(e.target.checked)} /> 오류만</label>
                    <button onClick={() => void load()} className="p-2 rounded-lg hover:bg-slate-100" aria-label="새로고침"><RefreshCw size={16} /></button>
                </div>
            </div>
            {err && <p className="text-sm text-red-600">{err}</p>}

            <div className="bg-white rounded-lg border border-slate-200 divide-y divide-slate-100">
                {!loading && !rows.length && <p className="p-10 text-center text-slate-400">아직 대화가 없습니다.</p>}
                {rows.map(r => {
                    const p = r.plan || {}, ms = p._ms;
                    const qs = open[r.id];
                    return (
                        <div key={r.id} className="p-4">
                            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                                <span>{fmt(r.created_at)}</span>
                                <span className="font-semibold text-slate-700">{r.email || r.user_id?.slice(0, 8)}</span>
                                {r.by && <span className="px-1.5 py-0.5 rounded bg-slate-100">{byLabel(r.by)}</span>}
                                <span>{r.n}문항{p.count ? ` / 요청 ${p.count}` : ''}</span>
                                <span>{((r.ms || 0) / 1000).toFixed(1)}초{ms ? ` (준비 ${(ms.prep / 1000).toFixed(1)} · DB ${(ms.db / 1000).toFixed(1)} · AI ${(ms.ai / 1000).toFixed(1)})` : ''}</span>
                                {r.error && <span className="text-red-600 flex items-center gap-1"><AlertTriangle size={12} /> 오류</span>}
                            </div>
                            {Array.isArray(r.history) && r.history.length > 0 && (
                                <div className="mt-2 pl-3 border-l-2 border-slate-100 space-y-1">
                                    {r.history.map((h: any, i: number) => <p key={i} className="text-xs text-slate-400">{h.role === 'user' ? '회원' : '챗봇'}: {h.content}</p>)}
                                </div>
                            )}
                            <p className="mt-2 text-sm text-slate-900"><span className="font-bold text-[#497AB7]">회원</span> {r.request}</p>
                            <p className="mt-1 text-sm text-slate-700"><span className="font-bold text-[#1B7E7A]">챗봇</span> {r.error ? <span className="text-red-600">{r.error}</span> : r.reply}</p>
                            {(p.targets?.length || p.concepts?.length || p.keywords?.length) ? (
                                <p className="mt-1 text-xs text-slate-400">
                                    {p.targets?.length ? `단원 ${p.targets.join(', ')}` : '단원 전체'}
                                    {p.concepts?.length ? ` · 태그 ${p.concepts.join(' ')}` : ''}
                                    {p.keywords?.length ? ` · 키워드 ${p.keywords.join(', ')}` : ''}
                                    {p.minDifficulty ? ` · 난이도 ${p.minDifficulty}~${p.maxDifficulty}` : ''}
                                </p>
                            ) : null}
                            {r.n > 0 && (
                                <button onClick={() => void toggle(r.id)} className="mt-2 text-xs font-semibold text-slate-500 flex items-center gap-1 hover:text-slate-800">
                                    {qs ? <ChevronDown size={14} /> : <ChevronRight size={14} />} 담은 문항 {r.n}개 보기
                                </button>
                            )}
                            {qs === 'loading' && <p className="mt-1 text-xs text-slate-400">불러오는 중…</p>}
                            {Array.isArray(qs) && (
                                <ol className="mt-1 ml-5 list-decimal text-xs text-slate-600 space-y-0.5">
                                    {qs.map((x: any) => <li key={x.id}>{x.school} {x.year} {x.grade} {x.semester} {x.question_number}번 · {x.subject} {x.unit} · 난이도 {x.difficulty} · {(x.key_concepts || []).slice(0, 2).join(' ')}</li>)}
                                </ol>
                            )}
                        </div>
                    );
                })}
            </div>
            {more && rows.length > 0 && (
                <button disabled={loading} onClick={() => void load(rows[rows.length - 1].id)} className="w-full py-2 text-sm font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50">
                    {loading ? '불러오는 중…' : '더 보기'}
                </button>
            )}
            {loading && !rows.length && <p className="text-center text-slate-400 py-10">불러오는 중…</p>}
        </div>
    );
}
