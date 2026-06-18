"use client";
import React, { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';

// react-joyride 는 SSR 불가 → 클라이언트에서만 로드. (v2: 모듈 자체가 컴포넌트/ default)
const Joyride = dynamic(() => import('react-joyride').then((m: any) => m.default || m), { ssr: false });

export interface TourStep {
    target: string;
    title: string;
    body: string;
    advanceOn?: 'click' | 'next';
    placement?: 'top' | 'bottom' | 'left' | 'right' | 'center' | 'auto';
}

interface Props {
    steps: TourStep[];
    run: boolean;
    onClose: () => void;
}

/** 브랜드 톤 커스텀 말풍선 */
function TourTooltip(props: any) {
    const { index, size, step, backProps, closeProps, primaryProps, skipProps, tooltipProps, isLastStep } = props;
    return (
        <div
            {...tooltipProps}
            className="w-[340px] max-w-[90vw] bg-white rounded-2xl shadow-2xl overflow-hidden border border-slate-100"
        >
            {/* 상단 그라데이션 액센트 */}
            <div className="h-1.5 w-full bg-gradient-to-r from-[#497AB7] via-[#5CC6C3] to-[#B7D1EA]" />

            <div className="p-5">
                <div className="flex items-start justify-between gap-3 mb-2">
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-extrabold text-[#3AADA9] bg-[#5CC6C3]/12 border border-[#5CC6C3]/30 px-2.5 py-1 rounded-full">
                        STEP {index + 1} / {size}
                    </span>
                    <button
                        {...closeProps}
                        aria-label="닫기"
                        className="text-slate-300 hover:text-slate-500 transition-colors -mt-1 -mr-1 p-1 rounded-full hover:bg-slate-100"
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                    </button>
                </div>

                {step.title && (
                    <h3 className="text-base font-extrabold text-[#1E2D4F] mb-1.5 break-keep">{step.title}</h3>
                )}
                <p className="text-[13px] text-slate-500 leading-relaxed break-keep">{step.content}</p>

                {/* 진행 점 */}
                <div className="flex items-center gap-1.5 mt-4 mb-3">
                    {Array.from({ length: size }).map((_, i) => (
                        <span
                            key={i}
                            className={`h-1.5 rounded-full transition-all ${i === index ? 'w-5 bg-[#497AB7]' : 'w-1.5 bg-slate-200'}`}
                        />
                    ))}
                </div>

                <div className="flex items-center justify-between">
                    <button {...skipProps} className="text-xs text-slate-400 hover:text-slate-600 transition-colors">
                        그만보기
                    </button>
                    <div className="flex items-center gap-2">
                        {index > 0 && (
                            <button {...backProps} className="px-3 py-2 rounded-xl text-sm font-bold text-slate-500 hover:bg-slate-100 transition-colors">
                                이전
                            </button>
                        )}
                        <button
                            {...primaryProps}
                            className="px-5 py-2 rounded-xl text-sm font-extrabold text-white bg-gradient-to-r from-[#497AB7] to-[#3AADA9] hover:opacity-90 shadow-md shadow-[#497AB7]/20 transition-opacity"
                        >
                            {isLastStep ? '완료' : '다음'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function GuidedTour({ steps, run, onClose }: Props) {
    const [index, setIndex] = useState(0);
    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
        if (run) setIndex(0);
    }, [run]);

    useEffect(() => {
        setIsMobile(typeof window !== 'undefined' && window.innerWidth < 768);
    }, []);

    // 모바일: 스포트라이트(요소 위치 어긋남) 대신 중앙 단계 카드로 안내
    if (run && isMobile && steps.length > 0) {
        const i = Math.min(index, steps.length - 1);
        const step = steps[i];
        const isLast = i >= steps.length - 1;
        return (
            <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-5" role="dialog" aria-modal="true">
                <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden">
                    <div className="h-1.5 w-full bg-gradient-to-r from-[#497AB7] via-[#5CC6C3] to-[#B7D1EA]" />
                    <div className="p-5">
                        <div className="flex items-start justify-between gap-3 mb-2">
                            <span className="inline-flex items-center gap-1.5 text-[11px] font-extrabold text-[#3AADA9] bg-[#5CC6C3]/12 border border-[#5CC6C3]/30 px-2.5 py-1 rounded-full">
                                STEP {i + 1} / {steps.length}
                            </span>
                            <button onClick={onClose} aria-label="닫기" className="text-slate-300 hover:text-slate-500 -mt-1 -mr-1 p-1 rounded-full hover:bg-slate-100">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                            </button>
                        </div>
                        {step.title && <h3 className="text-base font-extrabold text-[#1E2D4F] mb-1.5 break-keep">{step.title}</h3>}
                        <p className="text-[13px] text-slate-500 leading-relaxed break-keep">{step.body}</p>
                        <div className="flex items-center gap-1.5 mt-4 mb-3">
                            {steps.map((_, k) => (
                                <span key={k} className={`h-1.5 rounded-full transition-all ${k === i ? 'w-5 bg-[#497AB7]' : 'w-1.5 bg-slate-200'}`} />
                            ))}
                        </div>
                        <div className="flex items-center justify-between">
                            <button onClick={onClose} className="text-xs text-slate-400 hover:text-slate-600">그만보기</button>
                            <div className="flex items-center gap-2">
                                {i > 0 && (
                                    <button onClick={() => setIndex(i - 1)} className="px-3 py-2 rounded-xl text-sm font-bold text-slate-500 hover:bg-slate-100">이전</button>
                                )}
                                <button onClick={() => (isLast ? onClose() : setIndex(i + 1))} className="px-5 py-2 rounded-xl text-sm font-extrabold text-white bg-gradient-to-r from-[#497AB7] to-[#3AADA9] hover:opacity-90 shadow-md shadow-[#497AB7]/20">
                                    {isLast ? '완료' : '다음'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    const joyrideSteps = steps.map((s) => ({
        target: s.target,
        title: s.title,
        content: s.body,
        placement: s.placement || 'auto',
        disableBeacon: true,
        spotlightClicks: false, // 실제 요소 클릭 가로채지 않음 (진행은 '다음' 버튼)
    } as any));

    return (
        <Joyride
            steps={joyrideSteps}
            run={run && index < steps.length}
            stepIndex={Math.min(index, Math.max(0, steps.length - 1))}
            continuous
            disableOverlayClose
            showSkipButton
            scrollToFirstStep
            spotlightPadding={8}
            tooltipComponent={TourTooltip}
            floaterProps={{ disableAnimation: false }}
            styles={{
                options: {
                    overlayColor: 'rgba(15, 23, 42, 0.55)',
                    primaryColor: '#497AB7',
                    zIndex: 10000,
                },
                spotlight: { borderRadius: 14 },
            }}
            callback={(data: any) => {
                const { action, status, type } = data;
                if (status === 'finished' || status === 'skipped' || action === 'close') {
                    onClose();
                    return;
                }
                if (type === 'step:after') {
                    if (action === 'next') setIndex((i) => i + 1);
                    else if (action === 'prev') setIndex((i) => Math.max(0, i - 1));
                }
            }}
        />
    );
}
