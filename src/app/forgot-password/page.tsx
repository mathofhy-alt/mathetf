'use client';

import React, { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import Link from 'next/link';
import Image from 'next/image';
import { MailCheck } from 'lucide-react';

export default function ForgotPasswordPage() {
    const [email, setEmail] = useState('');
    const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [msg, setMsg] = useState('');
    const supabase = createClient();
    // 재설정 링크가 다른 기기에서 열려 실패하면 /auth/callback 이 이유를 ?message= 로 붙여 이리 보낸다
    useEffect(() => {
        const m = new URLSearchParams(window.location.search).get('message');
        if (m) { setStatus('error'); setMsg(m.slice(0, 200)); }
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setStatus('loading');
        setMsg('');

        try {
            const { error } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: `${window.location.origin}/auth/callback?next=/update-password`,
            });

            if (error) {
                setStatus('error');
                setMsg(error.message);
                // Translate common errors
                if (error.message.includes('rate limit')) setMsg('잠시 후 다시 시도해주세요.');
            } else {
                setStatus('success');
                setMsg('비밀번호 재설정 메일이 발송되었습니다. 메일함을 확인해주세요.');
            }
        } catch (err) {
            console.error(err);
            setStatus('error');
            setMsg('오류가 발생했습니다.');
        }
    };

    // 비밀번호 재설정 메일(10/7 새 디자인) — 로그인과 같은 계정 화면 틀(rd-auth). 전송 흐름은 그대로.
    return (
        <div className="rd rd-auth">
            <div className="rd-auth-card">
                <Link href="/" className="rd-auth-brand"><Image src="/icon.svg" alt="" width={32} height={32} /><span>수학ETF</span></Link>
                <h1 className="rd-auth-title">비밀번호 재설정</h1>
                <p className="rd-auth-sub">
                    가입하신 이메일 주소를 입력하시면 비밀번호 재설정 링크를 보내드립니다.
                </p>

                {status === 'success' ? (
                    <div className="rd-auth-done">
                        <div className="rd-auth-done-icon" aria-hidden="true"><MailCheck size={28} strokeWidth={2.2} /></div>
                        <p className="rd-auth-ok" role="status">{msg}</p>
                        <div className="rd-auth-actions">
                            <Link href="/" className="rd-btn rd-btn-gray">
                                홈으로 돌아가기
                            </Link>
                        </div>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="rd-auth-form">
                        <label className="rd-auth-label" htmlFor="email">이메일</label>
                        <input
                            id="email"
                            type="email"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            className="rd-input"
                            autoComplete="email"
                            placeholder="example@email.com"
                            required
                        />

                        {status === 'error' && (
                            <p className="rd-auth-error" role="alert">
                                {msg}
                            </p>
                        )}

                        <button
                            type="submit"
                            disabled={status === 'loading'}
                            className="rd-btn rd-btn-primary rd-btn-block rd-auth-submit"
                        >
                            {status === 'loading' ? '전송 중...' : '재설정 링크 보내기'}
                        </button>
                    </form>
                )}

                {status !== 'success' && (
                    <div className="rd-auth-links">
                        <Link href="/">취소하고 돌아가기</Link>
                        <Link href="/find-id">아이디 찾기</Link>
                    </div>
                )}
            </div>
            {status !== 'success' && <Link className="rd-auth-home" href="/login">로그인으로 돌아가기</Link>}
        </div>
    );
}
