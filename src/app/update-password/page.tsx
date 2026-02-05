'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useRouter } from 'next/navigation';

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

    return (
        <div className="flex-1 flex flex-col items-center justify-center min-h-screen bg-slate-50 px-4">
            <div className="w-full max-w-md bg-white p-8 rounded-lg shadow-sm border border-slate-200">
                <h1 className="text-2xl font-bold text-slate-800 mb-6">새 비밀번호 설정</h1>

                {status === 'success' ? (
                    <div className="text-center">
                        <div className="w-12 h-12 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4 text-xl">
                            ✅
                        </div>
                        <p className="text-green-700 font-bold mb-2">변경 완료!</p>
                        <p className="text-slate-500 text-sm">잠시 후 메인으로 이동합니다...</p>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-1" htmlFor="pw">새 비밀번호</label>
                            <input
                                id="pw"
                                type="password"
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                className="w-full px-4 py-2 border border-slate-300 rounded focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none"
                                placeholder="영문, 숫자 6자리 이상"
                                required
                                minLength={6}
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-1" htmlFor="cpw">비밀번호 확인</label>
                            <input
                                id="cpw"
                                type="password"
                                value={confirmPw}
                                onChange={e => setConfirmPw(e.target.value)}
                                className="w-full px-4 py-2 border border-slate-300 rounded focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none"
                                placeholder="비밀번호 재입력"
                                required
                                minLength={6}
                            />
                        </div>

                        {status === 'error' && (
                            <div className="text-red-600 text-sm font-bold bg-red-50 p-2 rounded">
                                {msg}
                            </div>
                        )}
                        {msg && status !== 'error' && status !== 'success' && (
                            <div className="text-red-500 text-sm font-bold">
                                {msg}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={status === 'loading'}
                            className="w-full bg-brand-600 text-white py-3 rounded-lg font-bold hover:bg-brand-700 transition-colors disabled:opacity-50"
                        >
                            {status === 'loading' ? '변경 중...' : '비밀번호 변경하기'}
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
}
