"use client"

import React, { useEffect, useState } from 'react';
import { X, Sparkles, BookOpen, Layers, ArrowRight } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface TutorialModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function TutorialModal({ isOpen, onClose }: TutorialModalProps) {
    const router = useRouter();
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setIsVisible(true);
        } else {
            setIsVisible(false);
        }
    }, [isOpen]);

    if (!isOpen && !isVisible) return null;

    const handleHideForDays = (days: number) => {
        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + days);
        localStorage.setItem('hide_tutorial_until', expiryDate.toISOString());
        onClose();
    };

    const handleNavigate = () => {
        onClose();
        router.push('/question-bank');
    };

    return (
        <div className={`fixed inset-0 z-[100] flex items-end sm:items-center justify-center transition-all duration-300 ${isOpen ? 'bg-black/50 backdrop-blur-sm opacity-100' : 'bg-black/0 backdrop-blur-none opacity-0 pointer-events-none'}`}>
            <div className={`bg-white w-full sm:max-w-3xl sm:mx-4 overflow-hidden transition-all duration-300 transform rounded-t-3xl sm:rounded-2xl shadow-2xl ${isOpen ? 'translate-y-0 scale-100' : 'translate-y-8 sm:scale-95 sm:translate-y-4'}`}>
                {/* Header Banner */}
                <div className="relative bg-gradient-to-r from-brand-600 to-indigo-700 px-5 py-6 sm:p-8 text-white overflow-hidden">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
                    <div className="absolute bottom-0 left-0 w-40 h-40 bg-brand-400/20 rounded-full blur-2xl translate-y-1/2 -translate-x-1/2"></div>

                    {/* 모바일: 상단 드래그 핸들 */}
                    <div className="sm:hidden flex justify-center mb-4">
                        <div className="w-10 h-1 bg-white/40 rounded-full"></div>
                    </div>

                    <button
                        onClick={onClose}
                        className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors z-10"
                    >
                        <X size={18} className="text-white" />
                    </button>

                    <div className="relative z-10">
                        <div className="inline-flex items-center gap-1 bg-white/20 px-3 py-1 rounded-full text-xs font-bold mb-3 backdrop-blur-sm border border-white/20">
                            <Sparkles size={12} />
                            <span>수학ETF의 진짜 핵심 기능!</span>
                        </div>
                        <h2 className="text-2xl sm:text-4xl font-extrabold mb-1.5 tracking-tight">
                            기출문제만 찾고 계신가요?
                        </h2>
                        <p className="text-brand-100 text-sm sm:text-lg">
                            수학ETF는 1분 만에 나만의 시험지를 만들 수 있는 강력한 플랫폼입니다.
                        </p>
                    </div>
                </div>

                {/* Content */}
                <div className="px-5 py-5 sm:p-8">
                    <div className="grid sm:grid-cols-2 gap-4 sm:gap-6 mb-5 sm:mb-8">
                        <div className="bg-slate-50 p-4 sm:p-6 rounded-xl border border-slate-100 hover:border-brand-200 transition-colors">
                            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-indigo-100 text-indigo-600 rounded-lg flex items-center justify-center mb-3">
                                <BookOpen size={20} />
                            </div>
                            <h3 className="font-bold text-base sm:text-lg text-slate-800 mb-1.5">학생·학부모님을 위한 기출자료</h3>
                            <p className="text-slate-500 text-xs sm:text-sm leading-relaxed">
                                홈 화면(내신 기출)에서 원하는 학교의 기출문제를 PDF나 HWP 형태로 즉시 다운로드하여 학습에 활용하세요.
                            </p>
                        </div>
                        <div className="bg-slate-50 p-4 sm:p-6 rounded-xl border border-slate-100 hover:border-brand-200 transition-colors">
                            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-brand-100 text-brand-600 rounded-lg flex items-center justify-center mb-3">
                                <Layers size={20} />
                            </div>
                            <h3 className="font-bold text-base sm:text-lg text-slate-800 mb-1.5">선생님을 위한 개인DB & 시험지</h3>
                            <p className="text-slate-500 text-xs sm:text-sm leading-relaxed">
                                문항을 편집하거나 <strong>유사문항</strong>으로 새 시험지를 만들려면 <strong>개인DB</strong>를 구매해 보세요.<br/>
                                <span className="text-brand-600 font-medium block mt-1">전국연합 모의고사 문항 소스는 전면 무료!</span>
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 justify-between bg-indigo-50/50 p-4 sm:p-6 rounded-xl border border-indigo-100">
                        <div>
                            <p className="font-bold text-indigo-900 mb-0.5 text-sm sm:text-base">지금 바로 시험지를 만들어보세요!</p>
                            <p className="text-indigo-600 text-xs sm:text-sm">상단 메뉴의 '시험지출제'를 클릭하면 이동합니다.</p>
                        </div>
                        <button
                            onClick={handleNavigate}
                            className="w-full sm:w-auto px-5 py-2.5 bg-brand-600 hover:bg-brand-700 text-white font-bold rounded-lg transition-colors flex items-center justify-center gap-2 group whitespace-nowrap text-sm"
                        >
                            시험지 만들기 이동
                            <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
                        </button>
                    </div>
                </div>

                {/* Footer Options */}
                <div className="px-5 py-3 sm:px-8 sm:py-4 bg-slate-50 border-t border-slate-100 flex flex-wrap justify-center sm:justify-end gap-2 sm:gap-3 text-sm">
                    <button
                        onClick={() => handleHideForDays(7)}
                        className="text-slate-500 hover:text-slate-700 font-medium px-3 py-1.5 rounded-md hover:bg-slate-200/50 transition-colors text-xs sm:text-sm"
                    >
                        일주일간 보지 않기
                    </button>
                    <button
                        onClick={() => handleHideForDays(30)}
                        className="text-slate-500 hover:text-slate-700 font-medium px-3 py-1.5 rounded-md hover:bg-slate-200/50 transition-colors text-xs sm:text-sm"
                    >
                        한달간 보지 않기
                    </button>
                    <button
                        onClick={onClose}
                        className="text-slate-800 font-bold px-4 py-1.5 rounded-md hover:bg-slate-200 transition-colors text-xs sm:text-sm"
                    >
                        닫기
                    </button>
                </div>
            </div>
        </div>
    );
}
