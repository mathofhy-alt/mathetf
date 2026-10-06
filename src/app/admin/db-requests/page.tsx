'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { FileDown, Trash2, RefreshCw, User as UserIcon, Calendar } from 'lucide-react';

/**
 * 관리자 — 개인DB 요청 목록 (2026-10-06). 회원이 '개인DB 요청' 버튼으로 올린 파일.
 * 목록·상태·삭제는 /api/admin/db-requests(관리자 확인), 파일 받기는 저장소에서 blob 으로(관리자 세션).
 */
const STATUSES = ['접수', '처리중', '완료', '반려'] as const;
const mb = (n?: number | null) => !n ? '' : n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)}MB` : `${Math.max(1, Math.round(n / 1024))}KB`;

export default function DbRequestsAdmin() {
    const supabase = useMemo(() => createClient(), []);
    const [rows, setRows] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const load = async () => {
        setLoading(true); setError('');
        try {
            const r = await fetch('/api/admin/db-requests', { cache: 'no-store' });
            const j = await r.json(); if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
            setRows(j.requests || []);
        } catch (e: any) { setError(e.message || '불러오지 못했습니다.'); }
        setLoading(false);
    };
    useEffect(() => { void load(); }, []);

    const download = async (path: string, name: string) => {
        const { data, error: e } = await supabase.storage.from('exam-materials').download(path);
        if (e || !data) { alert('파일을 받지 못했습니다: ' + (e?.message || '')); return; }
        const url = URL.createObjectURL(data);
        const a = document.createElement('a'); a.href = url; a.download = name.replace(/[\\/:*?"<>|]/g, '_');
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
    };
    const downloadAll = async (row: any) => {
        for (const f of row.files || []) { await download(f.path, f.name || f.path.split('/').pop()); await new Promise(r => setTimeout(r, 400)); }
    };
    const setStatus = async (id: string, status: string) => {
        const r = await fetch('/api/admin/db-requests', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status }) });
        if (!r.ok) { alert('상태를 바꾸지 못했습니다.'); return; }
        setRows(prev => prev.map(x => x.id === id ? { ...x, status } : x));
    };
    // [10/6] 운영자 안내문 — 회원 마이페이지 '내 요청' 탭에 그대로 보인다.
    const [drafts, setDrafts] = useState<Record<string, string>>({});
    const [savingId, setSavingId] = useState<string | null>(null);
    const saveReply = async (row: any) => {
        const text = drafts[row.id] ?? row.admin_reply ?? '';
        setSavingId(row.id);
        const r = await fetch('/api/admin/db-requests', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: row.id, admin_reply: text }) });
        const j = await r.json().catch(() => ({}));
        setSavingId(null);
        if (!r.ok) { alert('안내문을 저장하지 못했습니다: ' + (j.error || r.status)); return; }
        setRows(prev => prev.map(x => x.id === row.id ? { ...x, ...j.row } : x));
        setDrafts(prev => { const n = { ...prev }; delete n[row.id]; return n; });
    };
    const remove = async (row: any) => {
        if (!confirm('이 요청과 올린 파일을 모두 삭제할까요? (복구 불가)')) return;
        const r = await fetch('/api/admin/db-requests', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: row.id }) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) { alert('삭제하지 못했습니다: ' + (j.error || r.status)); return; }
        setRows(prev => prev.filter(x => x.id !== row.id));
    };

    return (
        <div className="max-w-[1200px] mx-auto px-4 py-8">
            <div className="mb-6 flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-black text-slate-800 tracking-tight">개인DB 요청</h1>
                    <p className="text-sm text-slate-500 mt-1">회원이 개인DB로 만들어 달라고 올린 자료입니다.</p>
                </div>
                <button onClick={load} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-brand-600 px-3 py-2 rounded-lg border border-slate-200"><RefreshCw size={14} /> 새로고침</button>
            </div>
            <div className="bg-white rounded-lg border border-slate-200 shadow-sm divide-y divide-slate-100">
                {loading ? <div className="p-16 text-center text-slate-400 font-bold">불러오는 중…</div>
                    : error ? <div className="p-16 text-center text-rose-600 font-bold">{error}</div>
                    : rows.length === 0 ? <div className="p-16 text-center text-slate-500">요청이 없습니다.</div>
                    : rows.map(row => (
                        <div key={row.id} className="p-4 flex items-start gap-4">
                            <div className="flex-1 min-w-0 space-y-1">
                                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                                    <span className="flex items-center gap-1"><Calendar size={12} />{new Date(row.created_at).toLocaleString('ko-KR')}</span>
                                    <span className="flex items-center gap-1"><UserIcon size={12} /><b className="text-slate-700">{row.user_name || '이름 없음'}</b> {row.user_email}</span>
                                </div>
                                <ul className="text-sm text-slate-800 space-y-0.5">
                                    {(row.files || []).map((f: any) => (
                                        <li key={f.path}><button type="button" onClick={() => download(f.path, f.name || f.path.split('/').pop())} className="text-left text-brand-700 hover:underline">{f.name}</button> <span className="text-xs text-slate-400">{mb(f.size)}</span></li>
                                    ))}
                                </ul>
                                {row.note && <div className="text-xs text-slate-600 bg-slate-50 rounded px-2 py-1">💬 {row.note}</div>}
                                <div className="pt-2">
                                    <label className="block text-xs font-bold text-slate-600 mb-1">회원에게 보낼 안내 <span className="font-normal text-slate-400">— 마이페이지 &gt; 내 요청에 보입니다</span></label>
                                    <textarea
                                        value={drafts[row.id] ?? row.admin_reply ?? ''}
                                        onChange={e => setDrafts(prev => ({ ...prev, [row.id]: e.target.value }))}
                                        rows={3} maxLength={2000}
                                        placeholder="예) 올려주신 자료는 이미 수학ETF에 있는 모의고사 문항이라 바로 쓰실 수 있습니다…"
                                        className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-brand-400"
                                    />
                                    <div className="flex items-center justify-between mt-1">
                                        <span className="text-xs text-slate-400">{row.replied_at ? `저장됨 · ${new Date(row.replied_at).toLocaleString('ko-KR')}` : '아직 안내 없음'}</span>
                                        <button
                                            onClick={() => saveReply(row)}
                                            disabled={savingId === row.id || drafts[row.id] === undefined}
                                            className="text-xs font-bold px-3 py-1.5 rounded-lg bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-40"
                                        >
                                            {savingId === row.id ? '저장 중…' : '안내 저장'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                <select value={row.status} onChange={e => setStatus(row.id, e.target.value)} aria-label="처리 상태" className="text-xs font-bold border border-slate-200 rounded-lg px-2 py-2 bg-white">
                                    {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                                <button onClick={() => downloadAll(row)} title={`전체 받기 (${(row.files || []).length}개)`} className="p-2 bg-brand-50 text-brand-600 hover:bg-brand-600 hover:text-white rounded-lg"><FileDown size={16} /></button>
                                <button onClick={() => remove(row)} title="요청 삭제" className="p-2 bg-rose-50 text-rose-500 hover:bg-rose-500 hover:text-white rounded-lg"><Trash2 size={16} /></button>
                            </div>
                        </div>
                    ))}
            </div>
        </div>
    );
}
