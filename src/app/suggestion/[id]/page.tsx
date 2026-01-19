"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { createClient } from '@/utils/supabase/client';
import { ArrowLeft, Clock, Eye, Lock, User as UserIcon } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { User } from '@supabase/supabase-js';
import Header from '@/components/Header';

export default function SuggestionDetailPage() {
    const params = useParams();
    const router = useRouter();
    const id = params?.id as string;

    // Data State
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [user, setUser] = useState<User | null>(null);

    // Password Check State
    const [isUnlocked, setIsUnlocked] = useState(false);
    const [inputPassword, setInputPassword] = useState('');
    const [passwordError, setPasswordError] = useState(false);
    const [deleteConfirm, setDeleteConfirm] = useState(false);

    const supabase = createClient();

    useEffect(() => {
        if (!id) return;

        const fetchData = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            setUser(user);

            // Fetch data (including password - in a real app, use RPC to check password securely)
            // Here we fetch it but client-side check for simplicity as per requirement.
            const { data: post, error } = await supabase
                .from('suggestions')
                .select('*')
                .eq('id', id)
                .single();

            if (post) {
                setData(post);

                // Auto unlock if:
                // 1. User is admin
                // 2. User is author
                if (user) {
                    if (user.email === 'mathofhy@naver.com' || user.id === post.author_id) {
                        setIsUnlocked(true);
                    }
                }

                // Increment Views
                await supabase.from('suggestions')
                    .update({ views: (post.views || 0) + 1 })
                    .eq('id', id);
            }
            setLoading(false);
        };

        fetchData();
    }, [id, supabase]);

    const handlePasswordSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (data && inputPassword === data.password) {
            setIsUnlocked(true);
            setPasswordError(false);
        } else {
            setPasswordError(true);
        }
    };

    const handleDelete = async () => {
        if (!deleteConfirm) {
            setDeleteConfirm(true);
            setTimeout(() => setDeleteConfirm(false), 3000); // Reset after 3 seconds
            return;
        }

        try {
            const { error } = await supabase
                .from('suggestions')
                .delete()
                .eq('id', id);

            if (error) throw error;

            alert('삭제되었습니다.');
            router.push('/suggestion');
        } catch (e: any) {
            console.error(e);
            alert('삭제 실패: ' + e.message);
        }
    };

    if (loading) return <div className="min-h-screen bg-[#f3f4f6] flex items-center justify-center">로딩중...</div>;
    if (!data) return <div className="min-h-screen bg-[#f3f4f6] flex items-center justify-center">글을 찾을 수 없습니다.</div>;

    // ... (Locked View omitted for brevity if unchanged, but context requires me to be careful. I will use the whole file content if needed, but here I can target the specific function and state if I place it right.)
    // Actually, I need to insert the state `deleteConfirm` inside the component.
    // And update the button text.

    // Let's do this in two chunks or one bigger chunk if I can capture the component start.
    // I'll update the function `handleDelete` and the button in the render.

    // This tool call is for handleDelete and state. I need to find where to put state.
    // The previous view shows `setPasswordError` around line 22. I can add state there.


    if (loading) return <div className="min-h-screen bg-[#f3f4f6] flex items-center justify-center">로딩중...</div>;
    if (!data) return <div className="min-h-screen bg-[#f3f4f6] flex items-center justify-center">글을 찾을 수 없습니다.</div>;

    // Locked View
    if (!isUnlocked) {
        return (
            <div className="min-h-screen bg-[#f3f4f6] text-slate-900 font-sans">
                <Header user={user} />
                <div className="bg-white border-b border-slate-200">
                    <div className="max-w-[1200px] mx-auto px-4 h-16 flex items-center gap-4">
                        <Link href="/suggestion" className="text-slate-500 hover:text-slate-800"><ArrowLeft /></Link>
                        <h1 className="text-xl font-bold text-slate-800">비밀글 보호</h1>
                    </div>
                </div>
                <main className="max-w-[400px] mx-auto px-4 py-20">
                    <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-8 text-center">
                        <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Lock size={32} className="text-slate-400" />
                        </div>
                        <h2 className="text-lg font-bold text-slate-800 mb-2">비밀글입니다</h2>
                        <p className="text-slate-500 mb-6 text-sm">작성자와 관리자만 볼 수 있습니다. <br />비밀번호를 입력해주세요.</p>

                        <form onSubmit={handlePasswordSubmit} className="space-y-4">
                            <input
                                type="password"
                                value={inputPassword}
                                onChange={e => setInputPassword(e.target.value)}
                                className="w-full px-4 py-3 border border-slate-300 rounded text-center text-lg tracking-widest focus:border-brand-500 focus:outline-none"
                                placeholder="비밀번호 입력"
                                autoFocus
                            />
                            {passwordError && <p className="text-red-500 text-sm font-bold">비밀번호가 일치하지 않습니다.</p>}
                            <button
                                type="submit"
                                className="w-full py-3 bg-brand-600 text-white rounded font-bold hover:bg-brand-700"
                            >
                                확인
                            </button>
                        </form>
                    </div>
                </main>
            </div>
        );
    }

    // Unlocked View
    return (
        <div className="min-h-screen bg-[#f3f4f6] text-slate-900 font-sans">
            <Header user={user} />
            <div className="bg-white border-b border-slate-200">
                <div className="max-w-[1200px] mx-auto px-4 h-16 flex items-center gap-4">
                    <Link href="/suggestion" className="text-slate-500 hover:text-slate-800"><ArrowLeft /></Link>
                    <h1 className="text-xl font-bold text-slate-800">건의사항</h1>
                </div>
            </div>

            <main className="max-w-[800px] mx-auto px-4 py-8">
                <article className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
                    <div className="p-8 border-b border-slate-100">
                        <div className="flex items-center gap-2 mb-3">
                            <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-xs font-bold rounded">비밀글</span>
                        </div>
                        <h1 className="text-2xl font-bold text-slate-900 mb-4">{data.title}</h1>
                        <div className="flex items-center gap-4 text-sm text-slate-500">
                            <span className="flex items-center gap-1">
                                <Clock size={14} />
                                {new Date(data.created_at).toLocaleDateString()}
                            </span>
                            <span className="flex items-center gap-1">
                                <Eye size={14} />
                                {data.views + 1}
                            </span>
                        </div>
                    </div>

                    <div className="p-8 min-h-[300px] text-slate-700 leading-relaxed whitespace-pre-wrap">
                        {data.content}
                    </div>

                    <div className="bg-slate-50 p-6 border-t border-slate-100 flex justify-center gap-2">
                        <Link href="/suggestion" className="px-6 py-2 bg-white border border-slate-300 rounded text-sm font-bold text-slate-600 hover:bg-slate-100 transition-colors">
                            목록으로
                        </Link>
                        {user && (user.id === data.author_id || user.email === 'mathofhy@naver.com') && (
                            <button
                                onClick={handleDelete}
                                className={`px-6 py-2 border rounded text-sm font-bold transition-colors ${deleteConfirm
                                    ? 'bg-red-600 text-white border-red-600 hover:bg-red-700'
                                    : 'bg-white text-red-600 border-red-200 hover:bg-red-50'
                                    }`}
                            >
                                {deleteConfirm ? '정말 삭제하시겠습니까?' : '삭제하기'}
                            </button>
                        )}
                    </div>
                </article>
            </main>
        </div>
    );
}
