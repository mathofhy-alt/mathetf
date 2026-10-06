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
        <div className="rd fixed bottom-4 left-1/2 -translate-x-1/2 z-[150] w-[calc(100%-2rem)] max-w-md" style={{ background: 'transparent' }}>
            <div className="bg-white rounded-[20px] shadow-[0_20px_60px_rgba(23,32,44,0.18)] p-5">
                {state === 'done' ? (
                    <p className="m-0 text-[15px] font-bold text-[#1B7E7A] text-center py-1">알림 설정 완료! 새 기출이 올라오면 알려드릴게요.</p>
                ) : (
                    <>
                        <div className="flex items-start gap-3">
                            <span className="shrink-0 w-10 h-10 rounded-full bg-[#E8F6F5] flex items-center justify-center">
                                <Bell size={18} className="text-[#1B7E7A]" />
                            </span>
                            <div className="flex-1 min-w-0">
                                <p className="m-0 text-[16px] font-bold leading-[1.45] text-[#17202C]">
                                    {school ? `${school} 새 기출이 올라오면 알려드릴까요?` : '새 기출이 올라오면 알려드릴까요?'}
                                </p>
                                {/* 이 배너의 동의도 marketing_consent_version 을 남긴다(=이메일·문자 모두).
                                    그러니 매체를 여기서 밝혀야 한다 — 안 밝히면 동의 범위와 문구가 어긋난다. */}
                                <p className="m-0 mt-1 text-[14px] leading-[1.5] text-[#5F6B78]">이메일, 문자로 새 자료 소식을 보내드려요 (야간 발송 없음, 언제든 해지)</p>
                            </div>
                            <button onClick={dismiss} aria-label="닫기" className="rd-modal-x">
                                <X size={20} />
                            </button>
                        </div>
                        <div className="flex gap-2 mt-4">
                            <button
                                onClick={agree}
                                disabled={state === 'saving'}
                                className="rd-btn rd-btn-primary"
                                style={{ flex: '1 1 0', fontSize: 16, padding: '12px 16px' }}
                            >
                                {state === 'saving' ? '설정 중…' : '알림 받기'}
                            </button>
                            <button onClick={dismiss} className="rd-btn rd-btn-gray" style={{ fontSize: 16, padding: '12px 18px' }}>
                                괜찮아요
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
