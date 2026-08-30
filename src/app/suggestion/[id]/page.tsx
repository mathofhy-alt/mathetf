"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { createClient } from '@/utils/supabase/client';
import { ArrowLeft, Clock, Eye, Lock, User as UserIcon, MessageSquare, Send } from 'lucide-react';
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

    // 관리자 답변
    const [isAdmin, setIsAdmin] = useState(false);
    const [replyDraft, setReplyDraft] = useState('');
    const [replyEditing, setReplyEditing] = useState(false);
    const [replySaving, setReplySaving] = useState(false);

    const supabase = createClient();

    useEffect(() => {
        if (!id) return;

        const fetchData = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            setUser(user);

            // 본문·비밀번호는 서버에서만 다룸 — 여기선 메타만 (작성자/관리자면 서버가 본문 포함해 줌)
            try {
                const res = await fetch(`/api/suggestions/${id}`);
                const j = await res.json();
                if (res.ok && j.post) {
                    setData(j.post);
                    if (j.unlocked) setIsUnlocked(true);
                    if (j.isAdmin) setIsAdmin(true);
                    setReplyDraft(j.post.admin_reply || '');
                }
            } catch { }
            setLoading(false);
        };

        fetchData();
    }, [id, supabase]);

    const [verifying, setVerifying] = useState(false);
    const handlePasswordSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (verifying) return;
        setVerifying(true);
        try {
            const res = await fetch(`/api/suggestions/${id}/verify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password: inputPassword }),
            });
            const j = await res.json();
            if (res.ok && j.post) {
                setData(j.post);
                setIsUnlocked(true);
                setPasswordError(false);
            } else {
                setPasswordError(true);
            }
        } catch {
            setPasswordError(true);
        }
        setVerifying(false);
    };

    const handleDelete = async () => {
        if (!deleteConfirm) {
            setDeleteConfirm(true);
            setTimeout(() => setDeleteConfirm(false), 3000); // Reset after 3 seconds
            return;
        }

        try {
            const res = await fetch(`/api/suggestions/${id}`, { method: 'DELETE' });
            const j = await res.json();
            if (!res.ok) throw new Error(j.error || '삭제 실패');

            alert('삭제되었습니다.');
            router.push('/suggestion');
        } catch (e: any) {
            console.error(e);
            alert('삭제 실패: ' + e.message);
        }
    };

    const handleReplySave = async () => {
        setReplySaving(true);
        try {
            const res = await fetch(`/api/suggestions/${id}/reply`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reply: replyDraft }),
            });
            const j = await res.json();
            if (!res.ok) throw new Error(j.error || '저장 실패');
            setData((prev: any) => ({
                ...prev,
                admin_reply: j.admin_reply,
                admin_replied_at: j.admin_reply ? new Date().toISOString() : null,
            }));
            setReplyEditing(false);
        } catch (e: any) {
            alert(e.message || '저장에 실패했습니다.');
        } finally {
            setReplySaving(false);
        }
    };

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
                        <span className="text-xl font-bold text-slate-800">비밀글 보호</span>
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
                    <span className="text-xl font-bold text-slate-800">건의사항</span>
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
                                {(data.views || 0) + 1}
                            </span>
                        </div>
                    </div>

                    <div className="p-8 min-h-[240px] text-slate-700 leading-relaxed whitespace-pre-wrap">
                        {data.content}
                    </div>

                    {/* 관리자 답변 — 작성자와 관리자에게만 보인다(잠긴 사람은 본문부터 못 본다) */}
                    {(data.admin_reply || isAdmin) && (
                        <div className="border-t border-slate-100 bg-brand-50/40 p-8">
                            <div className="flex items-center gap-2 mb-3">
                                <MessageSquare size={16} className="text-brand-600" />
                                <span className="text-sm font-bold text-brand-700">답변</span>
                                {data.admin_replied_at && !replyEditing && (
                                    <span className="text-xs text-slate-400">
                                        {new Date(data.admin_replied_at).toLocaleDateString()}
                                    </span>
                                )}
                            </div>

                            {isAdmin && replyEditing ? (
                                <div className="space-y-3">
                                    <textarea
                                        value={replyDraft}
                                        onChange={e => setReplyDraft(e.target.value)}
                                        rows={6}
                                        autoFocus
                                        placeholder="답변을 입력하세요. 작성자에게만 보입니다."
                                        className="w-full px-4 py-3 border border-slate-300 rounded-lg text-sm leading-relaxed focus:border-brand-500 focus:outline-none resize-y"
                                    />
                                    <div className="flex gap-2">
                                        <button
                                            onClick={handleReplySave}
                                            disabled={replySaving}
                                            className="flex items-center gap-1.5 px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-bold hover:bg-brand-700 disabled:opacity-60"
                                        >
                                            <Send size={14} />
                                            {replySaving ? '저장 중…' : '답변 등록'}
                                        </button>
                                        <button
                                            onClick={() => { setReplyDraft(data.admin_reply || ''); setReplyEditing(false); }}
                                            className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-bold text-slate-600 hover:bg-slate-50"
                                        >
                                            취소
                                        </button>
                                    </div>
                                </div>
                            ) : data.admin_reply ? (
                                <div className="text-slate-700 leading-relaxed whitespace-pre-wrap">
                                    {data.admin_reply}
                                    {isAdmin && (
                                        <button
                                            onClick={() => setReplyEditing(true)}
                                            className="block mt-4 text-xs font-bold text-slate-400 hover:text-slate-600 underline"
                                        >
                                            답변 수정
                                        </button>
                                    )}
                                </div>
                            ) : (
                                <button
                                    onClick={() => setReplyEditing(true)}
                                    className="text-sm font-bold text-brand-600 hover:text-brand-700"
                                >
                                    + 답변 작성
                                </button>
                            )}
                        </div>
                    )}

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
