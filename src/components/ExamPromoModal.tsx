'use client';

import Link from 'next/link';
import { Save, MousePointerClick, FileEdit } from 'lucide-react';

const HIDE_KEY = 'examPromoHideDate';

// 사용자 로컬 기준 오늘 날짜 (YYYY-M-D)
function todayKey(): string {
    const d = new Date();
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

// 오늘 '보지 않기'를 눌렀는지 — 호출부에서 팝업 표시 전에 확인
export function isExamPromoHidden(): boolean {
    try {
        return localStorage.getItem(HIDE_KEY) === todayKey();
    } catch {
        return false;
    }
}

// 예상문제/변형문제 HWP 다운로드 후 '시험지 출제'로 유도하는 안내 팝업
export default function ExamPromoModal({ onClose }: { onClose: () => void }) {
    const hideToday = () => {
        try { localStorage.setItem(HIDE_KEY, todayKey()); } catch { }
        onClose();
    };
    return (
        <div
            className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4 animate-in fade-in duration-200"
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div className="bg-white w-full sm:w-[440px] rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200">
                {/* 헤더 */}
                <div className="relative bg-gradient-to-br from-[#497AB7] to-[#3AADA9] px-6 pt-6 pb-5 text-white text-center">
                    <button
                        onClick={onClose}
                        aria-label="닫기"
                        className="absolute top-2.5 right-2.5 w-8 h-8 rounded-full flex items-center justify-center text-white/80 hover:bg-white/15 text-xl font-bold leading-none"
                    >
                        ×
                    </button>
                    <p className="text-sm font-bold text-white/85 mb-1">다운로드 완료! 🎉</p>
                    <h3 className="text-xl font-black break-keep">‘시험지 출제’ 기능도 써보셨어요?</h3>
                </div>

                {/* 본문 */}
                <div className="px-6 py-5">
                    <p className="text-slate-600 text-sm leading-relaxed mb-4 break-keep">
                        방금 받은 건 <strong>맛보기</strong>예요. <strong className="text-[#497AB7]">시험지 출제</strong>로 가면
                        훨씬 자유롭게 나만의 시험지를 만들 수 있어요.
                    </p>
                    <ul className="space-y-2.5 mb-5">
                        <li className="flex items-start gap-2.5 text-sm text-slate-700">
                            <MousePointerClick size={18} className="text-[#3AADA9] shrink-0 mt-0.5" />
                            <span><strong>문제를 직접 골라</strong> 원하는 것만 담기</span>
                        </li>
                        <li className="flex items-start gap-2.5 text-sm text-slate-700">
                            <Save size={18} className="text-[#3AADA9] shrink-0 mt-0.5" />
                            <span>만든 시험지를 <strong>저장하고 다시 편집</strong></span>
                        </li>
                        <li className="flex items-start gap-2.5 text-sm text-slate-700">
                            <FileEdit size={18} className="text-[#3AADA9] shrink-0 mt-0.5" />
                            <span>문항 순서·난이도·구성까지 자유롭게</span>
                        </li>
                    </ul>
                    <div className="flex flex-col gap-2">
                        <Link
                            href="/question-bank"
                            className="w-full text-center bg-gradient-to-r from-[#497AB7] to-[#3AADA9] text-white font-extrabold py-3 rounded-xl hover:opacity-90 transition-opacity"
                        >
                            시험지 출제 가보기 →
                        </Link>
                        <div className="flex items-center justify-between pt-0.5">
                            <button
                                onClick={hideToday}
                                className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
                            >
                                오늘 하루 보지 않기
                            </button>
                            <button
                                onClick={onClose}
                                className="text-sm text-slate-500 font-bold hover:text-slate-700 transition-colors"
                            >
                                다음에 할게요
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
