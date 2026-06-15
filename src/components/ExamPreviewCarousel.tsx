"use client";
import React, { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * 시험지 문제 미리보기 캐러셀 — 한 장씩 보여주고 화살표로 앞뒤 이동.
 * SEO: 모든 이미지를 DOM에 렌더(크롤 가능)하고 CSS로 현재 장만 표시한다.
 */
export default function ExamPreviewCarousel({ images, label }: { images: string[]; label: string }) {
    const [i, setI] = useState(0);
    const n = images.length;
    if (n === 0) return null;

    return (
        <div>
            {/* A4 세로비율(210:297)로 영역 고정 → 페이지 넘길 때/로딩 중에도 높이가 안 변해 본문 출렁임 없음.
                모든 이미지를 미리 로드(eager) + 겹쳐두고(absolute) 현재 장만 보이게 → 전환 즉시, 레이아웃 시프트 0. */}
            <div className="relative w-full aspect-[210/297] bg-slate-50 rounded-lg overflow-hidden border border-slate-100">
                {images.map((url, idx) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                        key={idx}
                        src={url}
                        alt={`${label} 수학 기출문제 미리보기 ${idx + 1}페이지`}
                        className={`absolute inset-0 w-full h-full object-contain transition-opacity duration-150 ${idx === i ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                        loading="eager"
                    />
                ))}

                {n > 1 && (
                    <>
                        <button
                            type="button"
                            onClick={() => setI((p) => (p - 1 + n) % n)}
                            aria-label="이전 페이지"
                            className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center rounded-full bg-white/90 hover:bg-white shadow-md text-slate-700 transition-colors"
                        >
                            <ChevronLeft size={20} />
                        </button>
                        <button
                            type="button"
                            onClick={() => setI((p) => (p + 1) % n)}
                            aria-label="다음 페이지"
                            className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center rounded-full bg-white/90 hover:bg-white shadow-md text-slate-700 transition-colors"
                        >
                            <ChevronRight size={20} />
                        </button>
                        <span className="absolute bottom-2 left-1/2 -translate-x-1/2 text-xs font-bold text-white bg-black/55 px-2.5 py-1 rounded-full">
                            {i + 1} / {n}
                        </span>
                    </>
                )}
            </div>

            {n > 1 && (
                <div className="flex items-center justify-center gap-1.5 mt-3">
                    {images.map((_, idx) => (
                        <button
                            key={idx}
                            type="button"
                            onClick={() => setI(idx)}
                            aria-label={`${idx + 1}페이지로`}
                            className={`h-1.5 rounded-full transition-all ${idx === i ? 'w-5 bg-[#497AB7]' : 'w-1.5 bg-slate-300 hover:bg-slate-400'}`}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
