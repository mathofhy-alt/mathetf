'use client';

import { useMemo, useRef, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { X, FileText, Trash2, AlertCircle, CheckCircle2, Database } from 'lucide-react';

/**
 * 개인DB 요청 (2026-10-06) — 회원이 개인DB로 만들고 싶은 자료 파일을 운영자에게 보낸다(/api/db-request).
 * 안내는 일부러 짧게 둔다(사용자 지시). 처리·결제는 운영자가 따로 한다.
 */
const ACCEPT = '.pdf,.hwp,.hwpx,.zip,image/*';
const mb = (n: number) => n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)}MB` : `${Math.max(1, Math.round(n / 1024))}KB`;

export default function DbRequestModal({ open, onClose }: { open: boolean; onClose: () => void }) {
    const supabase = useMemo(() => createClient(), []);
    const [files, setFiles] = useState<File[]>([]);
    const [note, setNote] = useState('');
    const [busy, setBusy] = useState('');
    const [error, setError] = useState('');
    const [done, setDone] = useState(false);
    const pickRef = useRef<HTMLInputElement>(null);
    if (!open) return null;

    const addFiles = (list: FileList | null) => {
        if (!list) return;
        setError('');
        setFiles(prev => [...prev, ...Array.from(list)].slice(0, 20));
    };

    const submit = async (e: React.FormEvent) => {
        e.preventDefault(); setError('');
        if (!files.length) return setError('개인DB로 만들고 싶은 파일을 올려주세요.');
        try {
            setBusy('업로드 준비 중…');
            const s = await fetch('/api/db-request', { method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'sign', files: files.map(f => ({ name: f.name, size: f.size })) }) });
            const sj = await s.json(); if (!s.ok) throw new Error(sj.error || '업로드 준비에 실패했습니다.');
            for (let i = 0; i < files.length; i++) {
                setBusy(`파일 올리는 중… ${i + 1} / ${files.length}`);
                const { path, token } = sj.uploads[i];
                const { error: upErr } = await supabase.storage.from('exam-materials').uploadToSignedUrl(path, token, files[i], { contentType: files[i].type || 'application/octet-stream' });
                if (upErr) throw new Error(`${files[i].name} 파일을 올리지 못했습니다. 다시 시도해주세요.`);
            }
            setBusy('요청 보내는 중…');
            const r = await fetch('/api/db-request', { method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'submit', paths: sj.uploads.map((u: any) => u.path), names: files.map(f => f.name), note }) });
            const rj = await r.json(); if (!r.ok) throw new Error(rj.error || '요청을 저장하지 못했습니다.');
            setDone(true);
        } catch (err: any) {
            setError(err?.message || '요청 중 문제가 생겼습니다. 잠시 후 다시 시도해주세요.');
        } finally { setBusy(''); }
    };

    const close = () => { if (!busy) { onClose(); if (done) { setDone(false); setFiles([]); setNote(''); } } };

    return (
        <div role="dialog" aria-modal="true" aria-label="개인DB 요청" className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center bg-black/50"
            onClick={e => { if (e.target === e.currentTarget) close(); }}>
            <div className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl max-h-[92dvh] overflow-y-auto shadow-2xl">
                <div className="sm:hidden flex justify-center pt-3"><div className="w-10 h-1 rounded-full bg-slate-300" /></div>
                <div className="flex items-center justify-between px-5 sm:px-6 pt-4 pb-3 border-b border-slate-100">
                    <h2 className="text-lg font-bold text-slate-900">개인DB 요청</h2>
                    <button type="button" aria-label="닫기" onClick={close} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"><X size={22} /></button>
                </div>

                {done ? (
                    <div className="px-6 py-12 text-center">
                        <CheckCircle2 size={48} className="mx-auto text-emerald-500" />
                        <p className="mt-4 text-lg font-bold text-slate-900">요청이 접수됐어요.</p>
                        <button type="button" onClick={close} className="mt-8 w-full sm:w-auto px-8 py-3 rounded-xl bg-brand-600 text-white font-bold hover:bg-brand-700">확인</button>
                    </div>
                ) : (
                    <form onSubmit={submit} className="px-5 sm:px-6 py-5 space-y-5">
                        <div className="rounded-xl bg-brand-50 border border-brand-100 p-4 flex gap-3">
                            <Database size={20} className="text-brand-600 shrink-0 mt-0.5" />
                            <p className="text-sm leading-6 text-slate-700">개인DB로 만들고 싶은 자료 파일을 올려주세요.
                                <span className="block text-xs text-slate-500 mt-1">PDF·한글(HWP)·사진·ZIP · 파일당 50MB까지 · 올린 파일은 운영자만 봅니다.</span></p>
                        </div>

                        <section className="space-y-3">
                            <button type="button" onClick={() => pickRef.current?.click()} className="w-full flex items-center justify-center gap-2 py-4 rounded-xl border-2 border-dashed border-brand-200 text-brand-700 font-bold text-sm hover:bg-brand-50">
                                <FileText size={18} /> 파일 고르기
                            </button>
                            <input ref={pickRef} type="file" accept={ACCEPT} multiple hidden onChange={e => { addFiles(e.target.files); e.target.value = ''; }} />
                            {files.length > 0 && (
                                <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                                    {files.map((f, i) => (
                                        <li key={`${f.name}-${i}`} className="flex items-center gap-2 px-3 py-2 text-sm">
                                            <FileText size={16} className="shrink-0 text-slate-400" />
                                            <span className="flex-1 min-w-0 truncate text-slate-700">{f.name}</span>
                                            <span className="shrink-0 text-xs text-slate-400 tabular-nums">{mb(f.size)}</span>
                                            <button type="button" aria-label={`${f.name} 빼기`} onClick={() => setFiles(files.filter((_, j) => j !== i))} className="shrink-0 p-1 text-slate-400 hover:text-rose-600"><Trash2 size={14} /></button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </section>

                        <section className="space-y-2">
                            <h3 className="text-sm font-bold text-slate-900">남길 말 <span className="font-normal text-slate-400">(선택)</span></h3>
                            <p className="text-xs leading-5 text-brand-700 break-keep">교재 이름·출판사·판(연도)과 필요한 단원을 정확히 적어 주시면 더 빨리 DB로 만들어 드려요.</p>
                            <textarea value={note} onChange={e => setNote(e.target.value)} maxLength={300} rows={2} placeholder="예: 쎈 공통수학1 (좋은책신사고, 2025년판) · 1~3단원" className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 outline-none" />
                        </section>

                        {error && <div role="alert" className="flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2.5 text-sm text-rose-700"><AlertCircle size={16} className="shrink-0 mt-0.5" />{error}</div>}

                        <div className="flex gap-2 pt-1" style={{ paddingBottom: 'max(0.25rem, env(safe-area-inset-bottom))' }}>
                            <button type="button" onClick={close} disabled={!!busy} className="px-5 py-3 rounded-xl text-sm font-bold text-slate-500 hover:bg-slate-50">취소</button>
                            <button type="submit" disabled={!!busy} className="flex-1 py-3 rounded-xl bg-brand-600 text-white text-sm font-bold hover:bg-brand-700 disabled:opacity-60">
                                {busy || `요청하기${files.length ? ` · ${files.length}개` : ''}`}
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
}
