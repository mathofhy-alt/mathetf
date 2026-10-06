'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Search } from 'lucide-react';

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

    // 아이디 찾기(10/7 새 디자인) — 로그인과 같은 계정 화면 틀(rd-auth). 인증·조회 흐름은 그대로.
    return (
        <div className="rd rd-auth">
            <div className="rd-auth-card">
                <Link href="/" className="rd-auth-brand"><Image src="/icon.svg" alt="" width={32} height={32} /><span>수학ETF</span></Link>
                <h1 className="rd-auth-title">아이디 찾기</h1>

                {foundEmails !== null ? (
                    <div className="rd-auth-done">
                        <div className="rd-auth-done-icon" aria-hidden="true"><Search size={28} strokeWidth={2.4} /></div>
                        <h2>조회된 아이디</h2>

                        {foundEmails.length > 0 ? (
                            <div className="rd-auth-result">
                                {foundEmails.map((email, idx) => (
                                    <p key={idx}>
                                        {email}
                                    </p>
                                ))}
                            </div>
                        ) : (
                            <div className="rd-auth-result is-empty">
                                <p>입력하신 핸드폰 번호로 가입된 계정이 없습니다.</p>
                            </div>
                        )}

                        <div className="rd-auth-actions">
                            <Link href="/login" className="rd-btn rd-btn-primary">
                                로그인하러 가기
                            </Link>
                            {foundEmails.length === 0 && (
                                <Link href="/signup" className="rd-btn rd-btn-gray">
                                    회원가입
                                </Link>
                            )}
                        </div>
                    </div>
                ) : (
                    <>
                        <p className="rd-auth-sub">
                            가입 시 등록한 휴대폰 번호로 인증을 진행해주세요.
                        </p>

                        <div className="rd-auth-form">
                            <label htmlFor="find-id-phone" className="rd-auth-label">휴대폰 번호</label>
                            <div className="rd-auth-row">
                                <input
                                    id="find-id-phone"
                                    type="tel"
                                    inputMode="numeric"
                                    value={phone}
                                    onChange={(e) => {
                                        setPhone(e.target.value.replace(/[^0-9]/g, ''));
                                        setIsPhoneVerified(false);
                                        setIsOtpSent(false);
                                    }}
                                    disabled={isPhoneVerified}
                                    className="rd-input"
                                    placeholder="01012345678"
                                />
                                <button
                                    type="button"
                                    onClick={handleSendOtp}
                                    disabled={isPhoneVerified || otpSending || !phone || phone.length < 10}
                                    className={`rd-btn rd-btn-gray${isPhoneVerified ? ' is-ok' : ''}`}
                                >
                                    {isPhoneVerified ? '인증완료' : otpSending ? '발송 중...' : isOtpSent ? '재발송' : '인증번호 발송'}
                                </button>
                            </div>

                            {isOtpSent && !isPhoneVerified && (
                                <div className="rd-auth-row rd-auth-otp-box">
                                    <div className="rd-auth-otp">
                                        <input
                                            type="text"
                                            inputMode="numeric"
                                            autoComplete="one-time-code"
                                            aria-label="인증번호"
                                            value={otpCode}
                                            onChange={(e) => setOtpCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
                                            className="rd-input"
                                            placeholder="인증번호 6자리 입력"
                                            maxLength={6}
                                        />
                                        <span className="rd-auth-timer">
                                            {formatTime(otpTimer)}
                                        </span>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={handleVerifyOtp}
                                        disabled={otpVerifying || otpCode.length !== 6}
                                        className="rd-btn rd-btn-primary"
                                    >
                                        {otpVerifying ? '확인 중...' : '확인'}
                                    </button>
                                </div>
                            )}

                            {findingId && (
                                <p className="rd-auth-note" role="status">
                                    유저 정보를 찾고 있습니다...
                                </p>
                            )}
                        </div>
                    </>
                )}

                {foundEmails === null && (
                    <div className="rd-auth-links is-gap">
                        <Link href="/login">로그인으로 돌아가기</Link>
                        <Link href="/forgot-password">비밀번호 찾기</Link>
                    </div>
                )}
            </div>
            <Link className="rd-auth-home" href="/">홈으로 돌아가기</Link>
        </div>
    );
}
