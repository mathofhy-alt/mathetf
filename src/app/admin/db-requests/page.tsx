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

/** 연결 요청 — 문항을 나눠 숨기느라 202(남은 수)가 오면 0 이 될 때까지 다시 부른다(10/7) */
async function postLink(body: Record<string, unknown>, onProgress: (remaining: number) => void) {
    for (let i = 0; i < 200; i++) {
        const r = await fetch('/api/admin/db-requests', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const j = await r.json().catch(() => ({}));
        if (r.status === 202 && j.inProgress) { onProgress(j.remaining); continue; }
        return { r, j };
    }
    throw new Error('너무 오래 걸립니다. 다시 눌러 주세요(이어서 진행됩니다).');
}

export default function DbRequestsAdmin() {
    const supabase = useMemo(() => createClient(), []);
    const [rows, setRows] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    // [10/7] 요청 없이 회원 이메일로 바로 연결한 교재(전용 개인DB)
    const [direct, setDirect] = useState<any[]>([]);
    const [dForm, setDForm] = useState({ source: '', title: '', email: '', price: '0' });
    const [dSaving, setDSaving] = useState(false);
    const [progress, setProgress] = useState('');

    const load = async () => {
        setLoading(true); setError('');
        try {
            const r = await fetch('/api/admin/db-requests', { cache: 'no-store' });
            const j = await r.json(); if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
            setRows(j.requests || []); setDirect(j.direct || []);
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
    // [10/6] 회원 전용 개인DB 연결 — 등록한 문항 묶음(source_db_id)을 이 회원만 결제·이용하게 한다
    const [linkForm, setLinkForm] = useState<Record<string, { source: string; title: string; price: string }>>({});
    const formOf = (row: any) => linkForm[row.id] ?? { source: row.private_db?.source_db_id ?? '', title: row.private_db?.title ?? '', price: row.private_db ? String(row.private_db.price) : '' };
    const link = async (row: any) => {
        const f = formOf(row);
        if (!confirm(`'${f.source}' 문항 묶음을 ${row.user_email} 님 전용 개인DB(${Number(f.price).toLocaleString()}원)로 연결할까요?

그 묶음의 문항은 다른 회원의 검색·유사문항·예상문제 등 모든 기능에서 빠집니다.`)) return;
        setSavingId(row.id);
        const { r, j } = await postLink({ action: 'link', id: row.id, source_db_id: f.source, title: f.title, price: Number(f.price) }, n => setProgress(`문항 숨기는 중… ${n.toLocaleString()}개 남음`))
            .catch(e => ({ r: { ok: false, status: 0 } as Response, j: { error: e.message } }));
        setSavingId(null); setProgress('');
        if (!r.ok) { alert('연결하지 못했습니다: ' + (j.error || r.status)); return; }
        alert(`연결했습니다. 문항 ${j.questions}개를 이 회원 전용으로 바꿨습니다.`);
        setRows(prev => prev.map(x => x.id === row.id ? { ...x, private_db: { ...j.privateDb, paid_at: x.private_db?.paid_at ?? null } } : x));
        setLinkForm(prev => { const n = { ...prev }; delete n[row.id]; return n; });
    };
    const linkDirect = async () => {
        const f = dForm;
        if (!confirm(`'${f.source}' 교재를 ${f.email} 님 전용 개인DB(${Number(f.price).toLocaleString()}원)로 연결할까요?

교재 이름으로 넣으면 그 아래 단원·스텝 묶음이 전부 포함됩니다. 그 문항은 연결한 회원 말고는 아무에게도 안 보입니다.`)) return;
        setDSaving(true);
        const { r, j } = await postLink({ action: 'link', email: f.email, source_db_id: f.source, title: f.title, price: Number(f.price) }, n => setProgress(`문항 숨기는 중… ${n.toLocaleString()}개 남음`))
            .catch(e => ({ r: { ok: false, status: 0 } as Response, j: { error: e.message } }));
        setDSaving(false); setProgress('');
        if (!r.ok) { alert('연결하지 못했습니다: ' + (j.error || r.status)); return; }
        alert(`연결했습니다. 문항 ${j.questions}개가 이 회원 전용입니다.`);
        setDForm(p => ({ ...p, email: '' }));
        void load();
    };
    const unlink = async (d: any) => {
        if (!confirm(`${d.owner_email || '이 회원'} 님의 '${d.title}' 연결을 끊을까요?

그 회원의 출제 자료에서 바로 사라집니다(문항은 그대로, 다른 회원에게도 안 보임).`)) return;
        const r = await fetch('/api/admin/db-requests', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'unlink', privateDbId: d.id }) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) { alert('끊지 못했습니다: ' + (j.error || r.status)); return; }
        setDirect(prev => prev.filter(x => x.id !== d.id));
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
            <section className="mb-6 bg-white rounded-lg border border-slate-200 shadow-sm p-4">
                <h2 className="text-base font-black text-slate-800">회원에게 교재 바로 연결</h2>
                <p className="text-xs text-slate-500 mt-1">요청 없이, 고른 회원에게만 교재(전용 개인DB)를 엽니다. 교재 이름(예: 쎈 공통수학1)을 넣으면 그 아래 단원·스텝이 전부 들어갑니다. 가격 0원이면 결제 없이 바로 보입니다.</p>
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-[1.2fr_1.2fr_1.4fr_0.6fr_auto] gap-2">
                    <input value={dForm.source} onChange={e => setDForm(p => ({ ...p, source: e.target.value, title: p.title === p.source ? e.target.value : p.title }))} placeholder="교재 이름 (source_db_id 맨 앞)" className="text-sm border border-slate-200 rounded-lg px-3 py-2" />
                    <input value={dForm.title} onChange={e => setDForm(p => ({ ...p, title: e.target.value }))} placeholder="회원에게 보일 이름" className="text-sm border border-slate-200 rounded-lg px-3 py-2" />
                    <input value={dForm.email} onChange={e => setDForm(p => ({ ...p, email: e.target.value }))} placeholder="회원 이메일" type="email" className="text-sm border border-slate-200 rounded-lg px-3 py-2" />
                    <input value={dForm.price} onChange={e => setDForm(p => ({ ...p, price: e.target.value.replace(/[^0-9]/g, '') }))} placeholder="가격" inputMode="numeric" className="text-sm border border-slate-200 rounded-lg px-3 py-2" />
                    <button onClick={linkDirect} disabled={dSaving || !dForm.source || !dForm.title || !dForm.email || dForm.price === ''} className="text-sm font-bold px-4 py-2 rounded-lg bg-slate-800 text-white hover:bg-slate-900 disabled:opacity-40">연결</button>
                </div>
                {progress && <p className="mt-2 text-sm font-bold text-brand-600" role="status">{progress} (창을 닫지 마세요 — 처음 연결하는 교재는 몇 분 걸립니다)</p>}
                {direct.length > 0 && <ul className="mt-4 divide-y divide-slate-100 border-t border-slate-100">
                    {direct.map(d => <li key={d.id} className="py-2 flex items-center gap-3 text-sm">
                        <span className="font-bold text-slate-800">{d.title}</span>
                        <span className="text-slate-400 text-xs">{d.source_db_id}</span>
                        <span className="text-slate-600">{d.owner_email || d.owner_user_id}</span>
                        <span className="text-slate-500 text-xs">{d.price ? `${Number(d.price).toLocaleString()}원 · ${d.paid_at ? '결제함' : '결제 전'}` : '무료'}</span>
                        <button onClick={() => unlink(d)} className="ml-auto text-xs font-bold px-3 py-1.5 rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50">연결 끊기</button>
                    </li>)}
                </ul>}
            </section>
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
                                <div className="pt-3 mt-2 border-t border-dashed border-slate-200">
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="text-xs font-bold text-slate-600">회원 전용 개인DB 연결</span>
                                        {row.private_db && (row.private_db.paid_at
                                            ? <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">결제 완료 · {new Date(row.private_db.paid_at).toLocaleDateString('ko-KR')}</span>
                                            : <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">결제 대기 · {Number(row.private_db.price).toLocaleString()}원</span>)}
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-[1.4fr_1.4fr_0.8fr_auto] gap-2">
                                        <input value={formOf(row).source} onChange={e => setLinkForm(p => ({ ...p, [row.id]: { ...formOf(row), source: e.target.value } }))} placeholder="문항 묶음 (source_db_id)" className="text-xs border border-slate-200 rounded-lg px-2 py-2" />
                                        <input value={formOf(row).title} onChange={e => setLinkForm(p => ({ ...p, [row.id]: { ...formOf(row), title: e.target.value } }))} placeholder="회원에게 보일 이름 (예: 쎈 공통수학1)" className="text-xs border border-slate-200 rounded-lg px-2 py-2" />
                                        <input value={formOf(row).price} onChange={e => setLinkForm(p => ({ ...p, [row.id]: { ...formOf(row), price: e.target.value.replace(/[^0-9]/g, '') } }))} placeholder="가격(원)" inputMode="numeric" className="text-xs border border-slate-200 rounded-lg px-2 py-2" />
                                        <button onClick={() => link(row)} disabled={savingId === row.id || !formOf(row).source || !formOf(row).title || formOf(row).price === ''} className="text-xs font-bold px-3 py-2 rounded-lg bg-slate-800 text-white hover:bg-slate-900 disabled:opacity-40">{row.private_db ? '수정' : '연결'}</button>
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
