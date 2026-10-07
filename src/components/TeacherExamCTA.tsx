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
        <div className="rd fixed bottom-4 left-1/2 -translate-x-1/2 z-[150] w-[calc(100%-2rem)] max-w-md" style={{ background: 'transparent' }}>
            <div className="bg-white rounded-[20px] shadow-[0_20px_60px_rgba(23,32,44,0.18)] p-5">
                <div className="flex items-start gap-3">
                    <span className="shrink-0 w-10 h-10 rounded-full bg-[#E8F6F5] flex items-center justify-center">
                        <PencilRuler size={18} className="text-[#1B7E7A]" />
                    </span>
                    <div className="flex-1 min-w-0">
                        <p className="m-0 text-[16px] font-bold leading-[1.45] text-[#17202C]">
                            {variant === 'download' && school
                                ? `${school} 기출로 시험지 만드는 법, 순서대로 안내합니다.`
                                : '수학ETF로 시험지 만드는 법, 순서대로 안내합니다.'}
                        </p>
                        <p className="m-0 mt-1 text-[14px] leading-[1.5] text-[#5F6B78]">
                            기출과 같은 유형의 문항을 골라 담아 한글 호환 HML로 받는 과정을 영상으로 보여드려요.
                        </p>
                    </div>
                    <button onClick={dismiss} aria-label="닫기" className="rd-modal-x">
                        <X size={20} />
                    </button>
                </div>
                <div className="flex gap-2 mt-4">
                    <button
                        onClick={openVideo}
                        className="rd-btn rd-btn-primary"
                        style={{ flex: '1 1 0', fontSize: 16, padding: '12px 16px' }}
                    >
                        <PlayCircle size={18} /> 사용법 영상 보기
                    </button>
                    <button
                        onClick={goMake}
                        className="rd-btn rd-btn-gray"
                        style={{ fontSize: 16, padding: '12px 18px', whiteSpace: 'nowrap' }}
                    >
                        바로 만들기
                    </button>
                </div>
            </div>
        </div>
    );
}
