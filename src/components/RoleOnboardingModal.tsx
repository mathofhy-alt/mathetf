"use client";
import React, { useEffect, useState } from 'react';
import { GraduationCap, PencilRuler, X } from 'lucide-react';

export type UserRole = 'student' | 'teacher';

const STORAGE_KEY = 'mathetf_role';

export function getStoredRole(): UserRole | null {
    if (typeof window === 'undefined') return null;
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'student' || v === 'teacher' ? v : null;
}

/**
 * 첫 방문 시 1회 표시되는 역할 선택 모달.
 * - 학생·학부모 / 선생님·강사 를 골라 localStorage 에 저장 (다음 방문엔 안 뜸).
 * - onSelect 로 선택 역할을 넘겨, 이후 역할별 튜토리얼/기본화면 분기에 사용.
 */
export default function RoleOnboardingModal({ onSelect, onClose }: { onSelect?: (role: UserRole) => void; onClose?: () => void }) {
    const [open, setOpen] = useState(false);

    useEffect(() => {
        // 이미 선택했거나 '둘러보기'로 닫은 적 있으면 안 띄움
        const seen = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(STORAGE_KEY + '_dismissed');
        if (!seen) setOpen(true);
    }, []);

    const choose = (role: UserRole) => {
        localStorage.setItem(STORAGE_KEY, role);
        setOpen(false);
        onSelect?.(role);
        onClose?.();
    };

    const dismiss = () => {
        localStorage.setItem(STORAGE_KEY + '_dismissed', '1');
        setOpen(false);
        onClose?.();
    };

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/55 backdrop-blur-sm p-4" role="dialog" aria-modal="true">
            <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
                {/* 상단 */}
                <div className="relative px-6 pt-7 pb-5 text-center bg-gradient-to-br from-[#497AB7] to-[#5CC6C3]">
                    <button onClick={dismiss} aria-label="닫기" className="absolute top-4 right-4 text-white/80 hover:text-white p-1 rounded-full hover:bg-white/15 transition-colors">
                        <X size={20} />
                    </button>
                    <h2 className="text-2xl font-black text-white">환영합니다</h2>
                    <p className="text-white/85 text-sm mt-1.5">어떤 목적으로 오셨나요? 맞춤 안내를 보여드릴게요.</p>
                    <p className="inline-block mt-3 text-xs font-extrabold text-[#1E2D4F] bg-yellow-300 px-3 py-1.5 rounded-full">
                        🎉 런칭 기념 — 회원가입만 하면 기출 DB 전부 무료
                    </p>
                </div>

                {/* 두 갈래 선택 */}
                <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                        onClick={() => choose('student')}
                        className="group text-left rounded-2xl border-2 border-slate-200 hover:border-[#497AB7] hover:bg-[#F4F8FD] p-5 transition-all"
                    >
                        <div className="w-12 h-12 rounded-2xl bg-[#E8F0FB] text-[#497AB7] flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                            <GraduationCap size={26} />
                        </div>
                        <p className="font-extrabold text-[#1E2D4F] text-lg">학생 · 학부모</p>
                        <p className="text-sm text-slate-500 mt-1 break-keep leading-relaxed">
                            전국 학교별 <strong className="text-[#497AB7]">기출 시험지(문제+해설)</strong>를 PDF로 받아 공부해요.
                        </p>
                    </button>

                    <button
                        onClick={() => choose('teacher')}
                        className="group text-left rounded-2xl border-2 border-slate-200 hover:border-[#3AADA9] hover:bg-[#F1FBFA] p-5 transition-all"
                    >
                        <div className="w-12 h-12 rounded-2xl bg-[#E0F7F6] text-[#3AADA9] flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                            <PencilRuler size={24} />
                        </div>
                        <p className="font-extrabold text-[#1E2D4F] text-lg">선생님 · 강사</p>
                        <p className="text-sm text-slate-500 mt-1 break-keep leading-relaxed">
                            기출 기반 <strong className="text-[#3AADA9]">유사문제로 나만의 시험지</strong>를 만들어요 (HWP·개인DB).
                        </p>
                    </button>
                </div>

                <div className="px-5 pb-5 text-center">
                    <button onClick={dismiss} className="text-xs text-slate-400 hover:text-slate-600 transition-colors">
                        그냥 둘러볼게요
                    </button>
                </div>
            </div>
        </div>
    );
}
