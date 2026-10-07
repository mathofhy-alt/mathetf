'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { Check } from 'lucide-react';

export default function UpdatePasswordPage() {
    const [password, setPassword] = useState('');
    const [confirmPw, setConfirmPw] = useState('');
    const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [msg, setMsg] = useState('');
    const supabase = createClient();
    const router = useRouter();

    useEffect(() => {
        // Check if we have a session (the link should log them in)
        const checkSession = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                setStatus('error');
                setMsg('유효하지 않은 접근이거나 세션이 만료되었습니다. 다시 시도해주세요.');
            }
        };
        checkSession();
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (password !== confirmPw) {
            setMsg('비밀번호가 일치하지 않습니다.');
            return;
        }

        setStatus('loading');
        setMsg('');

        try {
            const { error } = await supabase.auth.updateUser({
                password: password
            });

            if (error) {
                setStatus('error');
                setMsg(error.message);
            } else {
                setStatus('success');
                setMsg('비밀번호가 성공적으로 변경되었습니다!');
                setTimeout(() => {
                    router.push('/');
                }, 2000);
            }
        } catch (err) {
            console.error(err);
            setStatus('error');
            setMsg('오류가 발생했습니다.');
        }
    };

    // 새 비밀번호 설정(10/7 새 디자인) — 로그인과 같은 계정 화면 틀(rd-auth). 세션 확인·변경 흐름은 그대로.
    return (
        <div className="rd rd-auth">
            <div className="rd-auth-card">
                <Link href="/" className="rd-auth-brand"><Image src="/icon.svg" alt="" width={32} height={32} /><span>수학ETF</span></Link>
                <h1 className="rd-auth-title">새 비밀번호 설정</h1>

                {status === 'success' ? (
                    <div className="rd-auth-done">
                        <div className="rd-auth-done-icon" aria-hidden="true"><Check size={30} strokeWidth={2.6} /></div>
                        <h2 role="status">변경 완료</h2>
                        <p>잠시 후 메인으로 이동합니다...</p>
                    </div>
                ) : (
                    <>
                        <p className="rd-auth-sub">앞으로 로그인할 때 쓸 새 비밀번호를 입력해 주세요.</p>
                        <form onSubmit={handleSubmit} className="rd-auth-form">
                            <label className="rd-auth-label" htmlFor="pw">새 비밀번호</label>
                            <input
                                id="pw"
                                type="password"
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                className="rd-input"
                                autoComplete="new-password"
                                placeholder="영문, 숫자 6자리 이상"
                                required
                                minLength={6}
                            />

                            <label className="rd-auth-label" htmlFor="cpw">비밀번호 확인</label>
                            <input
                                id="cpw"
                                type="password"
                                value={confirmPw}
                                onChange={e => setConfirmPw(e.target.value)}
                                className="rd-input"
                                autoComplete="new-password"
                                placeholder="비밀번호 재입력"
                                required
                                minLength={6}
                            />

                            {status === 'error' && (
                                <p className="rd-auth-error" role="alert">
                                    {msg}
                                </p>
                            )}
                            {msg && status !== 'error' && (
                                <p className="rd-auth-error" role="alert">
                                    {msg}
                                </p>
                            )}

                            <button
                                type="submit"
                                disabled={status === 'loading'}
                                className="rd-btn rd-btn-primary rd-btn-block rd-auth-submit"
                            >
                                {status === 'loading' ? '변경 중...' : '비밀번호 변경하기'}
                            </button>
                        </form>
                        <div className="rd-auth-links">
                            <Link href="/forgot-password">재설정 메일 다시 받기</Link>
                        </div>
                    </>
                )}
            </div>
            <Link className="rd-auth-home" href="/">홈으로 돌아가기</Link>
        </div>
    );
}
