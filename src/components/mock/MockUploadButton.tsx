"use client";
import React, { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { Upload, X, Loader2 } from 'lucide-react';

const CATEGORIES = ['전국연합', '평가원', '수능', '경찰대', '사관학교'];
const GRADES = ['고1', '고2', '고3'];

export interface MockEditInitial {
    id: string;
    category: string;
    year: number;
    grade: string;
    month: number;
    subject: string;
    title: string;
    hasOriginalPdf: boolean;
    hasOriginalHwp: boolean;
    hasVariantPdf: boolean;
    hasVariantHwp: boolean;
}

export default function MockUploadButton() {
    const [isAdmin, setIsAdmin] = useState(false);
    const [open, setOpen] = useState(false);

    useEffect(() => {
        createClient().auth.getUser().then(({ data: { user } }) => {
            setIsAdmin(user?.email === 'mathofhy@naver.com');
        });
    }, []);

    if (!isAdmin) return null;

    return (
        <>
            <button
                onClick={() => setOpen(true)}
                className="inline-flex items-center gap-1.5 bg-white/90 hover:bg-white text-[#2B3A67] font-extrabold text-sm px-4 py-2 rounded-full shadow-md hover:shadow-lg transition-all"
            >
                <Upload size={15} /> 자료 업로드
            </button>
            {open && <MockUploadModal onClose={() => setOpen(false)} />}
        </>
    );
}

export function MockUploadModal({ onClose, initial }: { onClose: () => void; initial?: MockEditInitial }) {
    const isEdit = !!initial;
    const [category, setCategory] = useState(initial?.category || '전국연합');
    const [year, setYear] = useState(initial?.year || new Date().getFullYear());
    const [grade, setGrade] = useState(initial?.grade || '고3');
    const [month, setMonth] = useState<number | ''>(initial?.month || '');
    const [subject, setSubject] = useState(initial?.subject || '수학');
    const [title, setTitle] = useState(initial?.title || '');
    const [files, setFiles] = useState<Record<string, File | null>>({ originalPdf: null, originalHwp: null, variantPdf: null, variantHwp: null });
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState<string | null>(null);

    const autoTitle = `${year} ${grade} ${month ? month + '월 ' : ''}${category} ${subject}`.replace(/\s+/g, ' ').trim();
    const setFile = (k: string, f: File | null) => setFiles((p) => ({ ...p, [k]: f }));
    const existing: Record<string, boolean> = {
        originalPdf: !!initial?.hasOriginalPdf, originalHwp: !!initial?.hasOriginalHwp,
        variantPdf: !!initial?.hasVariantPdf, variantHwp: !!initial?.hasVariantHwp,
    };

    const submit = async () => {
        setMsg(null);
        if (!isEdit && !Object.values(files).some(Boolean)) { setMsg('파일을 최소 1개 선택하세요.'); return; }
        setBusy(true);
        try {
            const fd = new FormData();
            if (isEdit) fd.append('id', initial!.id);
            fd.append('category', category);
            fd.append('year', String(year));
            fd.append('grade', grade);
            fd.append('month', String(month || ''));
            fd.append('subject', subject);
            fd.append('title', title || autoTitle);
            Object.entries(files).forEach(([k, f]) => { if (f) fd.append(k, f); });
            const r = await fetch('/api/admin/mock/upload', { method: 'POST', body: fd });
            const j = await r.json().catch(() => ({}));
            if (!r.ok) { setMsg(j.error || '실패'); setBusy(false); return; }
            setMsg(isEdit ? '✅ 수정 완료!' : '✅ 업로드 완료!');
            setBusy(false);
            setTimeout(() => { onClose(); window.location.reload(); }, 800);
        } catch (e: any) {
            setMsg(e.message || '오류'); setBusy(false);
        }
    };

    const FileRow = ({ k, label }: { k: string; label: string }) => (
        <label className="flex items-center justify-between gap-2 border border-slate-200 rounded-lg px-3 py-2 text-sm cursor-pointer hover:border-[#497AB7]/50">
            <span className="font-semibold text-slate-600">{label}</span>
            <span className="text-xs truncate max-w-[160px] text-right">
                {files[k]?.name
                    ? <span className="text-[#497AB7] font-bold">{files[k]!.name}</span>
                    : existing[k]
                        ? <span className="text-emerald-600">현재 있음 · 교체하려면 선택</span>
                        : <span className="text-slate-400">파일 선택</span>}
            </span>
            <input type="file" className="hidden" onChange={(e) => setFile(k, e.target.files?.[0] || null)} />
        </label>
    );

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 sticky top-0 bg-white">
                    <h3 className="font-extrabold text-[#1E2D4F]">{isEdit ? '모의고사 자료 수정' : '모의고사 자료 업로드'}</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
                </div>

                <div className="p-5 space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                        <Field label="분류">
                            <select value={category} onChange={(e) => setCategory(e.target.value)} className="form-select">
                                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </Field>
                        <Field label="연도">
                            <input type="number" value={year} onChange={(e) => setYear(parseInt(e.target.value) || year)} className="form-input" />
                        </Field>
                        <Field label="학년">
                            <select value={grade} onChange={(e) => setGrade(e.target.value)} className="form-select">
                                {GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
                            </select>
                        </Field>
                        <Field label="시행월">
                            <input type="number" placeholder="예: 6" value={month} onChange={(e) => setMonth(e.target.value ? parseInt(e.target.value) : '')} className="form-input" />
                        </Field>
                        <Field label="과목/영역">
                            <input value={subject} onChange={(e) => setSubject(e.target.value)} className="form-input" />
                        </Field>
                    </div>

                    <Field label="제목 (비우면 자동)">
                        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={autoTitle} className="form-input" />
                    </Field>

                    <div className="pt-1">
                        <p className="text-xs font-bold text-slate-500 mb-1.5">
                            파일 {isEdit ? '(교체할 것만 새로 선택 · 원본 PDF 교체 시 미리보기 재생성 필요)' : '(있는 것만 올리면 됨)'}
                        </p>
                        <div className="space-y-2">
                            <FileRow k="originalPdf" label="원본 PDF" />
                            <FileRow k="originalHwp" label="원본 HWP" />
                            <FileRow k="variantPdf" label="변형 PDF" />
                            <FileRow k="variantHwp" label="변형 HWP" />
                        </div>
                    </div>

                    {msg && <p className="text-sm text-center font-semibold text-[#497AB7]">{msg}</p>}

                    <button onClick={submit} disabled={busy} className="w-full bg-[#3A6CAE] hover:bg-[#2B3A67] disabled:opacity-50 text-white font-extrabold py-3 rounded-xl flex items-center justify-center gap-2 transition-colors">
                        {busy ? <><Loader2 size={16} className="animate-spin" /> 처리 중…</> : <><Upload size={16} /> {isEdit ? '수정 저장' : '업로드'}</>}
                    </button>
                </div>
            </div>
        </div>
    );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <label className="block">
            <span className="text-xs font-bold text-slate-500">{label}</span>
            <div className="mt-1">{children}</div>
        </label>
    );
}
