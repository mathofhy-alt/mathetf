"use client";
import React, { useRef, useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Crop, Loader2, Upload, Wand2, Check, Download, Trash2 } from 'lucide-react';
import QuestionRenderer from '@/components/QuestionRenderer';
import ExamPromoModal, { isExamPromoHidden } from '@/components/ExamPromoModal';

interface CropItem {
    id: string;
    dataUrl: string;
    loading: boolean;
    reading?: { unit: string | null; concepts: string[] };
    candidates?: any[];                 // 유사문제 후보
    contents: Record<string, string>;   // id -> content_xml
    images: Record<string, any[]>;      // id -> 이미지행
    selected: string[];                 // 채택한 유사문제 id
    error?: string;
}

let _cid = 0;

export default function PrintTransformClient({ isLoggedIn }: { isLoggedIn: boolean }) {
    const [pages, setPages] = useState<{ w: number; h: number }[]>([]);
    const [loadingPdf, setLoadingPdf] = useState(false);
    const [crops, setCrops] = useState<CropItem[]>([]);
    const [making, setMaking] = useState(false);
    const [showPromo, setShowPromo] = useState(false);
    const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([]);
    const pdfRef = useRef<any>(null);

    // PDF 업로드 → 렌더
    const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setLoadingPdf(true); setPages([]); setCrops([]); canvasRefs.current = [];
        try {
            const pdfjs: any = await import('pdfjs-dist');
            pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'; // public 정적 파일 (webpack 번들 회피)
            const buf = await file.arrayBuffer();
            const doc = await pdfjs.getDocument({ data: buf }).promise;
            pdfRef.current = doc;
            const dims: { w: number; h: number }[] = [];
            for (let i = 1; i <= doc.numPages; i++) {
                const page = await doc.getPage(i);
                const vp = page.getViewport({ scale: 1.5 });
                dims.push({ w: vp.width, h: vp.height });
            }
            setPages(dims);
            // 다음 틱에 canvas 렌더
            setTimeout(async () => {
                for (let i = 1; i <= doc.numPages; i++) {
                    const cv = canvasRefs.current[i - 1];
                    if (!cv) continue;
                    const page = await doc.getPage(i);
                    const vp = page.getViewport({ scale: 1.5 });
                    cv.width = vp.width; cv.height = vp.height;
                    const ctx = cv.getContext('2d');
                    if (ctx) await page.render({ canvasContext: ctx, viewport: vp }).promise;
                }
            }, 50);
        } catch (err) {
            alert('PDF를 여는 데 실패했어요.');
        }
        setLoadingPdf(false);
    };

    // 페이지에서 영역 드래그 → 크롭 추가
    const addCrop = (pageIdx: number, sx: number, sy: number, sw: number, sh: number) => {
        const cv = canvasRefs.current[pageIdx];
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
                ...c, loading: false, reading: j.reading, candidates: cands,
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
                <h1 className="text-2xl font-black mb-3">학교프린트 변형만들기</h1>
                <p className="text-slate-500 mb-6">회원가입 후 이용할 수 있어요 (런칭 기념 무료).</p>
                <Link href="/signup" className="inline-block bg-[#497AB7] text-white font-extrabold px-6 py-3 rounded-xl">무료로 가입하기 →</Link>
            </main>
        );
    }

    return (
        <main className="max-w-6xl mx-auto px-4 py-8">
            <div className="mb-5">
                <div className="inline-flex items-center gap-1.5 bg-[#2E9E5B]/12 border border-[#2E9E5B]/30 text-[#2E9E5B] text-xs font-bold px-3 py-1 rounded-full mb-2"><Crop size={12} /> 학교프린트 변형만들기</div>
                <h1 className="text-2xl sm:text-3xl font-black">학교 프린트로 변형문제 만들기</h1>
                <p className="text-slate-600 text-base mt-2 break-keep">프린트(PDF)를 올리고 문제를 <strong className="text-[#2E9E5B]">드래그로 잘라내면</strong>, 같은 유형 변형문제를 찾아 한글파일로 만들어 드려요. <strong className="text-[#2E9E5B]">🎉 런칭 기념 무료</strong></p>
            </div>

            {/* 업로드 */}
            <label className="flex items-center justify-center gap-2 border-2 border-dashed border-slate-300 rounded-2xl py-8 cursor-pointer hover:border-[#2E9E5B] transition-colors bg-white">
                <Upload size={18} className="text-slate-400" />
                <span className="text-sm text-slate-500 font-medium">{loadingPdf ? 'PDF 여는 중…' : '학교 프린트 PDF 올리기'}</span>
                <input type="file" accept="application/pdf" onChange={onFile} className="hidden" />
            </label>

            <div className="grid lg:grid-cols-[1fr_380px] gap-5 mt-5">
                {/* 왼쪽: PDF 페이지 + 크롭 */}
                <div className="space-y-4">
                    {pages.length > 0 && <p className="text-xs text-slate-400">📌 문제 위를 마우스로 드래그하면 잘려서 오른쪽에 추가돼요.</p>}
                    {pages.map((pg, i) => (
                        <PageCanvas key={i} idx={i} dims={pg}
                            setRef={(el) => { canvasRefs.current[i] = el; }}
                            onCrop={(sx, sy, sw, sh) => addCrop(i, sx, sy, sw, sh)} />
                    ))}
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
                                    {c.reading?.unit && <p className="text-[11px] text-slate-400 mb-1">인식: {c.reading.unit} {c.reading.concepts?.slice(0, 2).join(', ')}</p>}
                                    <p className="text-[11px] text-slate-500 mb-1.5">채택할 변형문제를 고르세요 ({c.selected.length}개 선택)</p>
                                    <div className="space-y-1.5 max-h-72 overflow-auto">
                                        {(c.candidates || []).map((q: any) => {
                                            const on = c.selected.includes(q.id);
                                            const xml = c.contents[q.id];
                                            return (
                                                <button key={q.id} onClick={() => toggleSel(c.id, q.id)}
                                                    className={`block w-full text-left rounded-lg border p-2 ${on ? 'border-[#2E9E5B] bg-[#2E9E5B]/5' : 'border-slate-200'}`}>
                                                    <div className="flex items-center gap-1.5 mb-1">
                                                        <span className={`w-4 h-4 rounded flex items-center justify-center ${on ? 'bg-[#2E9E5B] text-white' : 'bg-slate-100'}`}>{on && <Check size={11} />}</span>
                                                        <span className="text-[11px] text-slate-500">{q.unit} · 난이도 {q.difficulty} · {q.similarity ? Math.round(q.similarity * 100) + '%' : ''}</span>
                                                    </div>
                                                    {xml ? <div className="max-h-28 overflow-hidden text-xs"><QuestionRenderer xmlContent={xml} externalImages={c.images[q.id] || []} displayMode="question" showDownloadAction={false} className="border-none shadow-none p-0 !text-xs" /></div> : <span className="text-xs text-slate-300">로딩…</span>}
                                                </button>
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

/** PDF 한 페이지 캔버스 + 드래그 크롭 오버레이 */
function PageCanvas({ idx, dims, setRef, onCrop }: { idx: number; dims: { w: number; h: number }; setRef: (el: HTMLCanvasElement | null) => void; onCrop: (sx: number, sy: number, sw: number, sh: number) => void }) {
    const wrapRef = useRef<HTMLDivElement>(null);
    const [box, setBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
    const start = useRef<{ x: number; y: number } | null>(null);

    const pt = (e: React.MouseEvent) => {
        const r = wrapRef.current!.getBoundingClientRect();
        return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    return (
        <div ref={wrapRef} className="relative inline-block w-full select-none"
            onMouseDown={(e) => { start.current = pt(e); setBox({ ...pt(e), w: 0, h: 0 }); }}
            onMouseMove={(e) => { if (!start.current) return; const p = pt(e); setBox({ x: Math.min(start.current.x, p.x), y: Math.min(start.current.y, p.y), w: Math.abs(p.x - start.current.x), h: Math.abs(p.y - start.current.y) }); }}
            onMouseUp={() => { if (box && box.w > 12 && box.h > 12) onCrop(box.x, box.y, box.w, box.h); start.current = null; setBox(null); }}
            onMouseLeave={() => { start.current = null; setBox(null); }}>
            <canvas ref={setRef} className="w-full h-auto rounded-lg border border-slate-200 shadow-sm block" />
            {box && <div className="absolute border-2 border-[#2E9E5B] bg-[#2E9E5B]/15 pointer-events-none" style={{ left: box.x, top: box.y, width: box.w, height: box.h }} />}
        </div>
    );
}
