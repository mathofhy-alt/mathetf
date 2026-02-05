'use client';

import React, { useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import Link from 'next/link';

export default function ForgotPasswordPage() {
    const [email, setEmail] = useState('');
    const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [msg, setMsg] = useState('');
    const supabase = createClient();

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

    return (
        <div className="flex-1 flex flex-col items-center justify-center min-h-screen bg-slate-50 px-4">
            <div className="w-full max-w-md bg-white p-8 rounded-lg shadow-sm border border-slate-200">
                <h1 className="text-2xl font-bold text-slate-800 mb-2">비밀번호 재설정</h1>
                <p className="text-slate-500 mb-6 text-sm">
                    가입하신 이메일 주소를 입력하시면 비밀번호 재설정 링크를 보내드립니다.
                </p>

                {status === 'success' ? (
                    <div className="text-center">
                        <div className="w-12 h-12 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4 text-xl">
                            ✅
                        </div>
                        <p className="text-green-700 font-bold mb-6">{msg}</p>
                        <Link href="/" className="block w-full bg-slate-100 text-slate-700 py-3 rounded-lg font-bold hover:bg-slate-200 transition-colors text-center">
                            홈으로 돌아가기
                        </Link>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-1" htmlFor="email">이메일</label>
                            <input
                                id="email"
                                type="email"
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                className="w-full px-4 py-2 border border-slate-300 rounded focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none"
                                placeholder="example@email.com"
                                required
                            />
                        </div>

                        {status === 'error' && (
                            <div className="text-red-600 text-sm font-bold bg-red-50 p-2 rounded">
                                {msg}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={status === 'loading'}
                            className="w-full bg-brand-600 text-white py-3 rounded-lg font-bold hover:bg-brand-700 transition-colors disabled:opacity-50"
                        >
                            {status === 'loading' ? '전송 중...' : '재설정 링크 보내기'}
                        </button>

                        <div className="text-center mt-4">
                            <Link href="/" className="text-sm text-slate-500 hover:underline">
                                취소하고 돌아가기
                            </Link>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
}
