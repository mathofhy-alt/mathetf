"use client";
import {sendToExamCart} from '@/lib/questions/handoff';
import FeatureExplanation from '@/components/FeatureExplanation';
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
            // [수정] click() 직후 즉시 revoke하면 브라우저가 다운로드를 시작하기 전에
            // URL이 폐기돼 '아무 반응 없이 실패'가 간헐 발생 → 40초 뒤 정리
            setTimeout(() => URL.revokeObjectURL(url), 40_000);
            if (!isExamPromoHidden()) setShowPromo(true);
        } catch { alert('다운로드 중 오류가 발생했습니다.'); }
        setHwpLoading(false);
    };

    const canGen = !!school && selectedLabels.length > 0 && !genLoading;

    return (
        <main className="rd-tl-main">
            <section className="rd-wrap rd-tl-intro">
                <p className="rd-kicker rd-tl-kicker">A STUDY IN POSSIBILITIES</p>
                <h1 className="rd-tl-h1">우리 학교의 다음 연습.</h1>
                <p className="rd-lead rd-tl-lead">학교와 시험 범위를 선택하면, 같은 유형의 기존 기출문항을 찾아 한 세트로 모아드립니다.</p>
                <div className="rd-tl-actions">
                    <span className="rd-pill is-accent">런칭 기간 무료 이용</span>
                    <button className="rd-btn rd-btn-tint" disabled={!results?.length} onClick={()=>sendToExamCart((results||[]).map(q=>q.id),`${school} 유사 기출`,'predict')}>결과로 시험지 만들기</button>
                </div>
                <div className="rd-tl-explain"><FeatureExplanation/></div>
            </section>

            <div className="rd-wrap">
            <div className="rd-tl-form">
                {/* 학교 (타이핑 시에만 매칭 자동완성) */}
                <div className="rd-field">
                    <label className="rd-field-label">학교</label>
                    <div className="rd-tl-sugwrap">
                        <input value={school}
                            onChange={(e) => { setSchool(e.target.value); setShowSug(true); }}
                            onFocus={() => setShowSug(true)}
                            onBlur={() => setTimeout(() => setShowSug(false), 150)}
                            placeholder="학교명 입력 (예: 중산고등학교)"
                            className="rd-input rd-tl-input" />
                        {showSug && suggestions.length > 0 && (
                            <div className="rd-tl-sug">
                                {suggestions.map((s) => (
                                    <button key={s} type="button" onMouseDown={() => { setSchool(s); setShowSug(false); }}>
                                        {s}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                    <p className="rd-help">★ 데이터가 풍부한 학교는 더 정확해요. 그 외 학교는 전국 기출로 채워줍니다.</p>
                </div>

                {/* 범위 */}
                <div className="rd-tl-row3">
                    <div>
                        <label className="rd-field-label">학년</label>
                        <div className="rd-seg">{GRADES.map((g) => <button key={g} onClick={() => { setGrade(g); setSubjectTouched(false); }} className={grade === g ? 'is-on' : ''}>{g}</button>)}</div>
                    </div>
                    <div>
                        <label className="rd-field-label">학기</label>
                        <div className="rd-seg">{SEMS.map((s) => <button key={s} onClick={() => { setSem(s); setSubjectTouched(false); }} className={sem === s ? 'is-on' : ''}>{s}학기</button>)}</div>
                    </div>
                    <div>
                        <label className="rd-field-label">시험</label>
                        <div className="rd-seg">{EXAMS.map((e) => <button key={e} onClick={() => setExamType(e)} className={examType === e ? 'is-on' : ''}>{e}</button>)}</div>
                    </div>
                </div>

                {/* 교육과정 선택 (라디오) */}
                <div className="rd-tl-block">
                    <label className="rd-field-label">교육과정</label>
                    <div className="rd-seg rd-seg-inline rd-tl-seg">
                        {CURRICULA.map((c) => (
                            <button key={c.id} onClick={() => { setCurriculum(c.id); setSubjectTouched(false); }}
                                className={curriculum === c.id ? 'is-on' : ''}>
                                {c.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* 과목 (학년·학기·교육과정으로 자동, 직접 변경 가능) */}
                <div className="rd-tl-block">
                    <label className="rd-field-label rd-tl-label-wrap">과목 <small>학년·학기로 자동 선택 (다르면 직접 변경)</small></label>
                    <div className="rd-tl-chips">
                        {subjectList.map((s) => (
                            <button key={s} onClick={() => { setSubject(s); setSubjectTouched(true); }}
                                className={`rd-tl-chip${subject === s ? ' is-on' : ''}`}>
                                {s}
                            </button>
                        ))}
                    </div>
                </div>

                {/* 단원 (과목 단원 전체 선택됨, 시험범위만 남기기) */}
                <div className="rd-tl-block">
                    <label className="rd-field-label rd-tl-label-wrap">시험범위 단원 <small>시험에 안 나오는 단원은 눌러서 제외</small></label>
                    <div className="rd-tl-chips">
                        {unitList.map((un) => (
                            <button key={un} onClick={() => toggleLabel(un)}
                                className={`rd-tl-chip${selectedLabels.includes(un) ? ' is-on' : ''}`}>
                                {un}
                            </button>
                        ))}
                    </div>
                    <div className="rd-tl-textbtns">
                        <button onClick={() => setSelectedLabels(unitList)} className="is-ink">전체 선택</button>
                        <button onClick={() => setSelectedLabels([])}>전체 해제</button>
                    </div>
                </div>

                {/* 난이도 + 문항수 */}
                <div className="rd-tl-row2">
                    <div>
                        <label className="rd-field-label">난이도 ({minD} ~ {maxD})</label>
                        <div className="rd-tl-range">
                            <select value={minD} onChange={(e) => setMinD(Number(e.target.value))} className="rd-input">{Array.from({ length: 10 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}</select>
                            <span>~</span>
                            <select value={maxD} onChange={(e) => setMaxD(Number(e.target.value))} className="rd-input">{Array.from({ length: 10 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}</select>
                        </div>
                    </div>
                    <div>
                        <label className="rd-field-label">문항 수</label>
                        <select value={count} onChange={(e) => setCount(Number(e.target.value))} className="rd-input">{[5, 8, 10, 15, 20, 25, 30].map((n) => <option key={n} value={n}>{n}문항</option>)}</select>
                    </div>
                </div>

                {err && <p className="rd-tl-err">{err}</p>}

                <button onClick={generate} disabled={!canGen}
                    className="rd-btn rd-btn-primary rd-btn-block rd-tl-go">
                    {genLoading ? <><Loader2 size={18} className="animate-spin" /> 뽑는 중…</> : <><Wand2 size={18} /> 예상문제 뽑기</>}
                </button>
            </div>

            {/* 결과 */}
            {results && (
                <div className="rd-tl-results">
                    <div className="rd-tl-reshead">
                        <h2>예상문제 {results.length}문항</h2>
                        {styleUsed && <span className="rd-pill is-accent">{school} 스타일 매칭</span>}
                    </div>

                    {results.length === 0 ? (
                        <div className="rd-tl-empty">조건에 맞는 문항이 없어요. 단원/난이도를 넓혀보세요.</div>
                    ) : (
                        <>
                            <div className="rd-tl-qgrid">
                                {results.map((q, idx) => {
                                    const locked = !isLoggedIn && idx >= freeCount;
                                    const xml = contents[q.id];
                                    const imgs = images[q.id];
                                    const ready = xml !== undefined && imgs !== undefined;
                                    return (
                                        <div key={q.id} className="rd-tl-qcard">
                                            <div className="rd-tl-qhead">
                                                <span className="rd-tl-qno">{idx + 1}</span>
                                                <span className="rd-tl-qunit">{q.unit}</span>
                                                <span className="rd-tl-qdiff">난이도 {q.difficulty}</span>
                                            </div>
                                            <div className="rd-tl-qbody">
                                                {locked ? (
                                                    <div className="rd-tl-locked">
                                                        <Lock size={20} />
                                                        <p>가입하면 전체 문제와 한글(HWP) 파일을 무료로 받아요</p>
                                                    </div>
                                                ) : !ready ? (
                                                    /* 문제 모양 스켈레톤 — 지문·수식·보기 자리 (스피너보다 체감 빠름) */
                                                    <div className="rd-tl-skel animate-pulse" aria-label="문항 불러오는 중">
                                                        <div style={{ width: '92%' }} />
                                                        <div style={{ width: '80%' }} />
                                                        <div className="is-mid" style={{ width: '50%' }} />
                                                        <div className="rd-tl-skel-row">
                                                            <div /><div /><div />
                                                        </div>
                                                    </div>
                                                ) : xml ? (
                                                    <QuestionRenderer xmlContent={xml} externalImages={imgs} displayMode="question" showDownloadAction={false} className="border-none shadow-none p-0 w-full !text-sm" />
                                                ) : (
                                                    <p className="rd-tl-muted">문항 준비중</p>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            <div className="rd-tl-cta">
                                {isLoggedIn ? (
                                    <>
                                        <p className="rd-tl-cta-title">예상문제 세트 다운로드</p>
                                        <p className="rd-tl-cta-text">런칭 기념 — <strong>문제 + 해설</strong> 한글파일 회원 무료!</p>
                                        <button onClick={downloadHwp} disabled={hwpLoading}
                                            className="rd-btn rd-btn-primary rd-tl-cta-btn">
                                            {hwpLoading ? <><Loader2 size={16} className="animate-spin" /> 만드는 중…</> : <><Download size={16} /> 한글(HWP) 다운로드</>}
                                        </button>
                                        <p className="rd-tl-cta-note">문제+해설 포함, 회원 무료 (런칭 기념)</p>
                                        <p className="rd-tl-cta-note">한글(HWP) 파일이라 한글 프로그램이 설치된 PC에서 열려요</p>
                                    </>
                                ) : (
                                    <>
                                        <p className="rd-tl-cta-title">런칭 기념 — 가입하면 <span className="rd-tl-u">문제 + 해설</span> 한글파일 무료</p>
                                        <p className="rd-tl-cta-text">회원가입만 하면 예상문제 전체(나머지 {Math.max(0, results.length - freeCount)}문항 포함)를 문제·해설까지 한글파일로 받아요.</p>
                                        <Link href="/signup" className="rd-btn rd-btn-primary rd-tl-cta-btn">무료로 가입하고 전체 받기</Link>
                                    </>
                                )}
                            </div>
                        </>
                    )}
                </div>
            )}
            </div>

            {showPromo && <ExamPromoModal onClose={() => setShowPromo(false)} />}
        </main>
    );
}
