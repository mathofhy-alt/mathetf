'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useRouter } from 'next/navigation';

interface PhoneVerificationModalProps {
    isOpen: boolean;
    onSuccess: (phone: string) => void;
    onClose: () => void;
}

export default function PhoneVerificationModal({ isOpen, onSuccess, onClose }: PhoneVerificationModalProps) {
    const [phone, setPhone] = useState('');
    const [otpCode, setOtpCode] = useState('');
    const [isOtpSent, setIsOtpSent] = useState(false);
    const [otpTimer, setOtpTimer] = useState(0);
    const [otpSending, setOtpSending] = useState(false);
    const [otpVerifying, setOtpVerifying] = useState(false);
    const supabase = createClient();
    const router = useRouter();

    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (otpTimer > 0 && isOtpSent) {
            interval = setInterval(() => {
                setOtpTimer((prev) => prev - 1);
            }, 1000);
        } else if (otpTimer === 0) {
            setIsOtpSent(false);
        }
        return () => clearInterval(interval);
    }, [otpTimer, isOtpSent]);

    const formatTime = (time: number) => {
        const minutes = Math.floor(time / 60);
        const seconds = time % 60;
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    };

    const handleSendOtp = async () => {
        if (!phone || phone.length < 10) {
            alert('유효한 휴대폰 번호를 입력해주세요.');
            return;
        }
        setOtpSending(true);
        try {
            const res = await fetch('/api/auth/send-sms', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone }),
            });
            const data = await res.json();
            if (data.success) {
                alert('인증번호가 발송되었습니다.');
                setIsOtpSent(true);
                setOtpTimer(180); // 3 minutes
            } else {
                alert(data.message || '인증번호 발송 실패');
            }
        } catch (error) {
            alert('인증번호 발송 중 오류가 발생했습니다.');
        } finally {
            setOtpSending(false);
        }
    };

    const handleVerifyOtp = async () => {
        if (!otpCode || otpCode.length !== 6) {
            alert('6자리 인증번호를 입력해주세요.');
            return;
        }
        setOtpVerifying(true);
        try {
            const res = await fetch('/api/auth/verify-sms', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone, code: otpCode }),
            });
            const data = await res.json();
            if (data.success) {
                // 인증 성공 시 -> 현재 유저의 user_metadata를 통째로 업데이트
                // (Server 사이드 update 정책 제약을 우회하기 위해 auth.updateUser 함수 통과)
                const { data: userData, error: userError } = await supabase.auth.getUser();
                if (userError || !userData.user) {
                    alert('사용자 정보를 불러올 수 없습니다.');
                    return;
                }
                const { error: updateError } = await supabase.auth.updateUser({
                    data: { phone: phone }
                });
                
                if (updateError) {
                    alert('회원정보 업데이트에 실패했습니다.');
                } else {
                    alert('휴대폰 인증이 완료되었습니다! 결제창을 호출합니다.');
                    setOtpTimer(0);
                    onSuccess(phone); // 부모 컴포넌트에 통보하여 결제창 띄우기
                }
            } else {
                alert(data.message || '인증 실패');
            }
        } catch (error) {
            alert('인증 확인 중 오류가 발생했습니다.');
        } finally {
            setOtpVerifying(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
                <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
                    <div>
                        <h2 className="text-xl font-bold tracking-tight text-slate-800">본인 인증이 필요합니다</h2>
                        <p className="text-sm text-slate-500 mt-1">안전한 결제를 위해 최초 1회 휴대폰 인증을 진행합니다.</p>
                    </div>
                </div>

                <div className="p-6 space-y-4">
                    <div>
                        <label className="block text-sm font-bold text-slate-700 mb-1">휴대폰 번호</label>
                        <div className="flex gap-2">
                            <input
                                type="tel"
                                value={phone}
                                onChange={(e) => {
                                    setPhone(e.target.value.replace(/[^0-9]/g, ''));
                                    setIsOtpSent(false);
                                }}
                                className="flex-1 px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-brand-500"
                                placeholder="숫자만 입력 (예: 01012345678)"
                                autoFocus
                            />
                            <button
                                type="button"
                                onClick={handleSendOtp}
                                disabled={otpSending || !phone || phone.length < 10}
                                className={`px-4 py-2 text-sm font-bold rounded-lg border transition-colors whitespace-nowrap
                                    ${'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100 disabled:opacity-50'}`}
                            >
                                {otpSending ? '발송 중...' : isOtpSent ? '재발송' : '인증번호 발송'}
                            </button>
                        </div>
                    </div>

                    {isOtpSent && (
                        <div className="animate-in fade-in slide-in-from-top-1 duration-200">
                            <div className="flex gap-2">
                                <div className="relative flex-1">
                                    <input
                                        type="text"
                                        value={otpCode}
                                        onChange={(e) => setOtpCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
                                        className="w-full px-4 py-2 border border-brand-200 rounded-lg focus:outline-none focus:border-brand-500 bg-brand-50/30"
                                        placeholder="인증번호 6자리 입력"
                                        maxLength={6}
                                    />
                                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-rose-500 font-medium tracking-wider">
                                        {formatTime(otpTimer)}
                                    </span>
                                </div>
                                <button
                                    type="button"
                                    onClick={handleVerifyOtp}
                                    disabled={otpVerifying || otpCode.length !== 6}
                                    className="px-6 py-2 text-sm font-bold bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50 transition-colors whitespace-nowrap"
                                >
                                    {otpVerifying ? '확인 중...' : '인증 완료하기'}
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-2">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-bold text-slate-500 hover:bg-slate-200/50 rounded-lg transition-colors"
                    >
                        다음에 하기 (결제 취소)
                    </button>
                </div>
            </div>
        </div>
    );
}
