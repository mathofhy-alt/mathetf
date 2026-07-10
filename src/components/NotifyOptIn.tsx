"use client";

import React, { useState } from 'react';
import { Bell, X } from 'lucide-react';

/**
 * 무료PDF 다운로드 직후 "새 기출 알림 받기" 옵트인 배너.
 * - 이미 동의한 사용자/한 번 거절한 사용자에겐 부모가 visible을 안 켬 (+ 여기서도 localStorage 이중 방어)
 * - 동의 시 /api/marketing-consent 호출 → 가입 폼의 marketing_agreed와 같은 명단으로 합류
 */
export default function NotifyOptIn({ school, visible, onClose }: { school: string; visible: boolean; onClose: () => void }) {
    const [state, setState] = useState<'idle' | 'saving' | 'done'>('idle');

    if (!visible) return null;
    if (typeof window !== 'undefined' && localStorage.getItem('mathetf_notify_dismissed')) return null;

    const agree = async () => {
        setState('saving');
        try {
            const res = await fetch('/api/marketing-consent', { method: 'POST' });
            if (!res.ok) throw new Error();
            setState('done');
            setTimeout(onClose, 1600);
        } catch {
            setState('idle');
            alert('설정에 실패했어요. 잠시 후 다시 시도해주세요.');
        }
    };

    const dismiss = () => {
        try { localStorage.setItem('mathetf_notify_dismissed', '1'); } catch { }
        onClose();
    };

    return (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[150] w-[calc(100%-2rem)] max-w-md">
            <div className="bg-white rounded-2xl border border-[#B7D1EA] shadow-xl p-4">
                {state === 'done' ? (
                    <p className="text-sm font-bold text-[#3AADA9] text-center py-1">✅ 알림 설정 완료! 새 기출이 올라오면 알려드릴게요.</p>
                ) : (
                    <>
                        <div className="flex items-start gap-2.5">
                            <span className="shrink-0 mt-0.5 w-8 h-8 rounded-full bg-[#EEF4FB] flex items-center justify-center">
                                <Bell size={15} className="text-[#497AB7]" />
                            </span>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold text-[#1E2D4F] break-keep">
                                    {school ? `${school} 새 기출이 올라오면 알려드릴까요?` : '새 기출이 올라오면 알려드릴까요?'}
                                </p>
                                <p className="text-xs text-slate-400 mt-0.5">이메일로 새 자료 소식을 보내드려요 (언제든 해지 가능)</p>
                            </div>
                            <button onClick={dismiss} aria-label="닫기" className="text-slate-300 hover:text-slate-500 shrink-0">
                                <X size={16} />
                            </button>
                        </div>
                        <div className="flex gap-2 mt-3">
                            <button
                                onClick={agree}
                                disabled={state === 'saving'}
                                className="flex-1 py-2 bg-[#497AB7] hover:bg-[#3A6599] text-white text-sm font-extrabold rounded-xl transition-colors disabled:opacity-60"
                            >
                                {state === 'saving' ? '설정 중…' : '알림 받기'}
                            </button>
                            <button onClick={dismiss} className="px-4 py-2 text-sm font-bold text-slate-400 hover:text-slate-600 transition-colors">
                                괜찮아요
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
