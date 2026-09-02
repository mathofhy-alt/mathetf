"use client";
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
            <main className="max-w-2xl mx-auto px-4 py-16 text-center">
                {/* 화면 제목은 h2 — 이 페이지의 h1 은 page.tsx 의 sr-only 하나뿐이다.
                    여기까지 h1 이면 거의 같은 문장의 h1 이 한 페이지에 둘이 된다. */}
                <h2 className="text-2xl font-black mb-3">학교프린트 변형만들기</h2>
                <p className="text-slate-500 mb-6">회원가입 후 이용할 수 있어요 (런칭 기념 무료).</p>
                <Link href="/signup" className="inline-block bg-[#497AB7] text-white font-extrabold px-6 py-3 rounded-xl">무료로 가입하기 →</Link>
            </main>
        );
    }

    return (
        <main className="max-w-6xl mx-auto px-4 py-8">
            <div className="mb-5">
                <div className="inline-flex items-center gap-1.5 bg-[#2E9E5B]/12 border border-[#2E9E5B]/30 text-[#2E9E5B] text-xs font-bold px-3 py-1 rounded-full mb-2"><Crop size={12} /> 학교프린트 변형만들기</div>
                <h2 className="text-2xl sm:text-3xl font-black">학교 프린트로 변형문제 만들기</h2>
                <p className="text-slate-600 text-base mt-2 break-keep">프린트(PDF)를 올리고 문제를 <strong className="text-[#2E9E5B]">드래그로 잘라내면</strong>, 같은 유형 변형문제를 찾아 한글파일로 만들어 드려요. <strong className="text-[#2E9E5B]">🎉 런칭 기념 무료</strong></p>
            </div>

            {/* 업로드 */}
            <label className="flex items-center justify-center gap-2 border-2 border-dashed border-slate-300 rounded-2xl py-8 cursor-pointer hover:border-[#2E9E5B] transition-colors bg-white">
                <Upload size={18} className="text-slate-400" />
                <span className="text-sm text-slate-500 font-medium">{loadingPdf ? 'PDF 여는 중…' : '학교 프린트 PDF 올리기'}</span>
                <input type="file" accept="application/pdf" onChange={onFile} className="hidden" />
            </label>

            <div className="grid lg:grid-cols-[1fr_440px] gap-5 mt-5">
                {/* 왼쪽: PDF 페이지 + 크롭 */}
                <div className="space-y-3">
                    {numPages > 0 && (
                        <>
                            <p className="text-xs text-slate-400">
                                <span className="hidden sm:inline">📌 문제 위를 마우스로 드래그하면 잘려서 오른쪽에 추가돼요. (← → 키로 페이지 이동)</span>
                                <span className="sm:hidden">📌 문제 위를 <strong className="text-[#2E9E5B]">길게 누른 뒤 드래그</strong>하면 잘려서 아래에 추가돼요.</span>
                            </p>
                            <PageNav cur={cur} total={numPages} go={goPage} />
                        </>
                    )}

                    {numPages > 0 && (
                        <div className="relative">
                            {/* 페이지 좌우 오버레이 버튼 — 캔버스에서 손을 떼지 않고 넘길 수 있게 */}
                            <button onClick={() => goPage(cur - 1)} disabled={cur === 0} aria-label="이전 페이지"
                                    className="absolute left-2 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-white/90 border border-slate-200 shadow-md flex items-center justify-center text-slate-600 hover:bg-white hover:text-[#2E9E5B] disabled:opacity-0 disabled:pointer-events-none transition">
                                <ChevronLeft size={20} />
                            </button>
                            <button onClick={() => goPage(cur + 1)} disabled={cur >= numPages - 1} aria-label="다음 페이지"
                                    className="absolute right-2 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-white/90 border border-slate-200 shadow-md flex items-center justify-center text-slate-600 hover:bg-white hover:text-[#2E9E5B] disabled:opacity-0 disabled:pointer-events-none transition">
                                <ChevronRight size={20} />
                            </button>
                            <PageCanvas setRef={(el) => { canvasRef.current = el; }} onCrop={addCrop} />
                        </div>
                    )}

                    {numPages > 0 && <PageNav cur={cur} total={numPages} go={goPage} />}
                </div>

                {/* 오른쪽: 크롭 목록 + 매칭 */}
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <h2 className="font-extrabold">잘라낸 문제 {crops.length}개</h2>
                        {totalSelected > 0 && <span className="text-xs text-[#2E9E5B] font-bold">변형 {totalSelected}개 채택</span>}
                    </div>
                    {crops.length === 0 && <p className="text-sm text-slate-400">아직 없어요. 왼쪽에서 문제를 드래그하세요.</p>}
                    {crops.map((c, idx) => (
                        <div key={c.id} className="bg-white rounded-xl border border-slate-200 shadow-sm p-3">
                            <div className="flex items-start gap-2">
                                <span className="text-xs font-extrabold text-slate-500 mt-1">#{idx + 1}</span>
                                <img src={c.dataUrl} alt="crop" className="flex-1 rounded border border-slate-100 max-h-32 object-contain" />
                                <button onClick={() => removeCrop(c.id)} className="text-slate-300 hover:text-rose-500"><Trash2 size={15} /></button>
                            </div>
                            {!c.candidates ? (
                                <button onClick={() => findSimilar(c.id)} disabled={c.loading}
                                    className="w-full mt-2 py-2 rounded-lg text-sm font-bold text-white bg-[#2E9E5B] hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-1.5">
                                    {c.loading ? <><Loader2 size={14} className="animate-spin" /> 분석 중…</> : <><Wand2 size={14} /> 변형문제 찾기</>}
                                </button>
                            ) : (
                                <div className="mt-2">
                                    {c.reading?.unit && <p className="text-[11px] text-slate-400 mb-1">인식: {c.reading.unit}{c.reading.difficulty ? ` · 난이도 ${c.reading.difficulty}` : ''} {c.reading.concepts?.slice(0, 2).join(', ')}</p>}
                                    {c.widened && (
                                        <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 mb-1.5">
                                            ‘{c.reading?.unit}’ 단원 문제가 아직 DB에 없어, <strong>같은 과목의 다른 단원</strong>에서 찾았어요. 유형이 다를 수 있습니다.
                                        </p>
                                    )}
                                    {(c.candidates || []).length === 0 && (
                                        <p className="text-[11px] text-slate-500 bg-slate-50 border border-slate-200 rounded px-2 py-1 mb-1.5">
                                            비슷한 문제를 찾지 못했어요. 영역을 다시 잘라보거나, 다른 문제로 시도해 주세요.
                                        </p>
                                    )}
                                    <p className="text-[11px] text-slate-500 mb-1.5">채택할 변형문제를 고르세요 ({c.selected.length}개 선택)</p>
                                    {/* 예전엔 후보 전체가 하나의 <button> 이라, 문제를 읽으려고 누르면
                                        선택이 토글돼 버렸다. 게다가 미리보기가 max-h-28 로 잘려 문제 아래가
                                        아예 안 보였다 → 선택 버튼과 본문을 분리하고 펼치기를 붙인다. */}
                                    <div className="space-y-2 max-h-[70vh] overflow-auto pr-1">
                                        {(c.candidates || []).map((q: any) => {
                                            const on = c.selected.includes(q.id);
                                            const xml = c.contents[q.id];
                                            const key = `${c.id}:${q.id}`;
                                            const open = !!expanded[key];
                                            return (
                                                <div key={q.id} className={`rounded-lg border ${on ? 'border-[#2E9E5B] bg-[#2E9E5B]/5' : 'border-slate-200 bg-white'}`}>
                                                    <div className="flex items-center gap-2 p-2 border-b border-slate-100">
                                                        <button onClick={() => toggleSel(c.id, q.id)} aria-label={on ? '선택 해제' : '선택'}
                                                            className={`shrink-0 w-5 h-5 rounded border flex items-center justify-center transition-colors ${on ? 'bg-[#2E9E5B] border-[#2E9E5B] text-white' : 'bg-white border-slate-300 hover:border-[#2E9E5B]'}`}>
                                                            {on && <Check size={13} />}
                                                        </button>
                                                        <span className="text-[11px] text-slate-500 flex-1 truncate">
                                                            {q.unit} · 난이도 {q.difficulty}{q.similarity ? ` · ${Math.round(q.similarity * 100)}%` : ''}
                                                        </span>
                                                        <button onClick={() => setExpanded((p) => ({ ...p, [key]: !open }))}
                                                            className="shrink-0 text-[11px] font-bold text-slate-500 hover:text-[#2E9E5B] flex items-center gap-1">
                                                            {open ? <><Minimize2 size={12} /> 접기</> : <><Maximize2 size={12} /> 전체보기</>}
                                                        </button>
                                                    </div>
                                                    <div className={`relative px-2 py-1.5 ${open ? 'max-h-[60vh] overflow-auto' : 'max-h-32 overflow-hidden'}`}>
                                                        {xml
                                                            ? <QuestionRenderer xmlContent={xml} externalImages={c.images[q.id] || []} displayMode="question" showDownloadAction={false} className="border-none shadow-none p-0 !text-xs" />
                                                            : <span className="text-xs text-slate-300">로딩…</span>}
                                                        {!open && xml && (
                                                            <div className="absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-white to-transparent pointer-events-none" />
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                            {c.error && <p className="text-xs text-rose-500 mt-1">{c.error}</p>}
                        </div>
                    ))}

                    {crops.length > 0 && (
                        <button onClick={makeHwp} disabled={making || totalSelected === 0}
                            className="w-full py-3 rounded-xl font-extrabold text-white bg-gradient-to-r from-[#2E9E5B] to-[#46C77D] hover:opacity-90 disabled:opacity-40 flex items-center justify-center gap-2 sticky bottom-3">
                            {making ? <><Loader2 size={16} className="animate-spin" /> 만드는 중…</> : <><Download size={16} /> 변형문제 한글파일 ({totalSelected})</>}
                        </button>
                    )}
                </div>
            </div>

            {showPromo && <ExamPromoModal onClose={() => setShowPromo(false)} />}
        </main>
    );
}

function PageNav({ cur, total, go }: { cur: number; total: number; go: (n: number) => void }) {
    return (
        <div className="flex items-center justify-center gap-2">
            <button onClick={() => go(cur - 1)} disabled={cur === 0}
                className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-sm font-bold text-slate-600 hover:border-[#2E9E5B] hover:text-[#2E9E5B] disabled:opacity-40 disabled:pointer-events-none flex items-center gap-1">
                <ChevronLeft size={15} /> 이전
            </button>
            <div className="flex items-center gap-1 text-sm font-bold text-slate-600">
                <input type="number" min={1} max={total} value={cur + 1}
                    onChange={(e) => go(Number(e.target.value) - 1)}
                    className="w-14 text-center border border-slate-200 rounded-lg py-1.5 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                <span className="text-slate-400">/ {total}</span>
            </div>
            <button onClick={() => go(cur + 1)} disabled={cur >= total - 1}
                className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-sm font-bold text-slate-600 hover:border-[#2E9E5B] hover:text-[#2E9E5B] disabled:opacity-40 disabled:pointer-events-none flex items-center gap-1">
                다음 <ChevronRight size={15} />
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
            <canvas ref={setRef} className="w-full h-auto rounded-lg border border-slate-200 shadow-sm block" />
            {box && <div className="absolute border-2 border-[#2E9E5B] bg-[#2E9E5B]/15 pointer-events-none" style={{ left: box.x, top: box.y, width: box.w, height: box.h }} />}
        </div>
    );
}
