'use client';


import React, { useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import TermsModal from '@/components/TermsModal';
import PrivacyModal from '@/components/PrivacyModal';
import MarketingModal from '@/components/MarketingModal';

export default function SignupPage() {
    const [step, setStep] = useState(1);
    const [termsAgreed, setTermsAgreed] = useState(false);
    const [privacyAgreed, setPrivacyAgreed] = useState(false);
    const [marketingAgreed, setMarketingAgreed] = useState(false);
    const [isTermsModalOpen, setIsTermsModalOpen] = useState(false);
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

    const router = useRouter();
    const supabase = createClient();

    const handleNextStep = () => {
        if (!termsAgreed || !privacyAgreed) {
            alert('모든 필수 항목에 동의해주셔야 합니다.');
            return;
        }
        setStep(2);
    };

    const handleCheckEmail = async () => {
        if (!email) {
            alert('이메일을 입력해주세요.');
            return;
        }
        if (!email.includes('@')) {
            alert('올바른 이메일 형식이 아닙니다.');
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
        if (password !== confirmPassword) {
            setErrorMsg('비밀번호가 일치하지 않습니다.');
            return;
        }

        setLoading(true);

        try {
            const { error } = await supabase.auth.signUp({
                email,
                password,
                options: {
                    data: {
                        full_name: nickname,
                        marketing_agreed: marketingAgreed,
                    },
                    emailRedirectTo: `${location.origin}/auth/callback`,
                },
            });

            if (error) throw error;

            setSuccessMsg('회원가입 인증 메일이 발송되었습니다. 이메일을 확인해주세요!');
        } catch (error: any) {
            console.error('Signup error:', error);
            setErrorMsg(error.message || '회원가입 중 오류가 발생했습니다.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#f3f4f6] flex items-center justify-center p-4">
            <div className="bg-white rounded-lg shadow-md max-w-md w-full p-8 border border-slate-200">
                <h1 className="text-2xl font-bold text-center mb-6 text-slate-800">
                    회원가입
                </h1>

                {/* Progress Indicatgor */}
                <div className="flex gap-2 mb-8 justify-center">
                    <div className={`h-2 w-16 rounded-full ${step >= 1 ? 'bg-brand-600' : 'bg-slate-200'}`}></div>
                    <div className={`h-2 w-16 rounded-full ${step >= 2 ? 'bg-brand-600' : 'bg-slate-200'}`}></div>
                </div>

                {successMsg ? (
                    <div className="text-center py-8">
                        <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl">
                            ✅
                        </div>
                        <h2 className="text-xl font-bold text-slate-800 mb-2">가입 신청 완료!</h2>
                        <p className="text-slate-600 mb-6">
                            입력하신 이메일로 인증 메일을 보냈습니다.<br />
                            메일함에서 인증 버튼을 클릭하면 가입이 완료됩니다.
                        </p>
                        <Link href="/" className="block w-full bg-brand-600 text-white py-3 rounded-lg font-bold hover:bg-brand-700 transition-colors">
                            홈으로 이동
                        </Link>
                    </div>
                ) : (
                    <>
                        {step === 1 && (
                            <div className="space-y-6">
                                <h2 className="text-lg font-bold text-slate-700 border-b pb-2">
                                    약관 동의
                                </h2>
                                <div className="space-y-4">
                                    <div
                                        className="flex items-start gap-3 p-4 border rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
                                        onClick={() => {
                                            if (termsAgreed) {
                                                setTermsAgreed(false);
                                            } else {
                                                setIsTermsModalOpen(true);
                                            }
                                        }}
                                    >
                                        <div className="flex items-center h-5">
                                            <input
                                                type="checkbox"
                                                checked={termsAgreed}
                                                readOnly
                                                className="w-5 h-5 accent-brand-600 cursor-pointer pointer-events-none"
                                                id="terms"
                                            />
                                        </div>
                                        <div className="flex-1">
                                            <div className="flex items-center justify-between">
                                                <label
                                                    htmlFor="terms"
                                                    className="text-sm text-slate-600 cursor-pointer font-medium pointer-events-none"
                                                >
                                                    <span className="text-rose-500 font-bold mr-1">[필수]</span>
                                                    서비스 이용약관 동의
                                                </label>
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setIsTermsModalOpen(true);
                                                    }}
                                                    className="text-xs text-slate-500 underline hover:text-brand-600"
                                                >
                                                    전문 보기
                                                </button>
                                            </div>
                                            <p className="text-xs text-slate-400 mt-1">
                                                수학ETF 서비스 이용을 위한 약관입니다.
                                            </p>
                                        </div>
                                    </div>
                                    <div
                                        className="flex items-start gap-3 p-4 border rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
                                        onClick={() => {
                                            if (privacyAgreed) {
                                                setPrivacyAgreed(false);
                                            } else {
                                                setIsPrivacyModalOpen(true);
                                            }
                                        }}
                                    >
                                        <div className="flex items-center h-5">
                                            <input
                                                type="checkbox"
                                                checked={privacyAgreed}
                                                readOnly
                                                className="w-5 h-5 accent-brand-600 cursor-pointer pointer-events-none"
                                                id="privacy"
                                            />
                                        </div>
                                        <div className="flex-1">
                                            <div className="flex items-center justify-between">
                                                <label
                                                    htmlFor="privacy"
                                                    className="text-sm text-slate-600 cursor-pointer font-medium pointer-events-none"
                                                >
                                                    <span className="text-rose-500 font-bold mr-1">[필수]</span>
                                                    개인정보 수집 및 이용 동의
                                                </label>
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setIsPrivacyModalOpen(true);
                                                    }}
                                                    className="text-xs text-slate-500 underline hover:text-brand-600"
                                                >
                                                    전문 보기
                                                </button>
                                            </div>
                                            <p className="text-xs text-slate-400 mt-1">
                                                회원가입 및 서비스 운영을 위해 최소한의 정보를 수집합니다.
                                            </p>
                                        </div>
                                    </div>
                                    <div
                                        className="flex items-start gap-3 p-4 border rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
                                        onClick={() => setMarketingAgreed(!marketingAgreed)}
                                    >
                                        <div className="flex items-center h-5">
                                            <input
                                                type="checkbox"
                                                checked={marketingAgreed}
                                                onChange={(e) => setMarketingAgreed(e.target.checked)}
                                                className="w-5 h-5 accent-brand-600 cursor-pointer"
                                                id="marketing"
                                            />
                                        </div>
                                        <div className="flex-1">
                                            <div className="flex items-center justify-between">
                                                <label
                                                    htmlFor="marketing"
                                                    className="text-sm text-slate-600 cursor-pointer font-medium"
                                                >
                                                    <span className="text-slate-500 font-bold mr-1">[선택]</span>
                                                    마케팅 정보 수신 동의
                                                </label>
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setIsMarketingModalOpen(true);
                                                    }}
                                                    className="text-xs text-slate-500 underline hover:text-brand-600"
                                                >
                                                    전문 보기
                                                </button>
                                            </div>
                                            <p className="text-xs text-slate-400 mt-1">
                                                이벤트 및 혜택 정보를 받으실 수 있습니다.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                                <div className="pt-4">
                                    <button
                                        onClick={handleNextStep}
                                        disabled={!termsAgreed || !privacyAgreed}
                                        className={`w-full py-3 rounded-lg font-bold transition-colors ${termsAgreed && privacyAgreed ? 'bg-brand-600 text-white hover:bg-brand-700' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}
                                    >
                                        다음
                                    </button>
                                </div>
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
                            <form onSubmit={handleSignup} className="space-y-5">
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-bold text-slate-700 mb-1">이메일 (아이디)</label>
                                        <div className="flex gap-2">
                                            <input
                                                type="email"
                                                value={email}
                                                onChange={(e) => {
                                                    setEmail(e.target.value);
                                                    if (emailStatus === 'available') setEmailStatus('idle'); // Reset checking if changed
                                                }}
                                                className="flex-1 px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-brand-500"
                                                placeholder="example@email.com"
                                                required
                                            />
                                            <button
                                                type="button"
                                                onClick={handleCheckEmail}
                                                disabled={emailStatus === 'checking' || (emailStatus === 'available' && email === checkedEmail)}
                                                className={`px-3 py-2 text-sm font-bold rounded-lg border transition-colors whitespace-nowrap
                                                    ${emailStatus === 'available' && email === checkedEmail
                                                        ? 'bg-green-50 text-green-600 border-green-200'
                                                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'}`}
                                            >
                                                {emailStatus === 'checking' ? '확인 중...' :
                                                    emailStatus === 'available' && email === checkedEmail ? '사용 가능' : '중복확인'}
                                            </button>
                                        </div>
                                        {emailStatus === 'available' && email === checkedEmail && (
                                            <p className="text-xs text-green-600 mt-1 pl-1">사용 가능한 이메일입니다.</p>
                                        )}
                                        {emailStatus === 'taken' && (
                                            <p className="text-xs text-red-500 mt-1 pl-1">이미 사용 중인 이메일입니다.</p>
                                        )}
                                    </div>
                                    <div>
                                        <label className="block text-sm font-bold text-slate-700 mb-1">닉네임</label>
                                        <input
                                            type="text"
                                            value={nickname}
                                            onChange={(e) => setNickname(e.target.value)}
                                            className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-brand-500"
                                            placeholder="활동명 입력"
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-bold text-slate-700 mb-1">비밀번호</label>
                                        <input
                                            type="password"
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-brand-500"
                                            placeholder="영문, 숫자 6자리 이상"
                                            required
                                            minLength={6}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-bold text-slate-700 mb-1">비밀번호 확인</label>
                                        <input
                                            type="password"
                                            value={confirmPassword}
                                            onChange={(e) => setConfirmPassword(e.target.value)}
                                            className={`w-full px-4 py-2 border rounded-lg focus:outline-none ${password && confirmPassword && password !== confirmPassword ? 'border-red-500 bg-red-50' : 'border-slate-200 focus:border-brand-500'}`}
                                            placeholder="비밀번호 재입력"
                                            required
                                        />
                                        {password && confirmPassword && password !== confirmPassword && (
                                            <p className="text-xs text-red-500 mt-1">비밀번호가 일치하지 않습니다.</p>
                                        )}
                                    </div>
                                </div>

                                {errorMsg && (
                                    <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg text-center">
                                        {errorMsg}
                                    </div>
                                )}

                                <div className="flex gap-3 pt-4">
                                    <button
                                        type="button"
                                        onClick={() => setStep(1)}
                                        className="flex-1 py-3 border border-slate-200 rounded-lg font-bold text-slate-600 hover:bg-slate-50"
                                    >
                                        이전
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={loading}
                                        className="flex-1 py-3 bg-brand-600 text-white rounded-lg font-bold hover:bg-brand-700 disabled:opacity-50"
                                    >
                                        {loading ? '가입 중...' : '회원가입 완료'}
                                    </button>
                                </div>
                            </form>
                        )}
                        <div className="text-center mt-6">
                            <Link href="/" className="text-sm text-slate-500 underline">
                                이미 계정이 있으신가요? 홈으로 이동
                            </Link>
                        </div>
                    </>
                )
                }
            </div >
        </div >
    );
}
