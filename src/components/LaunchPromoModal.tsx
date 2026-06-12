"use client";
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { X, Sparkles } from 'lucide-react';

const HIDE_KEY = 'mathetf_promo_hide_until';

/**
 * 런칭 기념 무료 안내 팝업.
 * - "PDF·HWP는 유료지만, 회원가입만 하면 시험지 출제에서 전 기출 DB 무료" 를 크게 알림.
 * - 첫 방문(역할선택 모달이 뜨는 세션)에는 양보하고, 이후 방문부터 노출.
 * - '오늘 하루 보지 않기' → 다음날 다시 노출 (런칭 기간 리마인드).
 */
export default function LaunchPromoModal() {
    const [open, setOpen] = useState(false);

    useEffect(() => {
        // 역할 선택 모달이 우선인 첫 방문엔 띄우지 않음 (팝업 2개 중첩 방지)
        const roleSeen = localStorage.getItem('mathetf_role') || localStorage.getItem('mathetf_role_dismissed');
        if (!roleSeen) return;
        const hideUntil = Number(localStorage.getItem(HIDE_KEY) || 0);
        if (Date.now() > hideUntil) setOpen(true);
    }, []);

    const hideToday = () => {
        const end = new Date();
        end.setHours(23, 59, 59, 999);
        localStorage.setItem(HIDE_KEY, String(end.getTime()));
        setOpen(false);
    };

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-[290] flex items-center justify-center bg-black/55 backdrop-blur-sm p-4" role="dialog" aria-modal="true">
            <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
                {/* 헤더 */}
                <div className="relative px-6 pt-8 pb-6 text-center bg-gradient-to-br from-[#497AB7] to-[#3AADA9]">
                    <button onClick={() => setOpen(false)} aria-label="닫기" className="absolute top-4 right-4 text-white/80 hover:text-white p-1 rounded-full hover:bg-white/15 transition-colors">
                        <X size={20} />
                    </button>
                    <div className="inline-flex items-center gap-1.5 bg-white/15 text-white text-xs font-extrabold px-3 py-1.5 rounded-full mb-3">
                        <Sparkles size={14} /> 런칭 기념 이벤트
                    </div>
                    <h2 className="text-2xl font-black text-white leading-snug break-keep">
                        회원가입만 하면<br />모든 기출 DB <span className="text-yellow-300">100% 무료</span>
                    </h2>
                </div>

                {/* 본문 */}
                <div className="p-6">
                    <p className="text-sm text-slate-600 leading-relaxed break-keep text-center mb-5">
                        <strong className="text-slate-800">시험지 출제</strong>에서 전국 학교 기출 문제를
                        <strong className="text-[#3AADA9]"> 무제한으로</strong> 골라
                        나만의 시험지를 만들 수 있어요.<br />
                        <span className="text-slate-400 text-xs">(PDF·HWP 완성파일 다운로드만 유료예요)</span>
                    </p>

                    <div className="space-y-2.5">
                        <Link
                            href="/login"
                            className="block w-full py-3.5 bg-gradient-to-r from-[#497AB7] to-[#3AADA9] text-white rounded-2xl font-black text-base text-center hover:opacity-90 transition-opacity shadow-lg shadow-[#497AB7]/25"
                        >
                            무료 회원가입 하고 시작하기 →
                        </Link>
                        <Link
                            href="/question-bank"
                            onClick={() => setOpen(false)}
                            className="block w-full py-3 bg-slate-100 text-slate-600 rounded-2xl font-bold text-sm text-center hover:bg-slate-200 transition-colors"
                        >
                            가입 없이 먼저 둘러보기
                        </Link>
                    </div>
                </div>

                {/* 푸터 */}
                <div className="px-6 pb-5 flex justify-center">
                    <button onClick={hideToday} className="text-xs text-slate-400 hover:text-slate-600 transition-colors">
                        오늘 하루 보지 않기
                    </button>
                </div>
            </div>
        </div>
    );
}
