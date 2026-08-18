"use client";

import React from 'react';
import { PencilRuler, X, PlayCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';

// 사용법 영상 — 시험지출제에서 학교 시험지 다운로드하는 법 (사용자 제공, 7/24)
const GUIDE_VIDEO_URL = 'https://www.youtube.com/watch?v=2Yt94Ps8rk8&t=5s';

const DISMISS_KEY = 'mathetf_teacher_cta_dismissed';

/**
 * [강사 가치 사다리 Step 1] 다운로드 직후 / 온보딩 강사 선택 직후 뜨는 배너.
 * - persona=teacher(또는 localStorage 역할)로 식별된 사용자에게만 부모가 켬
 * - X로 닫으면 다시 안 뜸 (localStorage), CTA 클릭도 목적 달성으로 보고 종료
 *
 * [8/19 개편] 배포 후 4주 실측: 강사 24명에게 280회 노출 → '시험지 만들어보기' 클릭 3건(1.1%).
 * 반면 보조 버튼이던 '사용법 영상'은 13건으로 4배 이상 눌렸다(강사 4 + 학생·미선택 9).
 * 기능으로 보내는 문보다 "어떻게 쓰는지"를 원한다는 신호 → 영상을 주 버튼으로 올린다.
 */
export default function TeacherExamCTA({ school, variant, visible, onClose }: {
    school: string | null;
    variant: 'download' | 'onboard';
    visible: boolean;
    onClose: () => void;
}) {
    const router = useRouter();
    if (!visible) return null;
    if (typeof window !== 'undefined' && localStorage.getItem(DISMISS_KEY)) return null;

    const log = (feature: string) => {
        fetch('/api/log/feature', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ feature, title: `${variant}:${school || '-'}` }),
        }).catch(() => { });
    };

    const goMake = () => {
        log('teacher_cta');
        try { localStorage.setItem(DISMISS_KEY, '1'); } catch { }
        onClose();
        router.push('/question-bank?tour=1');
    };

    const openVideo = () => {
        log('youtube_guide');
        window.open(GUIDE_VIDEO_URL, '_blank', 'noopener');
    };

    const dismiss = () => {
        try { localStorage.setItem(DISMISS_KEY, '1'); } catch { }
        onClose();
    };

    return (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[150] w-[calc(100%-2rem)] max-w-md">
            <div className="bg-white rounded-2xl border border-[#9BD4D2] shadow-xl p-4">
                <div className="flex items-start gap-2.5">
                    <span className="shrink-0 mt-0.5 w-8 h-8 rounded-full bg-[#E0F7F6] flex items-center justify-center">
                        <PencilRuler size={15} className="text-[#3AADA9]" />
                    </span>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-[#1E2D4F] break-keep">
                            {variant === 'download' && school
                                ? `${school} 기출로 시험지 만드는 법, 1분이면 됩니다.`
                                : '수학ETF로 시험지 만드는 법, 1분이면 됩니다.'}
                        </p>
                        <p className="text-xs text-slate-400 mt-0.5 break-keep">
                            기출과 같은 유형의 문항을 골라 담아 한글(HWP)로 받는 과정을 영상으로 보여드려요.
                        </p>
                    </div>
                    <button onClick={dismiss} aria-label="닫기" className="text-slate-300 hover:text-slate-500 shrink-0">
                        <X size={16} />
                    </button>
                </div>
                <div className="flex gap-2 mt-3">
                    <button
                        onClick={openVideo}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-[#3AADA9] hover:bg-[#2E948F] text-white text-sm font-extrabold rounded-xl transition-colors"
                    >
                        <PlayCircle size={16} /> 1분 사용법 보기
                    </button>
                    <button
                        onClick={goMake}
                        className="px-3 py-2 border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-bold rounded-xl transition-colors whitespace-nowrap"
                    >
                        바로 만들기 →
                    </button>
                </div>
            </div>
        </div>
    );
}
