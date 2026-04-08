'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';

export default function FindIdPage() {
    const [phone, setPhone] = useState('');
    const [otpCode, setOtpCode] = useState('');
    const [isOtpSent, setIsOtpSent] = useState(false);
    const [isPhoneVerified, setIsPhoneVerified] = useState(false);
    const [otpTimer, setOtpTimer] = useState(0);
    const [otpSending, setOtpSending] = useState(false);
    const [otpVerifying, setOtpVerifying] = useState(false);
    const [findingId, setFindingId] = useState(false);
    const [foundEmails, setFoundEmails] = useState<string[] | null>(null);

    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (otpTimer > 0 && isOtpSent && !isPhoneVerified) {
            interval = setInterval(() => {
                setOtpTimer((prev) => prev - 1);
            }, 1000);
        } else if (otpTimer === 0) {
            setIsOtpSent(false);
        }
        return () => clearInterval(interval);
    }, [otpTimer, isOtpSent, isPhoneVerified]);

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
                alert('휴대폰 인증이 완료되었습니다.');
                setIsPhoneVerified(true);
                setOtpTimer(0);
                // 인증 성공 시 자동으로 아이디 찾기 진행
                findUserId();
            } else {
                alert(data.message || '인증 실패');
            }
        } catch (error) {
            alert('인증 확인 중 오류가 발생했습니다.');
        } finally {
            setOtpVerifying(false);
        }
    };

    const findUserId = async () => {
        setFindingId(true);
        try {
            const res = await fetch('/api/auth/find-id', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone }),
            });
            const data = await res.json();
            if (data.success) {
                setFoundEmails(data.emails);
            } else {
                alert(data.message || '아이디 찾기 실패');
            }
        } catch (error) {
            alert('아이디를 찾는 중 오류가 발생했습니다.');
        } finally {
            setFindingId(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#f3f4f6] flex items-center justify-center p-4">
            <div className="bg-white rounded-lg shadow-md max-w-md w-full p-8 border border-slate-200 relative">
                <Link
                    href="/login"
                    className="absolute left-6 top-6 text-slate-500 hover:text-slate-700 transition flex items-center gap-1 text-sm font-medium"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="15 18 9 12 15 6" />
                    </svg>
                    뒤로가기
                </Link>
                
                <h1 className="text-2xl font-bold text-center mt-6 mb-6 text-slate-800">
                    아이디 찾기
                </h1>

                {foundEmails !== null ? (
                    <div className="text-center py-6 animate-in fade-in zoom-in-95 duration-300">
                        <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl">
                            🔎
                        </div>
                        <h2 className="text-xl font-bold text-slate-800 mb-2">조회된 아이디</h2>
                        
                        {foundEmails.length > 0 ? (
                            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 my-6">
                                {foundEmails.map((email, idx) => (
                                    <p key={idx} className="font-medium text-lg text-brand-700">
                                        {email}
                                    </p>
                                ))}
                            </div>
                        ) : (
                            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 my-6 text-slate-500">
                                입력하신 핸드폰 번호로 가입된 계정이 없습니다.
                            </div>
                        )}

                        <div className="flex gap-3 mt-8">
                            <Link href="/login" className="flex-1 bg-brand-600 text-white py-3 rounded-lg font-bold hover:bg-brand-700 transition-colors">
                                로그인하러 가기
                            </Link>
                            {foundEmails.length === 0 && (
                                <Link href="/signup" className="flex-1 bg-white border border-brand-600 text-brand-600 py-3 rounded-lg font-bold hover:bg-brand-50 transition-colors">
                                    회원가입
                                </Link>
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="space-y-6 pt-2">
                        <div className="text-sm text-slate-500 text-center mb-6">
                            가입 시 등록한 휴대폰 번호로 인증을 진행해주세요.
                        </div>
                        
                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-1">휴대폰 번호</label>
                            <div className="flex gap-2">
                                <input
                                    type="tel"
                                    value={phone}
                                    onChange={(e) => {
                                        setPhone(e.target.value.replace(/[^0-9]/g, ''));
                                        setIsPhoneVerified(false);
                                        setIsOtpSent(false);
                                    }}
                                    disabled={isPhoneVerified}
                                    className="flex-1 px-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:border-brand-500 disabled:bg-slate-100 disabled:text-slate-500 text-slate-800"
                                    placeholder="숫자만 입력 (예: 01012345678)"
                                />
                                <button
                                    type="button"
                                    onClick={handleSendOtp}
                                    disabled={isPhoneVerified || otpSending || !phone || phone.length < 10}
                                    className={`px-4 py-3 text-sm font-bold rounded-lg border transition-colors whitespace-nowrap
                                        ${isPhoneVerified 
                                            ? 'bg-green-50 text-green-600 border-green-200' 
                                            : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100 disabled:opacity-50'}`}
                                >
                                    {isPhoneVerified ? '인증완료' : otpSending ? '발송 중...' : isOtpSent ? '재발송' : '인증번호 발송'}
                                </button>
                            </div>
                        </div>
                        
                        {isOtpSent && !isPhoneVerified && (
                            <div className="animate-in fade-in slide-in-from-top-1 duration-200">
                                <div className="flex gap-2">
                                    <div className="relative flex-1">
                                        <input
                                            type="text"
                                            value={otpCode}
                                            onChange={(e) => setOtpCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
                                            className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:border-brand-500 text-slate-800"
                                            placeholder="인증번호 6자리 입력"
                                            maxLength={6}
                                        />
                                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-rose-500 font-medium tracking-wider">
                                            {formatTime(otpTimer)}
                                        </span>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={handleVerifyOtp}
                                        disabled={otpVerifying || otpCode.length !== 6}
                                        className="px-8 py-3 text-sm font-bold bg-slate-800 text-white rounded-lg hover:bg-slate-900 disabled:opacity-50 transition-colors whitespace-nowrap"
                                    >
                                        {otpVerifying ? '확인 중...' : '확인'}
                                    </button>
                                </div>
                            </div>
                        )}
                        
                        {findingId && (
                            <div className="text-center py-4 text-sm text-brand-600 font-medium animate-pulse">
                                유저 정보를 찾고 있습니다...
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
