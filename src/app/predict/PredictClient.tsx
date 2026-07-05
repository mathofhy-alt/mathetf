"use client";
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Wand2, Lock, Loader2, Download } from 'lucide-react';
import QuestionRenderer from '@/components/QuestionRenderer';
import ExamPromoModal, { isExamPromoHidden } from '@/components/ExamPromoModal';
import { CURRICULA, subjectFor, SUBJECT_UNITS, unitVariants } from '@/lib/curriculum';
import { createClient } from '@/utils/supabase/client';

interface Props { richSchools: string[]; }
interface QItem { id: string; unit: string; difficulty: string; school: string; subject?: string; similarity?: number; }

const GRADES = ['고1', '고2', '고3'];
const SEMS = ['1', '2'];
const EXAMS = ['중간', '기말'];

export default function PredictClient({ richSchools }: Props) {
    // [PERF] 로그인 여부는 클라이언트에서 확인 (서버가 쿠키를 안 읽어야 페이지가 ISR 캐시됨)
    // 생성 버튼 클릭 시점에만 쓰이므로 마운트 직후 비동기 확인으로 충분
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    useEffect(() => {
        createClient().auth.getUser().then(({ data: { user } }) => setIsLoggedIn(!!user)).catch(() => { });
    }, []);
    const [school, setSchool] = useState('');
    const [showSug, setShowSug] = useState(false);
    const [grade, setGrade] = useState('고1');
    const [sem, setSem] = useState('1');
    const [examType, setExamType] = useState('기말');
    const [curriculum, setCurriculum] = useState('2022'); // 2022 개정 / 2015 개정
    const [subject, setSubject] = useState('공통수학1');
    const [subjectTouched, setSubjectTouched] = useState(false); // 사용자가 과목 직접 바꿨는지
    const [selectedLabels, setSelectedLabels] = useState<string[]>([]);
    const [minD, setMinD] = useState(2);
    const [maxD, setMaxD] = useState(6);
    const [count, setCount] = useState(15);
    const [genLoading, setGenLoading] = useState(false);
    const [results, setResults] = useState<QItem[] | null>(null);
    const [images, setImages] = useState<Record<string, any[]>>({});
    const [contents, setContents] = useState<Record<string, string>>({});
    const [styleUsed, setStyleUsed] = useState(false);
    const [err, setErr] = useState('');

    const semesterStr = `${sem}학기${examType}`;
    const freeCount = 3;
    const unitList = SUBJECT_UNITS[subject] || [];
    const suggestions = school.trim()
        ? richSchools.filter((s) => s.includes(school.trim()) && s !== school).slice(0, 8)
        : [];

    const subjectList = (CURRICULA.find((c) => c.id === curriculum)?.subjects || []) as string[];

    // 학년·학기·교육과정 변경 → 과목 자동 (사용자가 직접 바꾸기 전까지)
    useEffect(() => {
        if (!subjectTouched) setSubject(subjectFor(grade, sem, curriculum));
    }, [grade, sem, curriculum, subjectTouched]);

    // 과목 바뀌면 그 과목 단원 전체 선택
    useEffect(() => {
        setSelectedLabels(SUBJECT_UNITS[subject] || []);
    }, [subject]);

    const toggleLabel = (l: string) => setSelectedLabels((prev) => prev.includes(l) ? prev.filter((x) => x !== l) : [...prev, l]);

    const fetchPreview = async (ids: string[]) => {
        if (ids.length === 0) return;
        // 청크 간·청크 내(content/images) 모두 병렬 — 직렬이던 것을 병렬화해 뒷번호 문항도 빨리 뜨게
        const chunks: string[][] = [];
        for (let c = 0; c < ids.length; c += 20) chunks.push(ids.slice(c, c + 20));
        await Promise.all(chunks.flatMap((chunk) => [
            fetch('/api/predict/content', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: chunk }) })
                .then((r) => r.json())
                .then((cj) => {
                    const cmap: Record<string, string> = {};
                    for (const id of chunk) cmap[id] = (cj.content && cj.content[id]) || '';
                    setContents((prev) => ({ ...prev, ...cmap }));
                })
                .catch(() => { }),
            fetch('/api/questions/images', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: chunk }) })
                .then((r) => r.json())
                .then((ij) => {
                    const obj = ij.images || {};
                    const imap: Record<string, any[]> = {};
                    for (const id of chunk) imap[id] = obj[id] || [];
                    setImages((prev) => ({ ...prev, ...imap }));
                })
                .catch(() => { }),
        ]));
    };

    const generate = async () => {
        // 선택 단원 → DB 단원명 변형 전체로 펼침
        const units = Array.from(new Set(selectedLabels.flatMap((l) => unitVariants(l))));
        if (units.length === 0) { setErr('단원을 1개 이상 선택하세요.'); return; }
        setErr(''); setGenLoading(true); setResults(null); setImages({}); setContents({});
        try {
            const r = await fetch('/api/predict/generate', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ school, grade, semester: semesterStr, units, minDifficulty: minD, maxDifficulty: maxD, count }),
            });
            const j = await r.json();
            if (j.error) { setErr(j.error); setGenLoading(false); return; }
            const qs = (j.questions || []) as QItem[];
            setResults(qs);
            setStyleUsed(!!j.styleUsed);
            const visible = isLoggedIn ? qs.map((q) => q.id) : qs.slice(0, freeCount).map((q) => q.id);
            fetchPreview(visible);
        } catch { setErr('생성 중 오류가 발생했습니다.'); }
        setGenLoading(false);
    };

    const [hwpLoading, setHwpLoading] = useState(false);
    const [showPromo, setShowPromo] = useState(false);
    const downloadHwp = async () => {
        if (!results || results.length === 0) return;
        setHwpLoading(true);
        try {
            const ids = results.map((q) => q.id);
            const title = `${school} ${grade} ${semesterStr} 예상문제`;
            const r = await fetch('/api/predict/hwp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids, title }) });
            if (!r.ok) {
                let msg = 'HWP 생성 실패';
                try { const j = await r.json(); if (j.error) msg = j.error; } catch { try { msg = await r.text() || msg; } catch { } }
                alert(msg); setHwpLoading(false); return;
            }
            const blob = await r.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = `${title}.hml`;
            document.body.appendChild(a); a.click(); a.remove();
            URL.revokeObjectURL(url);
            if (!isExamPromoHidden()) setShowPromo(true);
        } catch { alert('다운로드 중 오류가 발생했습니다.'); }
        setHwpLoading(false);
    };

    const canGen = !!school && selectedLabels.length > 0 && !genLoading;

    return (
        <main className="max-w-5xl mx-auto px-4 py-8 sm:py-10">
            <div className="mb-6">
                <div className="inline-flex items-center gap-1.5 bg-[#5CC6C3]/12 border border-[#5CC6C3]/30 text-[#3AADA9] text-xs font-bold px-3 py-1 rounded-full mb-3">
                    <Wand2 size={12} /> 예상문제 뽑아보기
                </div>
                <h1 className="text-2xl sm:text-3xl font-black break-keep">우리 학교 예상문제, 1분 만에</h1>
                <p className="text-slate-600 text-base md:text-lg mt-2 break-keep leading-relaxed">
                    학교와 시험범위를 고르면, <strong className="text-[#497AB7]">그 학교 출제 스타일과 같은 유형의 실제 기출</strong>을 모아 예상문제 세트를 만들어 드려요.
                </p>
                <p className="mt-1.5 text-[#3AADA9] font-extrabold text-base md:text-lg break-keep">
                    🎉 런칭 기념, 지금은 무료입니다!
                </p>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 mb-6 space-y-5">
                {/* 학교 (타이핑 시에만 매칭 자동완성) */}
                <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1.5">학교</label>
                    <div className="relative">
                        <input value={school}
                            onChange={(e) => { setSchool(e.target.value); setShowSug(true); }}
                            onFocus={() => setShowSug(true)}
                            onBlur={() => setTimeout(() => setShowSug(false), 150)}
                            placeholder="학교명 입력 (예: 중산고등학교)"
                            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#497AB7]/30" />
                        {showSug && suggestions.length > 0 && (
                            <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-56 overflow-auto">
                                {suggestions.map((s) => (
                                    <button key={s} type="button" onMouseDown={() => { setSchool(s); setShowSug(false); }}
                                        className="block w-full text-left px-3 py-2 text-sm hover:bg-slate-50">
                                        {s}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">★ 데이터가 풍부한 학교는 더 정확해요. 그 외 학교는 전국 기출로 채워줍니다.</p>
                </div>

                {/* 범위 */}
                <div className="grid grid-cols-3 gap-3">
                    <div>
                        <label className="block text-xs font-bold text-slate-600 mb-1.5">학년</label>
                        <div className="flex gap-1">{GRADES.map((g) => <button key={g} onClick={() => { setGrade(g); setSubjectTouched(false); }} className={`flex-1 py-2 rounded-lg text-sm font-bold transition-colors ${grade === g ? 'bg-[#497AB7] text-white' : 'bg-slate-100 text-slate-500'}`}>{g}</button>)}</div>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-600 mb-1.5">학기</label>
                        <div className="flex gap-1">{SEMS.map((s) => <button key={s} onClick={() => { setSem(s); setSubjectTouched(false); }} className={`flex-1 py-2 rounded-lg text-sm font-bold transition-colors ${sem === s ? 'bg-[#497AB7] text-white' : 'bg-slate-100 text-slate-500'}`}>{s}학기</button>)}</div>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-600 mb-1.5">시험</label>
                        <div className="flex gap-1">{EXAMS.map((e) => <button key={e} onClick={() => setExamType(e)} className={`flex-1 py-2 rounded-lg text-sm font-bold transition-colors ${examType === e ? 'bg-[#497AB7] text-white' : 'bg-slate-100 text-slate-500'}`}>{e}</button>)}</div>
                    </div>
                </div>

                {/* 교육과정 선택 (라디오) */}
                <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1.5">교육과정</label>
                    <div className="inline-flex rounded-xl border border-slate-200 p-1 bg-slate-50">
                        {CURRICULA.map((c) => (
                            <button key={c.id} onClick={() => { setCurriculum(c.id); setSubjectTouched(false); }}
                                className={`text-sm font-bold px-4 py-2 rounded-lg transition-colors ${curriculum === c.id ? 'bg-[#497AB7] text-white shadow-sm' : 'text-slate-500'}`}>
                                {c.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* 과목 (학년·학기·교육과정으로 자동, 직접 변경 가능) */}
                <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1.5">과목 <span className="text-slate-400 font-normal">— 학년·학기로 자동 선택 (다르면 직접 변경)</span></label>
                    <div className="flex flex-wrap gap-1.5">
                        {subjectList.map((s) => (
                            <button key={s} onClick={() => { setSubject(s); setSubjectTouched(true); }}
                                className={`text-xs px-3 py-1.5 rounded-full border font-bold transition-colors ${subject === s ? 'bg-[#3AADA9] text-white border-[#3AADA9]' : 'bg-white text-slate-500 border-slate-200'}`}>
                                {s}
                            </button>
                        ))}
                    </div>
                </div>

                {/* 단원 (과목 단원 전체 선택됨, 시험범위만 남기기) */}
                <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1.5">시험범위 단원 <span className="text-slate-400 font-normal">— 시험에 안 나오는 단원은 눌러서 제외</span></label>
                    <div className="flex flex-wrap gap-1.5">
                        {unitList.map((un) => (
                            <button key={un} onClick={() => toggleLabel(un)}
                                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${selectedLabels.includes(un) ? 'bg-[#497AB7] text-white border-[#497AB7]' : 'bg-white text-slate-400 border-slate-200'}`}>
                                {un}
                            </button>
                        ))}
                    </div>
                    <div className="flex gap-2 mt-2">
                        <button onClick={() => setSelectedLabels(unitList)} className="text-[11px] text-[#497AB7] font-bold">전체 선택</button>
                        <button onClick={() => setSelectedLabels([])} className="text-[11px] text-slate-400 font-bold">전체 해제</button>
                    </div>
                </div>

                {/* 난이도 + 문항수 */}
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="block text-xs font-bold text-slate-600 mb-1.5">난이도 ({minD} ~ {maxD})</label>
                        <div className="flex items-center gap-2">
                            <select value={minD} onChange={(e) => setMinD(Number(e.target.value))} className="flex-1 border border-slate-200 rounded-lg px-2 py-2 text-sm">{Array.from({ length: 10 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}</select>
                            <span className="text-slate-400">~</span>
                            <select value={maxD} onChange={(e) => setMaxD(Number(e.target.value))} className="flex-1 border border-slate-200 rounded-lg px-2 py-2 text-sm">{Array.from({ length: 10 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}</select>
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-600 mb-1.5">문항 수</label>
                        <select value={count} onChange={(e) => setCount(Number(e.target.value))} className="w-full border border-slate-200 rounded-lg px-2 py-2 text-sm">{[5, 8, 10, 15, 20, 25, 30].map((n) => <option key={n} value={n}>{n}문항</option>)}</select>
                    </div>
                </div>

                {err && <p className="text-sm text-rose-500 font-medium">{err}</p>}

                <button onClick={generate} disabled={!canGen}
                    className="w-full py-3 rounded-xl font-extrabold text-white bg-gradient-to-r from-[#497AB7] to-[#3AADA9] hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity flex items-center justify-center gap-2">
                    {genLoading ? <><Loader2 size={18} className="animate-spin" /> 뽑는 중…</> : <><Wand2 size={18} /> 예상문제 뽑기</>}
                </button>
            </div>

            {/* 결과 */}
            {results && (
                <div>
                    <div className="flex items-center justify-between mb-3">
                        <h2 className="text-lg font-extrabold">예상문제 {results.length}문항</h2>
                        {styleUsed && <span className="text-[11px] text-[#3AADA9] font-bold bg-[#5CC6C3]/12 px-2 py-1 rounded-full">{school} 스타일 매칭</span>}
                    </div>

                    {results.length === 0 ? (
                        <div className="py-16 text-center text-slate-400 bg-white rounded-2xl border border-slate-200">조건에 맞는 문항이 없어요. 단원/난이도를 넓혀보세요.</div>
                    ) : (
                        <>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {results.map((q, idx) => {
                                    const locked = !isLoggedIn && idx >= freeCount;
                                    const xml = contents[q.id];
                                    const imgs = images[q.id];
                                    const ready = xml !== undefined && imgs !== undefined;
                                    return (
                                        <div key={q.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                                            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-100">
                                                <span className="w-6 h-6 rounded-lg bg-[#497AB7] text-white text-xs font-extrabold flex items-center justify-center">{idx + 1}</span>
                                                <span className="text-xs font-bold text-slate-600">{q.unit}</span>
                                                <span className="text-[11px] text-slate-400 ml-auto">난이도 {q.difficulty}</span>
                                            </div>
                                            <div className="relative min-h-[120px] bg-white flex items-center justify-center p-3">
                                                {locked ? (
                                                    <div className="py-10 text-center px-4">
                                                        <Lock size={20} className="mx-auto text-slate-300 mb-2" />
                                                        <p className="text-xs text-slate-400">가입하면 전체 문제와 PDF·HWP를 무료로 받아요</p>
                                                    </div>
                                                ) : !ready ? (
                                                    /* 문제 모양 스켈레톤 — 지문·수식·보기 자리 (스피너보다 체감 빠름) */
                                                    <div className="w-full px-2 py-4 space-y-2.5 animate-pulse" aria-label="문항 불러오는 중">
                                                        <div className="h-3.5 bg-slate-200 rounded w-11/12" />
                                                        <div className="h-3.5 bg-slate-200 rounded w-4/5" />
                                                        <div className="h-4 bg-slate-100 rounded w-1/2 mx-auto my-3" />
                                                        <div className="flex gap-4 pt-1">
                                                            <div className="h-3 bg-slate-100 rounded w-12" />
                                                            <div className="h-3 bg-slate-100 rounded w-12" />
                                                            <div className="h-3 bg-slate-100 rounded w-12" />
                                                        </div>
                                                    </div>
                                                ) : xml ? (
                                                    <QuestionRenderer xmlContent={xml} externalImages={imgs} displayMode="question" showDownloadAction={false} className="border-none shadow-none p-0 w-full !text-sm" />
                                                ) : (
                                                    <p className="text-xs text-slate-400 my-10">문항 준비중</p>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            <div className="mt-6 bg-gradient-to-br from-[#497AB7] to-[#3AADA9] rounded-2xl p-6 text-center text-white">
                                {isLoggedIn ? (
                                    <>
                                        <p className="font-bold text-lg mb-1">예상문제 세트 다운로드</p>
                                        <p className="text-white/90 text-sm mb-3">🎉 런칭 기념 — <strong>문제 + 해설</strong> 한글파일 회원 무료!</p>
                                        <div className="flex justify-center">
                                            <button onClick={downloadHwp} disabled={hwpLoading}
                                                className="inline-flex items-center justify-center gap-2 bg-white text-[#497AB7] font-extrabold px-6 py-3 rounded-xl hover:bg-slate-50 disabled:opacity-60">
                                                {hwpLoading ? <><Loader2 size={16} className="animate-spin" /> 만드는 중…</> : <><Download size={16} /> 한글(HWP) 다운로드</>}
                                            </button>
                                        </div>
                                        <p className="text-white/70 text-xs mt-3">문제+해설 포함 · 회원 무료 (런칭 기념)</p>
                                    </>
                                ) : (
                                    <>
                                        <p className="font-bold text-lg mb-1">🎉 런칭 기념 — 가입하면 <span className="underline">문제 + 해설</span> 한글파일 무료</p>
                                        <p className="text-white/85 text-sm mb-4">회원가입만 하면 예상문제 전체(나머지 {Math.max(0, results.length - freeCount)}문항 포함)를 문제·해설까지 한글파일로 받아요.</p>
                                        <Link href="/signup" className="inline-block bg-white text-[#497AB7] font-extrabold px-6 py-3 rounded-xl hover:bg-slate-50">무료로 가입하고 전체 받기 →</Link>
                                    </>
                                )}
                            </div>
                        </>
                    )}
                </div>
            )}

            {showPromo && <ExamPromoModal onClose={() => setShowPromo(false)} />}
        </main>
    );
}
