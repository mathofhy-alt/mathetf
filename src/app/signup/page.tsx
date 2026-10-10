'use client';


import React, { useState, useEffect } from 'react';
import { logAnon } from '@/lib/anon-log';
import { createClient } from '@/utils/supabase/client';
import { useRouter } from 'next/navigation';
import { safeReturnPath } from '@/lib/auth-return';
import Link from 'next/link';
import Image from 'next/image';
import { Check } from 'lucide-react';
import TermsModal from '@/components/TermsModal';
import PrivacyModal from '@/components/PrivacyModal';
import MarketingModal from '@/components/MarketingModal';
import { getStoredRole } from '@/components/RoleOnboardingModal';
import { getStoredSignupAttribution } from '@/lib/analytics/signup-attribution';
import { queueKakaoRegistration } from '@/components/KakaoPixel';
import { checkEmail } from '@/lib/email-check';

export default function SignupPage() {
    const [step, setStep] = useState(1);
    const [termsAgreed, setTermsAgreed] = useState(false);
    const [privacyAgreed, setPrivacyAgreed] = useState(false);
    const [marketingAgreed, setMarketingAgreed] = useState(false);
    const [isTermsModalOpen, setIsTermsModalOpen] = useState(false);
    // [익명 계측] 가입 화면까지 온 사람. 배너 클릭 대비 여기서 얼마나 새는지가 핵심이다.
    useEffect(() => { logAnon('signup_start'); }, []);

    const [isPrivacyModalOpen, setIsPrivacyModalOpen] = useState(false);
    const [isMarketingModalOpen, setIsMarketingModalOpen] = useState(false);

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [nickname, setNickname] = useState('');

    const [loading, setLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');
    const [successMsg, setSuccessMsg] = useState('');

    const [emailStatus, setEmailStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
    const [checkedEmail, setCheckedEmail] = useState('');

    const [phone, setPhone] = useState('');
    const [otpCode, setOtpCode] = useState('');
    const [isOtpSent, setIsOtpSent] = useState(false);
    const [isPhoneVerified, setIsPhoneVerified] = useState(false);
    const [otpTimer, setOtpTimer] = useState(0);
    const [otpSending, setOtpSending] = useState(false);
    const [otpVerifying, setOtpVerifying] = useState(false);

    const router = useRouter();
    const [nextPath, setNextPath] = useState('/');
    useEffect(() => { setNextPath(safeReturnPath(new URLSearchParams(window.location.search).get('next'))); }, []);
    const supabase = createClient();

    const handleNextStep = () => {
        if (!termsAgreed || !privacyAgreed) {
            alert('모든 필수 항목에 동의해주셔야 합니다.');
            return;
        }
        setStep(2);
    };

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
                body: JSON.stringify({ phone, code: otpCode, purpose: 'signup' }),
            });
            const data = await res.json();
            if (data.success) {
                alert('휴대폰 인증이 완료되었습니다.');
                setIsPhoneVerified(true);
                setOtpTimer(0);
            } else if (data.code === 'phone_taken') {
                setOtpTimer(0);
                if (confirm(`${data.message}\n\n아이디 찾기로 이동할까요?`)) router.push('/find-id');
            } else {
                alert(data.message || '인증 실패');
            }
        } catch (error) {
            alert('인증 확인 중 오류가 발생했습니다.');
        } finally {
            setOtpVerifying(false);
        }
    };

    const handleCheckEmail = async () => {
        if (!email) {
            alert('이메일을 입력해주세요.');
            return;
        }
        // [10/10] 형식·흔한 오타(navercom·gmail.comcom 등) 검사 — 고칠 주소가 있으면 바꿀지 묻는다
        const ec = checkEmail(email);
        if (!ec.ok) {
            if (ec.suggestion && confirm(`${ec.message}\n\n${ec.suggestion} 로 바꿀까요?`)) setEmail(ec.suggestion);
            else if (!ec.suggestion) alert(ec.message);
            return;
        }

        setEmailStatus('checking');
        try {
            const { data, error } = await supabase.rpc('check_email_exists', { email_input: email });
            if (error) throw error;

            if (data === true) {
                setEmailStatus('taken');
            } else {
                setEmailStatus('available');
                setCheckedEmail(email);
            }
        } catch (err) {
            console.error(err);
            alert('중복 확인 중 오류가 발생했습니다.');
            setEmailStatus('idle');
        }
    };

    const handleSignup = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrorMsg('');
        setSuccessMsg('');

        // Validation
        if (!email || !password || !nickname) {
            setErrorMsg('모든 필드를 입력해주세요.');
            return;
        }
        if (password.length < 6) {
            setErrorMsg('비밀번호는 6자리 이상이어야 합니다.');
            return;
        }
        { const ec = checkEmail(email); if (!ec.ok) { setErrorMsg(ec.message); return; } }
        if (password !== confirmPassword) {
            setErrorMsg('비밀번호가 일치하지 않습니다.');
            return;
        }
        if (!isPhoneVerified) {
            setErrorMsg('휴대폰 본인 인증을 완료해주세요.');
            return;
        }

        setLoading(true);

        try {
            // 서버 라우트에서 휴대폰 인증을 검증한 뒤에만 계정 생성 (클라이언트 우회 방지)
            const res = await fetch('/api/auth/signup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email,
                    password,
                    phone,
                    full_name: nickname,
                    marketing_agreed: marketingAgreed,
                    persona: getStoredRole(), // 온보딩 모달에서 고른 역할(학생/강사) — 없으면 null
                    attribution: getStoredSignupAttribution(),
                }),
            });
            const result = await res.json();
            if (!res.ok || !result.success) {
                throw new Error(result.message || '회원가입에 실패했습니다.');
            }

            queueKakaoRegistration();

            // 가입 직후 자동 로그인 (UX)
            const { error: loginError } = await supabase.auth.signInWithPassword({ email, password });
            if (loginError) { router.push('/login?next=' + encodeURIComponent(nextPath)); return; }
            if (nextPath !== '/') { router.push(nextPath); return; }

            setSuccessMsg('회원가입이 성공적으로 완료되었습니다!');
        } catch (error: any) {
            console.error('Signup error:', error);
            setErrorMsg(error.message || '회원가입 중 오류가 발생했습니다.');
        } finally {
            setLoading(false);
        }
    };

    const emailOk = emailStatus === 'available' && email === checkedEmail;
    const pwMismatch = !!(password && confirmPassword && password !== confirmPassword);

    // 회원가입(10/7 새 디자인) — 로그인과 같은 계정 화면 틀(rd-auth). 단계·검증·인증 흐름은 그대로, 겉모습만 바꿨다.
    return (
        <div className="rd rd-auth">
            <div className="rd-auth-card">
                <Link href="/" className="rd-auth-brand"><Image src="/icon.svg" alt="" width={32} height={32} /><span>수학ETF</span></Link>
                <h1 className="rd-auth-title">회원가입</h1>
                {!successMsg && (
                    <p className="rd-auth-sub">
                        {step === 1 ? '약관에 동의하면 가입 정보를 입력합니다.' : '가입 정보를 입력하고 휴대폰 인증을 마쳐 주세요.'}
                    </p>
                )}

                {/* 진행 단계 */}
                {!successMsg && (
                    <ol className="rd-auth-steps">
                        <li className={step >= 1 ? 'is-on' : ''}>1 약관 동의</li>
                        <li className={step >= 2 ? 'is-on' : ''}>2 정보 입력</li>
                    </ol>
                )}

                {successMsg ? (
                    <div className="rd-auth-done">
                        <div className="rd-auth-done-icon" aria-hidden="true"><Check size={30} strokeWidth={2.6} /></div>
                        <h2>가입 완료</h2>
                        <p>
                            휴대폰 인증을 통해 성공적으로 가입되었습니다.<br />
                            지금 바로 서비스를 이용하실 수 있습니다.
                        </p>
                        <div className="rd-auth-actions">
                            <Link href={nextPath} className="rd-btn rd-btn-primary rd-btn-block">
                                로그인하고 시작하기
                            </Link>
                        </div>
                    </div>
                ) : (
                    <>
                        {step === 1 && (
                            <div>
                                <div className="rd-auth-agree-list">
                                    <div
                                        className={`rd-auth-agree${termsAgreed ? ' is-on' : ''}`}
                                        onClick={() => {
                                            if (termsAgreed) {
                                                setTermsAgreed(false);
                                            } else {
                                                setIsTermsModalOpen(true);
                                            }
                                        }}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={termsAgreed}
                                            readOnly
                                            style={{ pointerEvents: 'none' }}
                                            id="terms"
                                        />
                                        <div className="rd-auth-agree-body">
                                            <div className="rd-auth-agree-head">
                                                <label htmlFor="terms" style={{ pointerEvents: 'none' }}>
                                                    <span className="rd-auth-tag">[필수]</span>
                                                    서비스 이용약관 동의
                                                </label>
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setIsTermsModalOpen(true);
                                                    }}
                                                    className="rd-auth-view"
                                                >
                                                    전문 보기
                                                </button>
                                            </div>
                                            <p>수학ETF 서비스 이용을 위한 약관입니다.</p>
                                        </div>
                                    </div>
                                    <div
                                        className={`rd-auth-agree${privacyAgreed ? ' is-on' : ''}`}
                                        onClick={() => {
                                            if (privacyAgreed) {
                                                setPrivacyAgreed(false);
                                            } else {
                                                setIsPrivacyModalOpen(true);
                                            }
                                        }}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={privacyAgreed}
                                            readOnly
                                            style={{ pointerEvents: 'none' }}
                                            id="privacy"
                                        />
                                        <div className="rd-auth-agree-body">
                                            <div className="rd-auth-agree-head">
                                                <label htmlFor="privacy" style={{ pointerEvents: 'none' }}>
                                                    <span className="rd-auth-tag">[필수]</span>
                                                    개인정보 수집 및 이용 동의
                                                </label>
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setIsPrivacyModalOpen(true);
                                                    }}
                                                    className="rd-auth-view"
                                                >
                                                    전문 보기
                                                </button>
                                            </div>
                                            <p>회원가입 및 서비스 운영을 위해 최소한의 정보를 수집합니다.</p>
                                        </div>
                                    </div>
                                    <div
                                        className={`rd-auth-agree${marketingAgreed ? ' is-on' : ''}`}
                                        onClick={() => setMarketingAgreed(!marketingAgreed)}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={marketingAgreed}
                                            onChange={(e) => setMarketingAgreed(e.target.checked)}
                                            id="marketing"
                                        />
                                        <div className="rd-auth-agree-body">
                                            <div className="rd-auth-agree-head">
                                                <label htmlFor="marketing">
                                                    <span className="rd-auth-tag is-opt">[선택]</span>
                                                    마케팅 정보 수신 동의
                                                </label>
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setIsMarketingModalOpen(true);
                                                    }}
                                                    className="rd-auth-view"
                                                >
                                                    전문 보기
                                                </button>
                                            </div>
                                            <p>
                                                새 기출 자료와 혜택 소식을 <b>이메일과 문자</b>로 받습니다. (야간 21~08시 발송 없음)
                                            </p>
                                        </div>
                                    </div>
                                </div>
                                <button
                                    onClick={handleNextStep}
                                    disabled={!termsAgreed || !privacyAgreed}
                                    className="rd-btn rd-btn-primary rd-btn-block rd-auth-submit"
                                >
                                    다음
                                </button>
                            </div>
                        )}

                        <TermsModal
                            isOpen={isTermsModalOpen}
                            onClose={() => setIsTermsModalOpen(false)}
                            onAgree={() => {
                                setTermsAgreed(true);
                                setIsTermsModalOpen(false);
                            }}
                        />

                        <PrivacyModal
                            isOpen={isPrivacyModalOpen}
                            onClose={() => setIsPrivacyModalOpen(false)}
                            onAgree={() => {
                                setPrivacyAgreed(true);
                                setIsPrivacyModalOpen(false);
                            }}
                        />

                        <MarketingModal
                            isOpen={isMarketingModalOpen}
                            onClose={() => setIsMarketingModalOpen(false)}
                            onAgree={() => {
                                setMarketingAgreed(true);
                                setIsMarketingModalOpen(false);
                            }}
                        />

                        {step === 2 && (
                            <form onSubmit={handleSignup} className="rd-auth-form">
                                <label htmlFor="signup-email" className="rd-auth-label">이메일 (아이디)</label>
                                <input
                                    id="signup-email"
                                    type="email"
                                    value={email}
                                    onChange={(e) => {
                                        setEmail(e.target.value);
                                        if (emailStatus === 'available') setEmailStatus('idle');
                                    }}
                                    className="rd-input"
                                    autoComplete="email"
                                    placeholder="example@email.com"
                                    required
                                />
                                <button
                                    type="button"
                                    onClick={handleCheckEmail}
                                    disabled={emailStatus === 'checking' || emailOk}
                                    className={`rd-btn rd-btn-gray rd-btn-block rd-auth-check${emailOk ? ' is-ok' : ''}`}
                                >
                                    {emailStatus === 'checking' ? '확인 중...' :
                                        emailOk ? <><Check size={18} strokeWidth={2.6} aria-hidden="true" />사용 가능한 이메일</> : '중복 확인'}
                                </button>
                                {emailStatus === 'taken' && (
                                    <p className="rd-auth-hint">이미 사용 중인 이메일입니다.</p>
                                )}

                                <label htmlFor="signup-nickname" className="rd-auth-label">닉네임</label>
                                <input
                                    id="signup-nickname"
                                    type="text"
                                    value={nickname}
                                    onChange={(e) => setNickname(e.target.value)}
                                    className="rd-input"
                                    placeholder="활동명 입력"
                                    required
                                />

                                <label htmlFor="signup-password" className="rd-auth-label">비밀번호</label>
                                <input
                                    id="signup-password"
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="rd-input"
                                    autoComplete="new-password"
                                    placeholder="영문, 숫자 6자리 이상"
                                    required
                                    minLength={6}
                                />

                                <label htmlFor="signup-password-confirm" className="rd-auth-label">비밀번호 확인</label>
                                <input
                                    id="signup-password-confirm"
                                    type="password"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    className={`rd-input${pwMismatch ? ' is-bad' : ''}`}
                                    autoComplete="new-password"
                                    placeholder="비밀번호 재입력"
                                    required
                                />
                                {pwMismatch && (
                                    <p className="rd-auth-hint">비밀번호가 일치하지 않습니다.</p>
                                )}

                                <hr className="rd-auth-sep" />
                                <label htmlFor="signup-phone" className="rd-auth-label">휴대폰 번호 인증</label>
                                <div className="rd-auth-row">
                                    <input
                                        id="signup-phone"
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
                                        required
                                    />
                                    <button
                                        type="button"
                                        onClick={handleSendOtp}
                                        disabled={isPhoneVerified || otpSending || !phone || phone.length < 10}
                                        className={`rd-btn rd-btn-gray${isPhoneVerified ? ' is-ok' : ''}`}
                                    >
                                        {isPhoneVerified ? <><Check size={18} strokeWidth={2.6} aria-hidden="true" />인증 완료</> : otpSending ? '발송 중...' : isOtpSent ? '재발송' : '인증번호 발송'}
                                    </button>
                                </div>

                                {isOtpSent && !isPhoneVerified && (
                                    <div className="rd-auth-row rd-auth-otp-box">
                                        <div className="rd-auth-otp">
                                            <input
                                                type="text"
                                                inputMode="numeric"
                                                autoComplete="one-time-code"
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
                                            className="rd-btn rd-btn-gray"
                                        >
                                            {otpVerifying ? '확인 중...' : '확인'}
                                        </button>
                                    </div>
                                )}

                                {errorMsg && (
                                    <p className="rd-auth-error" role="alert">
                                        {errorMsg}
                                    </p>
                                )}

                                <div className="rd-auth-actions">
                                    <button
                                        type="button"
                                        onClick={() => setStep(1)}
                                        className="rd-btn rd-btn-gray"
                                    >
                                        이전
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={loading}
                                        className="rd-btn rd-btn-primary"
                                    >
                                        {loading ? '가입 중...' : '회원가입 완료'}
                                    </button>
                                </div>
                            </form>
                        )}
                        <div className="rd-auth-join">
                            <span>이미 계정이 있으신가요?</span>
                            <Link href={'/login?next=' + encodeURIComponent(nextPath)} className="rd-btn rd-btn-gray rd-btn-block">
                                로그인
                            </Link>
                        </div>
                    </>
                )}
            </div>
            <Link className="rd-auth-home" href="/">홈으로 돌아가기</Link>
        </div>
    );
}
