"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { ArrowLeft, Lock } from 'lucide-react';

export default function SuggestionWritePage() {
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [password, setPassword] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const router = useRouter();
    const supabase = createClient();

    // 진입 가드: 비로그인 사용자는 폼 작성 전에 로그인으로 (제출 후 튕기며 입력 소실되던 것 방지)
    useEffect(() => {
        supabase.auth.getUser().then(({ data: { user } }) => {
            if (!user) {
                alert('로그인이 필요합니다.');
                router.replace('/login');
            }
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!title.trim() || !content.trim() || !password.trim()) {
            return alert('제목, 내용, 비밀번호를 모두 입력해주세요.');
        }

        setSubmitting(true);

        try {
            const res = await fetch('/api/suggestions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title, content, password }),
            });
            const j = await res.json();
            if (res.status === 401) {
                alert('로그인이 필요합니다.');
                router.push('/login');
                return;
            }
            if (!res.ok) throw new Error(j.error || '등록 실패');

            alert('건의사항이 등록되었습니다.');
            router.push('/suggestion');
        } catch (error: any) {
            console.error(error);
            alert('등록 실패: ' + error.message);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#f3f4f6]">
            <header className="bg-white border-b border-slate-200">
                <div className="max-w-[800px] mx-auto px-4 h-16 flex items-center gap-4">
                    <Link href="/suggestion" className="text-slate-500 hover:text-slate-800"><ArrowLeft /></Link>
                    <h1 className="text-xl font-bold text-slate-800">건의사항 등록</h1>
                </div>
            </header>

            <main className="max-w-[800px] mx-auto px-4 py-8">
                <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden p-8 space-y-6">
                    <div className="bg-blue-50 p-4 rounded text-sm text-blue-700 mb-6">
                        <p className="font-bold mb-1">🔒 비밀글로 등록됩니다.</p>
                        <p>작성하신 비밀번호를 통해 본인만 조회할 수 있으며, 관리자는 별도 확인 가능합니다.</p>
                    </div>

                    <div>
                        <label className="block text-sm font-bold text-slate-700 mb-2">제목</label>
                        <input
                            type="text"
                            value={title}
                            onChange={e => setTitle(e.target.value)}
                            className="w-full px-4 py-2 border border-slate-300 rounded focus:border-brand-500 focus:outline-none"
                            placeholder="제목을 입력하세요"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-bold text-slate-700 mb-2">비밀번호 설정</label>
                        <div className="relative">
                            <input
                                type="password"
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded focus:border-brand-500 focus:outline-none"
                                placeholder="글 확인용 비밀번호 입력"
                            />
                            <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        </div>
                        <p className="text-xs text-slate-400 mt-1">* 게시글 확인 시 필요하므로 꼭 기억해주세요.</p>
                    </div>

                    <div>
                        <label className="block text-sm font-bold text-slate-700 mb-2">내용</label>
                        <textarea
                            value={content}
                            onChange={e => setContent(e.target.value)}
                            className="w-full h-80 px-4 py-2 border border-slate-300 rounded focus:border-brand-500 focus:outline-none resize-none"
                            placeholder="내용을 입력하세요"
                        />
                    </div>

                    <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                        <Link href="/suggestion" className="px-6 py-2 border border-slate-300 rounded text-sm font-bold text-slate-600 hover:bg-slate-50">
                            취소
                        </Link>
                        <button
                            type="submit"
                            disabled={submitting}
                            className="px-6 py-2 bg-brand-600 text-white rounded text-sm font-bold hover:bg-brand-700 disabled:opacity-50"
                        >
                            {submitting ? '등록 중...' : '등록하기'}
                        </button>
                    </div>
                </form>
            </main>
        </div>
    );
}
