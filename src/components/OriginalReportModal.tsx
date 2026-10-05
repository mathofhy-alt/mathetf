'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, Camera, FileText, Trash2, CheckCircle2, AlertCircle, ShieldCheck, Gift } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import { CURRICULA } from '@/lib/curriculum';
import { REPORT_REWARD_LABEL, REPORT_MIN_YEAR } from '@/lib/report-reward';

/**
 * 회원 원본 시험지 제보 창 (2026-10-05).
 * 예전 자료등록 창의 '원본 시험지 제보' 탭을 회원용으로 따로 뺐다. PDF·HWP 판매 등록 탭은 회원에게 없다.
 * - 학교는 NEIS 전국 고등학교 명단(2,408곳)에서 검색해 고른다(10/5 사용자 결정 — 직접 입력은 오타 위험).
 *   이름 같은 학교가 101곳이라 시·구를 같이 보여 주고 학교 코드로 넘긴다.
 * - 사진 여러 장 + 휴대폰 카메라 바로 촬영. 서명된 주소로 저장소에 바로 올리고, 저장은 /api/original-report 가 한다.
 */

const ACCEPT = 'image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf';
const MAX_FILES = 30;

type Picked = { file: File; url: string | null; key: string };

export default function OriginalReportModal({ open, onClose, initialCode }: { open: boolean; onClose: () => void; initialCode?: string }) {
    const supabase = useMemo(() => createClient(), []);
    const thisYear = new Date().getFullYear();
    type School = { name: string; region: string; district: string; code: string };
    const [school, setSchool] = useState<School | null>(null);
    const [query, setQuery] = useState('');
    const [listOpen, setListOpen] = useState(false);
    const [year, setYear] = useState(thisYear);
    const [grade, setGrade] = useState(1);
    const [semester, setSemester] = useState(new Date().getMonth() >= 7 ? 2 : 1);
    const [examType, setExamType] = useState(new Date().getMonth() % 6 < 4 ? '중간고사' : '기말고사');
    const [subject, setSubject] = useState('');
    const [note, setNote] = useState('');
    const [files, setFiles] = useState<Picked[]>([]);
    const [schools, setSchools] = useState<School[]>([]);
    // 고른 학교에 이미 있는 회차 / 접수된 제보 — '연도-학년-학기-시험-과목'
    const [taken, setTaken] = useState<{ owned: Set<string>; pending: Set<string> } | null>(null);
    const [busy, setBusy] = useState<string>('');
    const [error, setError] = useState('');
    const [done, setDone] = useState(false);
    const cameraRef = useRef<HTMLInputElement>(null);
    const pickRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!open || schools.length) return;
        fetch('/api/original-report').then(r => r.json()).then(j => setSchools(j.schools || [])).catch(() => { });
    }, [open, schools.length]);
    useEffect(() => () => files.forEach(f => f.url && URL.revokeObjectURL(f.url)), [files]);
    // 학교 페이지의 '이 학교 시험지 제보' 로 열리면 그 학교를 미리 고른다
    useEffect(() => { if (initialCode && !school && schools.length) { const hit = schools.find(x => x.code === initialCode); if (hit) setSchool(hit); } // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialCode, schools]);
    useEffect(() => {
        setTaken(null); if (!school) return;
        let alive = true;
        fetch(`/api/original-report?code=${school.code}`).then(r => r.json())
            .then(j => { if (alive) setTaken({ owned: new Set(j.owned || []), pending: new Set(j.pending || []) }); }).catch(() => { });
        return () => { alive = false; };
    }, [school]);
    const keyFor = (subj: string) => `${year}-${grade}-${semester}-${examType}-${subj}`;
    const stateOf = (subj: string) => !taken || !subj ? '' : taken.owned.has(keyFor(subj)) ? 'owned' : taken.pending.has(keyFor(subj)) ? 'pending' : '';
    const blocked = stateOf(subject);
    // 시험 조건을 바꿔서 고른 과목이 막힌 회차가 되면 과목 선택을 비운다
    useEffect(() => { if (subject && stateOf(subject)) setSubject(''); // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [year, grade, semester, examType, taken]);
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
        window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
    }, [open, busy, onClose]);

    if (!open) return null;

    const addFiles = (list: FileList | null) => {
        if (!list) return;
        setError('');
        const next = [...files];
        for (const f of Array.from(list)) {
            if (next.length >= MAX_FILES) { setError(`사진은 ${MAX_FILES}장까지 올릴 수 있어요.`); break; }
            const isImg = f.type.startsWith('image/') && !/heic|heif/.test(f.type);
            next.push({ file: f, url: isImg ? URL.createObjectURL(f) : null, key: `${f.name}_${f.size}_${f.lastModified}_${Math.random()}` });
        }
        setFiles(next);
    };
    const removeFile = (key: string) => setFiles(files.filter(f => { if (f.key === key && f.url) URL.revokeObjectURL(f.url); return f.key !== key; }));

    const submit = async (e: React.FormEvent) => {
        e.preventDefault(); setError('');
        if (!school) return setError('학교를 목록에서 골라주세요.');
        if (!subject) return setError('과목을 골라주세요.');
        if (!files.length) return setError('시험지 사진이나 PDF를 올려주세요.');
        try {
            setBusy('업로드 준비 중…');
            const s = await fetch('/api/original-report', { method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'sign', files: files.map(f => ({ name: f.file.name, type: f.file.type || 'image/jpeg', size: f.file.size })) }) });
            const sj = await s.json(); if (!s.ok) throw new Error(sj.error || '업로드 준비에 실패했습니다.');
            for (let i = 0; i < files.length; i++) {
                setBusy(`사진 올리는 중… ${i + 1} / ${files.length}`);
                const { path, token } = sj.uploads[i];
                const { error: upErr } = await supabase.storage.from('exam-materials').uploadToSignedUrl(path, token, files[i].file, { contentType: files[i].file.type || 'image/jpeg' });
                if (upErr) throw new Error(`${i + 1}번째 사진을 올리지 못했습니다. 다시 시도해주세요.`);
            }
            setBusy('제보 접수 중…');
            const r = await fetch('/api/original-report', { method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'submit', paths: sj.uploads.map((u: any) => u.path), meta: { code: school.code, year, grade, semester, examType, subject, note } }) });
            const rj = await r.json(); if (!r.ok) throw new Error(rj.error || '제보를 저장하지 못했습니다.');
            setDone(true);
        } catch (err: any) {
            setError(err?.message || '제보 중 문제가 생겼습니다. 잠시 후 다시 시도해주세요.');
        } finally { setBusy(''); }
    };

    const close = () => { if (!busy) { onClose(); if (done) { setDone(false); setFiles([]); setSchool(null); setQuery(''); setNote(''); } } };
    const field = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 outline-none';

    return (
        <div role="dialog" aria-modal="true" aria-label="원본 시험지 제보" className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center bg-black/50"
            onClick={e => { if (e.target === e.currentTarget) close(); }}>
            <div className="bg-white w-full sm:max-w-xl rounded-t-2xl sm:rounded-2xl max-h-[92dvh] overflow-y-auto shadow-2xl">
                <div className="sm:hidden flex justify-center pt-3"><div className="w-10 h-1 rounded-full bg-slate-300" /></div>
                <div className="flex items-center justify-between px-5 sm:px-6 pt-4 pb-3 border-b border-slate-100">
                    <h2 className="text-lg font-bold text-slate-900">원본 시험지 제보</h2>
                    <button type="button" aria-label="닫기" onClick={close} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"><X size={22} /></button>
                </div>

                {done ? (
                    <div className="px-6 py-12 text-center">
                        <CheckCircle2 size={48} className="mx-auto text-emerald-500" />
                        <p className="mt-4 text-lg font-bold text-slate-900">제보가 접수됐어요. 고맙습니다!</p>
                        <p className="mt-2 text-sm leading-6 text-slate-600">검토 후 채택되면 <b className="text-slate-900">{REPORT_REWARD_LABEL}</b>를 넣어 드려요.<br />채택된 시험지는 정리해서 사이트에 올라갑니다.</p>
                        <button type="button" onClick={close} className="mt-8 w-full sm:w-auto px-8 py-3 rounded-xl bg-brand-600 text-white font-bold hover:bg-brand-700">확인</button>
                    </div>
                ) : (
                    <form onSubmit={submit} className="px-5 sm:px-6 py-5 space-y-6">
                        <div className="rounded-xl bg-brand-50 border border-brand-100 p-4 flex gap-3">
                            <Gift size={20} className="text-brand-600 shrink-0 mt-0.5" />
                            <p className="text-sm leading-6 text-slate-700">
                                학교에서 받은 수학 시험지를 <b className="text-slate-900">스캔 PDF</b>나 휴대폰 사진으로 올려주세요. <b className="text-slate-900">채택되면 {REPORT_REWARD_LABEL}</b>를 드려요.
                                <span className="block text-xs text-slate-500 mt-1">제보한 파일은 운영자만 봅니다.</span>
                            </p>
                        </div>

                        <section className="space-y-3">
                            <h3 className="text-sm font-bold text-slate-900">1. 어느 학교 시험인가요?</h3>
                            {school ? (
                                <div className="flex items-center justify-between gap-2 rounded-lg border border-brand-300 bg-brand-50 px-3 py-2.5">
                                    <span className="text-sm"><b className="text-slate-900">{school.name}</b><span className="ml-2 text-slate-500">{school.region} {school.district}</span></span>
                                    <button type="button" onClick={() => { setSchool(null); setQuery(''); setListOpen(true); }} className="text-xs font-bold text-brand-700 hover:underline">다시 고르기</button>
                                </div>
                            ) : (
                                <div className="relative">
                                    <input aria-label="학교 검색" value={query} onChange={e => { setQuery(e.target.value); setListOpen(true); }} onFocus={() => setListOpen(true)}
                                        placeholder="학교 이름으로 검색 (예: 휘문)" className={field} autoComplete="off" />
                                    {listOpen && query.trim() && (() => {
                                        const q = query.replace(/\s/g, '');
                                        const hits = schools.filter(sc => sc.name.replace(/\s/g, '').includes(q)).slice(0, 12);
                                        return (
                                            <ul role="listbox" aria-label="학교 목록" className="absolute z-10 mt-1 w-full max-h-64 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                                                {hits.length ? hits.map(sc => (
                                                    <li key={sc.code} role="option" aria-selected={false}>
                                                        <button type="button" onClick={() => { setSchool(sc); setListOpen(false); }} className="w-full text-left px-3 py-2.5 text-sm hover:bg-brand-50 flex justify-between gap-2">
                                                            <span className="font-medium text-slate-800">{sc.name}</span><span className="text-slate-400 shrink-0">{sc.region} {sc.district}</span>
                                                        </button>
                                                    </li>
                                                )) : <li className="px-3 py-3 text-sm text-slate-500">찾는 학교가 없어요. 학교 이름을 다시 확인해주세요 (전국 고등학교에서 찾아요).</li>}
                                            </ul>
                                        );
                                    })()}
                                </div>
                            )}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                <select aria-label="연도" value={year} onChange={e => setYear(Number(e.target.value))} className={field}>
                                    {Array.from({ length: thisYear - REPORT_MIN_YEAR + 1 }, (_, i) => thisYear - i).map(y => <option key={y} value={y}>{y}년</option>)}
                                </select>
                                <select aria-label="학년" value={grade} onChange={e => setGrade(Number(e.target.value))} className={field}>
                                    {[1, 2, 3].map(g => <option key={g} value={g}>{g}학년</option>)}
                                </select>
                                <select aria-label="학기" value={semester} onChange={e => setSemester(Number(e.target.value))} className={field}>
                                    <option value={1}>1학기</option><option value={2}>2학기</option>
                                </select>
                                <select aria-label="시험" value={examType} onChange={e => setExamType(e.target.value)} className={field}>
                                    <option value="중간고사">중간고사</option><option value="기말고사">기말고사</option>
                                </select>
                            </div>
                            <select aria-label="과목" value={subject} onChange={e => setSubject(e.target.value)} className={field} required>
                                <option value="">과목 선택</option>
                                {CURRICULA.map(c => <optgroup key={c.id} label={c.label}>{c.subjects.map(s => { const st = stateOf(s); return <option key={s} value={s} disabled={!!st}>{s}{st === 'owned' ? ' (이미 있음)' : st === 'pending' ? ' (제보 접수됨)' : ''}</option>; })}</optgroup>)}
                                <option value="모름">잘 모르겠어요</option>
                            </select>
                            {school && taken && (() => {
                                const all = CURRICULA.flatMap(c => c.subjects); const owned = all.filter(x => stateOf(x) === 'owned');
                                return owned.length > 0 ? <p className="text-xs text-slate-500">이 시험은 <b className="text-slate-700">{owned.join(', ')}</b>이(가) 이미 수학ETF에 있어요. 없는 과목만 고를 수 있어요.</p> : null;
                            })()}
                        </section>

                        <section className="space-y-3">
                            <div className="flex items-baseline justify-between">
                                <h3 className="text-sm font-bold text-slate-900">2. 시험지 파일 <span className="font-normal text-slate-500">— 스캔 PDF가 있으면 가장 좋아요</span></h3>
                                <span className="text-xs text-slate-500 tabular-nums">{files.length} / {MAX_FILES}장</span>
                            </div>
                            <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-100 px-3 py-2.5 text-xs leading-5 text-amber-900">
                                <ShieldCheck size={16} className="shrink-0 mt-0.5" />
                                <ul className="space-y-0.5 list-disc pl-4">
                                    <li>스캔 PDF가 있으면 그걸 올려주세요. 사진보다 선명해서 더 빨리 반영돼요.</li>
                                    <li>사진은 <b>기울이지 말고 정면에서</b>, 한 쪽이 화면에 꽉 차게 찍어주세요.</li>
                                    <li>그림자 없이 밝은 곳에서, 글자가 흔들리지 않게 찍어주세요.</li>
                                    <li>모든 쪽을 빠짐없이 찍어주세요.</li>
                                    <li><b>이름·학번·점수는 가리고</b> 찍어주세요.</li>
                                </ul>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <button type="button" onClick={() => cameraRef.current?.click()} className="flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-brand-200 text-brand-700 font-bold text-sm hover:bg-brand-50">
                                    <Camera size={18} /> 사진 찍기
                                </button>
                                <button type="button" onClick={() => pickRef.current?.click()} className="flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-slate-200 text-slate-700 font-bold text-sm hover:bg-slate-50">
                                    <FileText size={18} /> 스캔 PDF·사진 고르기
                                </button>
                            </div>
                            <input ref={cameraRef} type="file" accept="image/*" capture="environment" multiple hidden onChange={e => { addFiles(e.target.files); e.target.value = ''; }} />
                            <input ref={pickRef} type="file" accept={ACCEPT} multiple hidden onChange={e => { addFiles(e.target.files); e.target.value = ''; }} />
                            {files.length > 0 && (
                                <ul className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                                    {files.map((f, i) => (
                                        <li key={f.key} className="relative aspect-[3/4] rounded-lg overflow-hidden border border-slate-200 bg-slate-50">
                                            {f.url ? <img src={f.url} alt={`${i + 1}번째 사진`} className="w-full h-full object-cover" />
                                                : <div className="w-full h-full flex flex-col items-center justify-center gap-1 p-2 text-center"><FileText size={22} className="text-slate-400" /><span className="text-[10px] text-slate-500 break-all line-clamp-2">{f.file.name}</span></div>}
                                            <span className="absolute left-1 top-1 rounded bg-black/60 px-1.5 text-[11px] font-bold text-white tabular-nums">{i + 1}</span>
                                            <button type="button" aria-label={`${i + 1}번째 사진 빼기`} onClick={() => removeFile(f.key)} className="absolute right-1 top-1 rounded-full bg-white/90 p-1 text-slate-600 hover:text-rose-600 shadow"><Trash2 size={14} /></button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </section>

                        <section className="space-y-2">
                            <h3 className="text-sm font-bold text-slate-900">3. 남길 말 <span className="font-normal text-slate-400">(선택)</span></h3>
                            <textarea value={note} onChange={e => setNote(e.target.value)} maxLength={300} rows={2} placeholder="예: 서술형 답안지는 따로 찍었어요" className={field} />
                        </section>

                        {error && <div role="alert" className="flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2.5 text-sm text-rose-700"><AlertCircle size={16} className="shrink-0 mt-0.5" />{error}</div>}

                        <div className="flex gap-2 pt-1" style={{ paddingBottom: 'max(0.25rem, env(safe-area-inset-bottom))' }}>
                            <button type="button" onClick={close} disabled={!!busy} className="px-5 py-3 rounded-xl text-sm font-bold text-slate-500 hover:bg-slate-50">취소</button>
                            <button type="submit" disabled={!!busy} className="flex-1 py-3 rounded-xl bg-brand-600 text-white text-sm font-bold hover:bg-brand-700 disabled:opacity-60">
                                {busy || `제보하기${files.length ? ` · ${files.length}장` : ''}`}
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
}
