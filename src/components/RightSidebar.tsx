"use client";

import React, { useState } from 'react';
import { User, LogIn, ChevronRight, FileText, MessageSquare } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import Link from 'next/link';

export default function RightSidebar({ user, points }: { user: any, points: number }) {
    const supabase = createClient();
    const [loginId, setLoginId] = useState('');
    const [loginPw, setLoginPw] = useState('');
    const [loading, setLoading] = useState(false);
    const [recentFiles, setRecentFiles] = useState<any[]>([]);

    React.useEffect(() => {
        const fetchRecentFiles = async () => {
            const { data } = await supabase
                .from('exam_materials')
                .select('id, title')
                .order('created_at', { ascending: false })
                .limit(5);
            if (data) setRecentFiles(data);
        };
        fetchRecentFiles();
    }, []);

    const [loginError, setLoginError] = useState<string | null>(null);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setLoginError(null); // Reset error

        const { error } = await supabase.auth.signInWithPassword({
            email: loginId,
            password: loginPw,
        });

        if (error) {
            let msg = '로그인에 실패했습니다.';
            if (error.message.includes('Invalid login credentials')) {
                msg = '아이디 또는 비밀번호가 잘못되었습니다.';
            } else if (error.message.includes('Email not confirmed')) {
                msg = '이메일 인증이 필요합니다.';
            }
            setLoginError(msg);
        } else {
            window.location.reload();
        }
        setLoading(false);
    };

    return (
        <div className="w-full space-y-6">
            {/* Login Widget */}
            <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm">
                {user ? (
                    <div className="text-center">
                        <div className="w-16 h-16 bg-blue-100 rounded-full mx-auto mb-3 flex items-center justify-center text-brand-600">
                            <User size={32} />
                        </div>
                        <p className="font-bold text-slate-800 mb-1">{user.email}</p>
                        <div className="flex justify-center items-center gap-2 mt-4">
                            <button onClick={() => supabase.auth.signOut().then(() => window.location.reload())} className="text-xs text-slate-500 underline">로그아웃</button>
                            <span className="text-slate-300">|</span>
                            <Link href="/mypage" className="text-xs text-slate-500 underline">마이페이지</Link>
                        </div>
                    </div>
                ) : (
                    <form onSubmit={handleLogin} className="space-y-3">
                        <input
                            type="email"
                            placeholder="아이디(이메일)"
                            className="w-full px-3 py-2 border border-slate-200 rounded text-sm focus:border-brand-500 focus:outline-none"
                            value={loginId}
                            onChange={e => setLoginId(e.target.value)}
                            required
                        />
                        <input
                            type="password"
                            placeholder="비밀번호"
                            className="w-full px-3 py-2 border border-slate-200 rounded text-sm focus:border-brand-500 focus:outline-none"
                            value={loginPw}
                            onChange={e => setLoginPw(e.target.value)}
                            required
                        />
                        {loginError && (
                            <div className="text-xs text-red-600 font-bold px-1">
                                {loginError}
                            </div>
                        )}
                        <div className="flex gap-2">
                            <button type="submit" disabled={loading} className="flex-1 bg-brand-600 hover:bg-brand-700 text-white py-2 rounded text-sm font-bold transition-colors">
                                {loading ? '...' : '로그인'}
                            </button>
                            <Link href="/signup" className="flex-1 bg-rose-600 hover:bg-rose-700 text-white py-2 rounded text-sm font-bold text-center transition-colors">
                                회원가입
                            </Link>
                        </div>
                        <div className="text-center mt-2">
                            <Link href="/forgot-password" className="text-xs text-slate-400 hover:text-slate-600">비밀번호 재설정</Link>
                        </div>
                    </form>
                )}
            </div>

            {/* Recently Updated Items */}
            <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm">
                <h3 className="font-bold text-slate-800 mb-4 text-sm border-b pb-2 border-slate-100">
                    최근 업데이트 된 자료
                </h3>
                <ul className="space-y-3">
                    {recentFiles.length > 0 ? recentFiles.map((file, i) => (
                        <li key={file.id} className="flex items-start gap-2 text-sm group cursor-pointer">
                            <span className={`flex-shrink-0 w-5 h-5 flex items-center justify-center rounded text-xs font-bold text-white ${i <= 2 ? 'bg-brand-500' : 'bg-slate-300'}`}>
                                {i + 1}
                            </span>
                            <span className="text-slate-600 group-hover:text-brand-600 line-clamp-1 group-hover:underline">
                                {file.title}
                            </span>
                        </li>
                    )) : (
                        <li className="text-xs text-slate-400 text-center py-4">최근 자료가 없습니다.</li>
                    )}
                </ul>
            </div>


        </div>
    );
}
