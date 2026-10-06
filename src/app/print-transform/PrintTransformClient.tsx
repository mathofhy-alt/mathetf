"use client";
import FeatureExplanation from '@/components/FeatureExplanation';
import {sendToExamCart} from '@/lib/questions/handoff';
import React, { useRef, useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Crop, Loader2, Upload, Wand2, Check, Download, Trash2, ChevronLeft, ChevronRight, Maximize2, Minimize2 } from 'lucide-react';
import QuestionRenderer from '@/components/QuestionRenderer';
import ExamPromoModal, { isExamPromoHidden } from '@/components/ExamPromoModal';

interface CropItem {
    id: string;
    dataUrl: string;
    loading: boolean;
    reading?: { unit: string | null; concepts: string[]; difficulty?: number | null };
    candidates?: any[];                 // 유사문제 후보
    contents: Record<string, string>;   // id -> content_xml
    images: Record<string, any[]>;      // id -> 이미지행
    selected: string[];                 // 채택한 유사문제 id
    widened?: boolean;                  // 같은 단원에 문항이 없어 과목 전체로 넓혀 찾았음
    error?: string;
}

let _cid = 0;

export default function PrintTransformClient({ isLoggedIn }: { isLoggedIn: boolean }) {
    const [numPages, setNumPages] = useState(0);
    const [cur, setCur] = useState(0);              // 현재 보고 있는 페이지 (0-based)
    const [loadingPdf, setLoadingPdf] = useState(false);
    const [crops, setCrops] = useState<CropItem[]>([]);
    const [making, setMaking] = useState(false);
    const [showPromo, setShowPromo] = useState(false);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const pdfRef = useRef<any>(null);
    const renderSeq = useRef(0);
    const [expanded, setExpanded] = useState<Record<string, boolean>>({});   // 후보별 '전체보기'

    // PDF 업로드 → 렌더
    const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setLoadingPdf(true); setNumPages(0); setCur(0); setCrops([]);
        try {
            const pdfjs: any = await import('pdfjs-dist');
            pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'; // public 정적 파일 (webpack 번들 회피)
            const buf = await file.arrayBuffer();
            const doc = await pdfjs.getDocument({ data: buf }).promise;
            pdfRef.current = doc;
            // 예전엔 여기서 전 페이지를 한꺼번에 렌더했다. 50쪽짜리 프린트를 올리면
            // 업로드가 한참 걸리고 스크롤도 감당이 안 됐다 → 현재 페이지만 렌더한다.
            setNumPages(doc.numPages);
        } catch (err) {
            alert('PDF를 여는 데 실패했어요.');
        }
        setLoadingPdf(false);
    };

    // 현재 페이지만 캔버스에 렌더 (페이지를 빠르게 넘기면 이전 렌더 결과는 버린다)
    useEffect(() => {
        const doc = pdfRef.current;
        const cv = canvasRef.current;
        if (!doc || !cv || numPages === 0) return;
        const seq = ++renderSeq.current;
        (async () => {
            try {
                const page = await doc.getPage(cur + 1);
                const vp = page.getViewport({ scale: 1.5 });
                if (seq !== renderSeq.current) return;
                cv.width = vp.width; cv.height = vp.height;
                const ctx = cv.getContext('2d');
                if (ctx) await page.render({ canvasContext: ctx, viewport: vp }).promise;
            } catch { /* 렌더 취소 등 */ }
        })();
    }, [cur, numPages]);

    const goPage = useCallback((n: number) => {
        setCur((c) => Math.min(Math.max(n, 0), Math.max(numPages - 1, 0)));
    }, [numPages]);

    // ←/→ 키로도 넘길 수 있게 (입력창에 포커스가 있을 땐 제외)
    useEffect(() => {
        if (numPages === 0) return;
        const onKey = (e: KeyboardEvent) => {
            const t = e.target as HTMLElement;
            if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
            if (e.key === 'ArrowLeft') goPage(cur - 1);
            if (e.key === 'ArrowRight') goPage(cur + 1);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [cur, numPages, goPage]);

    // 페이지에서 영역 드래그 → 크롭 추가
    const addCrop = (sx: number, sy: number, sw: number, sh: number) => {
        const cv = canvasRef.current;
        if (!cv || sw < 12 || sh < 12) return;
        const scaleX = cv.width / cv.clientWidth;
        const scaleY = cv.height / cv.clientHeight;
        const rx = sx * scaleX, ry = sy * scaleY, rw = sw * scaleX, rh = sh * scaleY;
        const tmp = document.createElement('canvas');
        tmp.width = rw; tmp.height = rh;
        const tctx = tmp.getContext('2d');
        if (!tctx) return;
        tctx.fillStyle = '#fff'; tctx.fillRect(0, 0, rw, rh);
        tctx.drawImage(cv, rx, ry, rw, rh, 0, 0, rw, rh);
        const dataUrl = tmp.toDataURL('image/png');
        setCrops((prev) => [...prev, { id: `c${_cid++}`, dataUrl, loading: false, contents: {}, images: {}, selected: [] }]);
    };

    const removeCrop = (id: string) => setCrops((p) => p.filter((c) => c.id !== id));

    // 크롭 → 유사문제 찾기
    const findSimilar = async (id: string) => {
        setCrops((p) => p.map((c) => c.id === id ? { ...c, loading: true, error: undefined } : c));
        const crop = crops.find((c) => c.id === id);
        if (!crop) return;
        try {
            const r = await fetch('/api/print/match', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image: crop.dataUrl, mimeType: 'image/png', count: 8 }) });
            const j = await r.json();
            if (!r.ok) { setCrops((p) => p.map((c) => c.id === id ? { ...c, loading: false, error: j.error || '실패' } : c)); return; }
            const cands = j.candidates || [];
            const ids = cands.map((q: any) => q.id);
            // 내용·이미지 로드
            const [cont, imgs] = await Promise.all([
                fetch('/api/predict/content', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }) }).then((x) => x.json()).catch(() => ({})),
                fetch('/api/questions/images', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }) }).then((x) => x.json()).catch(() => ({})),
            ]);
            setCrops((p) => p.map((c) => c.id === id ? {
                ...c, loading: false, reading: j.reading, candidates: cands, widened: !!j.widened,
                contents: cont.content || {}, images: imgs.images || {},
                selected: ids.slice(0, 1),
            } : c));
        } catch {
            setCrops((p) => p.map((c) => c.id === id ? { ...c, loading: false, error: '오류' } : c));
        }
    };

    const toggleSel = (cropId: string, qid: string) =>
        setCrops((p) => p.map((c) => c.id === cropId ? { ...c, selected: c.selected.includes(qid) ? c.selected.filter((x) => x !== qid) : [...c.selected, qid] } : c));

    const totalSelected = crops.reduce((n, c) => n + c.selected.length, 0);

    // 채택한 변형문제 전체 → 한글파일
    const makeHwp = async () => {
        const ids = crops.flatMap((c) => c.selected);
        if (ids.length === 0) { alert('채택한 변형문제가 없어요.'); return; }
        setMaking(true);
        try {
            const r = await fetch('/api/predict/hwp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids, title: '학교프린트 변형문제', source: 'print' }) });
            if (!r.ok) { let m = 'HWP 생성 실패'; try { const j = await r.json(); if (j.error) m = j.error; } catch { } alert(m); setMaking(false); return; }
            const blob = await r.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url; a.download = '학교프린트_변형문제.hml';
            document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
            if (!isExamPromoHidden()) setShowPromo(true);
        } catch { alert('다운로드 오류'); }
        setMaking(false);
    };

    if (!isLoggedIn) {
        return (
            <main className="rd-tl-main">
                <div className="rd-wrap">
                    <div className="rd-tl-gate">
                        {/* 화면 제목은 h2 — 이 페이지의 h1 은 page.tsx 의 sr-only 하나뿐이다.
                            여기까지 h1 이면 거의 같은 문장의 h1 이 한 페이지에 둘이 된다. */}
                        <h2>프린트와 비슷한 기출 찾기</h2>
                        <p>회원가입 후 이용할 수 있어요 (런칭 기념 무료).</p>
                        <Link href="/signup" className="rd-btn rd-btn-primary">무료로 가입하기</Link>
                    </div>
                </div>
            </main>
        );
    }

    return (
        <main className="rd-tl-main">
            <section className="rd-wrap rd-tl-intro">
                <p className="rd-kicker rd-tl-kicker">FROM YOUR CLASSROOM</p>
                <h2 className="rd-tl-h1">한 장의 프린트에서,<br/>새로운 연습으로.</h2>
                <p className="rd-lead rd-tl-lead">PDF를 올리고 연습할 문제를 잘라내세요. 비슷한 유형의 기존 기출문항을 찾아 시험지로 이어갑니다.</p>
                <div className="rd-tl-actions">
                    <span className="rd-pill is-accent">런칭 기간 회원 무료</span>
                    <button className="rd-btn rd-btn-tint" disabled={!totalSelected} onClick={()=>sendToExamCart(crops.flatMap(c=>c.selected),'프린트 유사 기출','print')}>선택 문항으로 시험지 만들기</button>
                </div>
                <div className="rd-tl-explain"><FeatureExplanation/></div>
            </section>

            <div className="rd-wrap">
            {/* 업로드 */}
            <label className="rd-tl-drop">
                <span className="rd-tl-drop-icon"><Upload size={22} /></span>
                <span className="rd-tl-drop-text">{loadingPdf ? 'PDF 여는 중…' : '학교 프린트 PDF 올리기'}</span>
                <input type="file" accept="application/pdf" onChange={onFile} className="hidden" />
            </label>

            <div className="rd-tl-split">
                {/* 왼쪽: PDF 페이지 + 크롭 */}
                <div className="rd-tl-left">
                    {numPages > 0 && (
                        <>
                            <p className="rd-tl-hint">
                                <span className="hidden sm:inline">문제 위를 마우스로 드래그하면 잘려서 오른쪽에 추가돼요. (← → 키로 페이지 이동)</span>
                                <span className="sm:hidden">문제 위를 <strong>길게 누른 뒤 드래그</strong>하면 잘려서 아래에 추가돼요.</span>
                            </p>
                            <PageNav cur={cur} total={numPages} go={goPage} />
                        </>
                    )}

                    {numPages > 0 && (
                        <div className="rd-tl-stage">
                            {/* 페이지 좌우 오버레이 버튼 — 캔버스에서 손을 떼지 않고 넘길 수 있게 */}
                            <button onClick={() => goPage(cur - 1)} disabled={cur === 0} aria-label="이전 페이지"
                                    className="rd-tl-flip is-prev">
                                <ChevronLeft size={20} />
                            </button>
                            <button onClick={() => goPage(cur + 1)} disabled={cur >= numPages - 1} aria-label="다음 페이지"
                                    className="rd-tl-flip is-next">
                                <ChevronRight size={20} />
                            </button>
                            <PageCanvas setRef={(el) => { canvasRef.current = el; }} onCrop={addCrop} />
                        </div>
                    )}

                    {numPages > 0 && <PageNav cur={cur} total={numPages} go={goPage} />}
                </div>

                {/* 오른쪽: 크롭 목록 + 매칭 */}
                <div className="rd-tl-right">
                    <div className="rd-tl-reshead">
                        <h2>잘라낸 문제 {crops.length}개</h2>
                        {totalSelected > 0 && <span className="rd-pill is-accent">변형 {totalSelected}개 채택</span>}
                    </div>
                    {crops.length === 0 && <p className="rd-tl-empty is-small">아직 없어요. 왼쪽에서 문제를 드래그하세요.</p>}
                    {crops.map((c, idx) => (
                        <div key={c.id} className="rd-tl-crop">
                            <div className="rd-tl-crop-head">
                                <span className="rd-tl-qno">{idx + 1}</span>
                                <img src={c.dataUrl} alt="crop" />
                                <button onClick={() => removeCrop(c.id)} className="rd-tl-del" aria-label="잘라낸 문제 삭제"><Trash2 size={16} /></button>
                            </div>
                            {!c.candidates ? (
                                <button onClick={() => findSimilar(c.id)} disabled={c.loading}
                                    className="rd-btn rd-btn-tint rd-btn-block rd-tl-find">
                                    {c.loading ? <><Loader2 size={16} className="animate-spin" /> 분석 중…</> : <><Wand2 size={16} /> 변형문제 찾기</>}
                                </button>
                            ) : (
                                <div className="rd-tl-cands-wrap">
                                    {c.reading?.unit && <p className="rd-tl-read">인식: {c.reading.unit}{c.reading.difficulty ? ` · 난이도 ${c.reading.difficulty}` : ''} {c.reading.concepts?.slice(0, 2).join(', ')}</p>}
                                    {c.widened && (
                                        <p className="rd-alert rd-tl-note">
                                            ‘{c.reading?.unit}’ 단원 문제가 아직 DB에 없어, <strong>같은 과목의 다른 단원</strong>에서 찾았어요. 유형이 다를 수 있습니다.
                                        </p>
                                    )}
                                    {(c.candidates || []).length === 0 && (
                                        <p className="rd-tl-note is-gray">
                                            비슷한 문제를 찾지 못했어요. 영역을 다시 잘라보거나, 다른 문제로 시도해 주세요.
                                        </p>
                                    )}
                                    <p className="rd-tl-pickhint">채택할 유사 기출문제를 고르세요 ({c.selected.length}개 선택)</p>
                                    {/* 예전엔 후보 전체가 하나의 <button> 이라, 문제를 읽으려고 누르면
                                        선택이 토글돼 버렸다. 게다가 미리보기가 max-h-28 로 잘려 문제 아래가
                                        아예 안 보였다 → 선택 버튼과 본문을 분리하고 펼치기를 붙인다. */}
                                    <div className="rd-tl-cands">
                                        {(c.candidates || []).map((q: any) => {
                                            const on = c.selected.includes(q.id);
                                            const xml = c.contents[q.id];
                                            const key = `${c.id}:${q.id}`;
                                            const open = !!expanded[key];
                                            return (
                                                <div key={q.id} className={`rd-tl-cand${on ? ' is-on' : ''}`}>
                                                    <div className="rd-tl-cand-head">
                                                        <button onClick={() => toggleSel(c.id, q.id)} aria-label={on ? '선택 해제' : '선택'}
                                                            className="rd-tl-check">
                                                            <span>{on && <Check size={14} />}</span>
                                                        </button>
                                                        <span className="rd-tl-cand-meta">
                                                            {q.unit} · 난이도 {q.difficulty}{q.similarity ? ` · ${Math.round(q.similarity * 100)}%` : ''}
                                                        </span>
                                                        <button onClick={() => setExpanded((p) => ({ ...p, [key]: !open }))}
                                                            className="rd-tl-expand">
                                                            {open ? <><Minimize2 size={14} /> 접기</> : <><Maximize2 size={14} /> 전체보기</>}
                                                        </button>
                                                    </div>
                                                    <div className={`rd-tl-cand-body${open ? ' is-open' : ''}`}>
                                                        {xml
                                                            ? <QuestionRenderer xmlContent={xml} externalImages={c.images[q.id] || []} displayMode="question" showDownloadAction={false} className="border-none shadow-none p-0 !text-xs" />
                                                            : <span className="rd-tl-muted">로딩…</span>}
                                                        {!open && xml && (
                                                            <div className="rd-tl-fade" />
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                            {c.error && <p className="rd-tl-err is-small">{c.error}</p>}
                        </div>
                    ))}

                    {crops.length > 0 && (
                        <button onClick={makeHwp} disabled={making || totalSelected === 0}
                            className="rd-btn rd-btn-primary rd-btn-block rd-tl-hwp">
                            {making ? <><Loader2 size={16} className="animate-spin" /> 만드는 중…</> : <><Download size={16} /> 변형문제 한글파일 ({totalSelected})</>}
                        </button>
                    )}
                </div>
            </div>
            </div>

            {showPromo && <ExamPromoModal onClose={() => setShowPromo(false)} />}
        </main>
    );
}

function PageNav({ cur, total, go }: { cur: number; total: number; go: (n: number) => void }) {
    return (
        <div className="rd-tl-pager">
            <button onClick={() => go(cur - 1)} disabled={cur === 0}
                className="rd-btn rd-btn-gray rd-btn-sm">
                <ChevronLeft size={16} /> 이전
            </button>
            <div className="rd-tl-pageno">
                <input type="number" min={1} max={total} value={cur + 1}
                    onChange={(e) => go(Number(e.target.value) - 1)}
                    className="rd-input [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                <span>/ {total}</span>
            </div>
            <button onClick={() => go(cur + 1)} disabled={cur >= total - 1}
                className="rd-btn rd-btn-gray rd-btn-sm">
                다음 <ChevronRight size={16} />
            </button>
        </div>
    );
}

/** PDF 한 페이지 캔버스 + 드래그 크롭 오버레이 (터치: 길게 눌러 크롭, 짧은 스와이프는 스크롤) */
function PageCanvas({ setRef, onCrop }: { setRef: (el: HTMLCanvasElement | null) => void; onCrop: (sx: number, sy: number, sw: number, sh: number) => void }) {
    const wrapRef = useRef<HTMLDivElement>(null);
    const [box, setBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
    const start = useRef<{ x: number; y: number } | null>(null);
    // 터치 롱프레스 상태 (native listener에서 최신값 참조용 ref들)
    const boxRef = useRef(box); boxRef.current = box;
    const onCropRef = useRef(onCrop); onCropRef.current = onCrop;

    const ptXY = (clientX: number, clientY: number) => {
        const r = wrapRef.current!.getBoundingClientRect();
        return { x: clientX - r.left, y: clientY - r.top };
    };
    const pt = (e: React.MouseEvent) => ptXY(e.clientX, e.clientY);

    // 모바일: 짧은 터치/스와이프 = 스크롤 유지, 길게(0.35s) 누르면 크롭 모드 진입
    // (touchmove preventDefault가 필요해 passive:false native 리스너로 부착)
    useEffect(() => {
        const el = wrapRef.current;
        if (!el) return;
        let timer: any = null;
        let touchOrigin: { x: number; y: number } | null = null;
        let cropping = false;

        const onTS = (e: TouchEvent) => {
            if (e.touches.length !== 1) return;
            const t = e.touches[0];
            touchOrigin = { x: t.clientX, y: t.clientY };
            cropping = false;
            timer = setTimeout(() => {
                cropping = true;
                const p = ptXY(t.clientX, t.clientY);
                start.current = p;
                setBox({ ...p, w: 0, h: 0 });
                (navigator as any).vibrate?.(30);
            }, 350);
        };
        const onTM = (e: TouchEvent) => {
            const t = e.touches[0];
            if (!cropping) {
                // 롱프레스 전에 크게 움직이면 스크롤 의도 → 크롭 취소 (브라우저가 평소처럼 스크롤)
                if (touchOrigin && (Math.abs(t.clientX - touchOrigin.x) > 10 || Math.abs(t.clientY - touchOrigin.y) > 10)) clearTimeout(timer);
                return;
            }
            e.preventDefault(); // 크롭 중엔 스크롤 차단
            if (!start.current) return;
            const p = ptXY(t.clientX, t.clientY);
            setBox({ x: Math.min(start.current.x, p.x), y: Math.min(start.current.y, p.y), w: Math.abs(p.x - start.current.x), h: Math.abs(p.y - start.current.y) });
        };
        const onTE = () => {
            clearTimeout(timer);
            if (cropping) {
                const b = boxRef.current;
                if (b && b.w > 12 && b.h > 12) onCropRef.current(b.x, b.y, b.w, b.h);
            }
            cropping = false;
            start.current = null;
            setBox(null);
        };

        el.addEventListener('touchstart', onTS, { passive: true });
        el.addEventListener('touchmove', onTM, { passive: false });
        el.addEventListener('touchend', onTE);
        el.addEventListener('touchcancel', onTE);
        return () => {
            clearTimeout(timer);
            el.removeEventListener('touchstart', onTS);
            el.removeEventListener('touchmove', onTM);
            el.removeEventListener('touchend', onTE);
            el.removeEventListener('touchcancel', onTE);
        };
    }, []);

    return (
        <div ref={wrapRef} className="relative inline-block w-full select-none [-webkit-touch-callout:none]"
            onMouseDown={(e) => { start.current = pt(e); setBox({ ...pt(e), w: 0, h: 0 }); }}
            onMouseMove={(e) => { if (!start.current) return; const p = pt(e); setBox({ x: Math.min(start.current.x, p.x), y: Math.min(start.current.y, p.y), w: Math.abs(p.x - start.current.x), h: Math.abs(p.y - start.current.y) }); }}
            onMouseUp={() => { if (box && box.w > 12 && box.h > 12) onCrop(box.x, box.y, box.w, box.h); start.current = null; setBox(null); }}
            onMouseLeave={() => { start.current = null; setBox(null); }}>
            <canvas ref={setRef} className="rd-tl-canvas" />
            {box && <div className="rd-tl-cropbox" style={{ left: box.x, top: box.y, width: box.w, height: box.h }} />}
        </div>
    );
}
