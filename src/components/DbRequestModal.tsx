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
        <div className="rd rd-overlay"
            onClick={e => { if (e.target === e.currentTarget) close(); }}>
            <div role="dialog" aria-modal="true" aria-labelledby="db-request-title" className="rd-modal">
                <div className="rd-sheet-handle" />
                <div className="rd-modal-head">
                    <h2 id="db-request-title" className="rd-modal-title">개인DB 요청</h2>
                    <button type="button" aria-label="닫기" onClick={close} className="rd-modal-x"><X size={20} /></button>
                </div>

                {done ? (
                    <div style={{ padding: '32px 0 4px', textAlign: 'center' }}>
                        <CheckCircle2 size={48} style={{ margin: '0 auto', color: 'var(--rd-ink)' }} />
                        <p style={{ margin: '16px 0 0', fontSize: 18, fontWeight: 700, color: 'var(--rd-text)' }}>요청이 접수됐어요.</p>
                        <div className="rd-modal-actions" style={{ marginTop: 28 }}>
                            <button type="button" onClick={close} className="rd-btn rd-btn-primary rd-btn-block">확인</button>
                        </div>
                    </div>
                ) : (
                    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                        <div className="rd-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                            <div style={{ display: 'flex', gap: 12, padding: '14px 16px', borderRadius: 20, background: 'var(--rd-tint)' }}>
                                <Database size={20} style={{ color: 'var(--rd-ink)', flex: 'none', marginTop: 2 }} />
                                <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6, fontWeight: 600, color: 'var(--rd-text)' }}>개인DB로 만들고 싶은 자료 파일을 올려주세요.
                                    <span style={{ display: 'block', marginTop: 4, fontSize: 14, fontWeight: 400, color: 'var(--rd-sub)' }}>PDF, 한글(HWP), 사진, ZIP 파일을 파일당 50MB까지 올릴 수 있어요. 올린 파일은 운영자만 봅니다.</span></p>
                            </div>

                            <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                <button type="button" onClick={() => pickRef.current?.click()} className="rd-btn rd-btn-gray rd-btn-block" style={{ fontSize: 16 }}>
                                    <FileText size={18} style={{ color: 'var(--rd-ink)' }} /> 파일 고르기
                                </button>
                                <input ref={pickRef} type="file" accept={ACCEPT} multiple hidden onChange={e => { addFiles(e.target.files); e.target.value = ''; }} />
                                {files.length > 0 && (
                                    <ul style={{ listStyle: 'none', margin: 0, padding: '4px 0', borderRadius: 14, background: 'var(--rd-zone)' }}>
                                        {files.map((f, i) => (
                                            <li key={`${f.name}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 4px 2px 14px', fontSize: 15 }}>
                                                <FileText size={16} style={{ flex: 'none', color: 'var(--rd-icon)' }} />
                                                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--rd-text)' }}>{f.name}</span>
                                                <span style={{ flex: 'none', fontSize: 14, color: 'var(--rd-sub)', fontVariantNumeric: 'tabular-nums' }}>{mb(f.size)}</span>
                                                <button type="button" aria-label={`${f.name} 빼기`} onClick={() => setFiles(files.filter((_, j) => j !== i))}
                                                    style={{ flex: 'none', width: 44, height: 44, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: 0, background: 'none', color: 'var(--rd-nav)', cursor: 'pointer', borderRadius: 10 }}>
                                                    <Trash2 size={16} />
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </section>

                            <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--rd-text)' }}>남길 말 <span style={{ fontWeight: 400, color: 'var(--rd-sub)' }}>(선택)</span></h3>
                                <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: 'var(--rd-ink)' }}>교재 이름, 출판사, 판(연도)과 필요한 단원을 정확히 적어 주시면 더 빨리 DB로 만들어 드려요.</p>
                                <textarea value={note} onChange={e => setNote(e.target.value)} maxLength={300} rows={2} placeholder="예: 쎈 공통수학1 (좋은책신사고, 2025년판), 1~3단원"
                                    style={{ width: '100%', boxSizing: 'border-box', background: 'var(--rd-panel)', border: 0, borderRadius: 14, padding: '13px 14px', fontSize: 16, lineHeight: 1.6, color: 'var(--rd-text)', fontFamily: 'inherit', outline: 'none', resize: 'vertical' }} />
                            </section>

                            {error && <div role="alert" style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '12px 14px', borderRadius: 14, background: '#FDECEC', fontSize: 15, lineHeight: 1.5, color: '#C0392B' }}><AlertCircle size={16} style={{ flex: 'none', marginTop: 3 }} />{error}</div>}
                        </div>

                        <div className="rd-modal-foot">
                            <button type="button" onClick={close} disabled={!!busy} className="rd-btn rd-btn-gray">취소</button>
                            <button type="submit" disabled={!!busy} className="rd-btn rd-btn-primary" style={{ flex: '1 1 0' }}>
                                {busy || `요청하기${files.length ? ` (${files.length}개)` : ''}`}
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
}
