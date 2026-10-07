"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { createClient } from '@/utils/supabase/client';
import { ArrowLeft, Clock, Eye, Lock, User as UserIcon, MessageSquare, Send, PenLine } from 'lucide-react';
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

    const shell = (msg: string) => (
        <div className="rd rd-x rd-bd">
            <Header user={user} />
            <p className="rd-bd-status" role="status">{msg}</p>
        </div>
    );
    if (loading) return shell('로딩중...');
    if (!data) return shell('글을 찾을 수 없습니다.');

    // Locked View
    if (!isUnlocked) {
        return (
            <div className="rd rd-x rd-bd">
                <Header user={user} />
                <section className="rd-wrap rd-x-top rd-bd-read">
                    <Link href="/suggestion" className="rd-x-back"><ArrowLeft size={18} /> 건의사항</Link>
                    <div className="rd-bd-lock">
                        <span className="rd-bd-lock-icon"><Lock size={28} aria-hidden /></span>
                        <p className="rd-bd-lock-kicker">비밀글 보호</p>
                        <h2>비밀글입니다</h2>
                        <p>작성자와 관리자만 볼 수 있습니다. <br />비밀번호를 입력해주세요.</p>

                        <form onSubmit={handlePasswordSubmit} className="rd-bd-lock-form">
                            <input
                                type="password"
                                value={inputPassword}
                                onChange={e => setInputPassword(e.target.value)}
                                className={passwordError ? 'rd-input rd-bd-pw is-bad' : 'rd-input rd-bd-pw'}
                                placeholder="비밀번호 입력"
                                aria-label="비밀번호 입력"
                                autoFocus
                            />
                            {passwordError && <p className="rd-auth-error" role="alert">비밀번호가 일치하지 않습니다.</p>}
                            <button
                                type="submit"
                                className="rd-btn rd-btn-primary rd-btn-block"
                            >
                                확인
                            </button>
                        </form>
                    </div>
                </section>
            </div>
        );
    }

    // Unlocked View
    return (
        <div className="rd rd-x rd-bd">
            <Header user={user} />
            <article className="rd-wrap rd-x-top rd-bd-read">
                <Link href="/suggestion" className="rd-x-back"><ArrowLeft size={18} /> 건의사항</Link>
                <span className="rd-bd-tag"><Lock size={12} aria-hidden />비밀글</span>
                <h1 className="rd-bd-title">{data.title}</h1>
                <p className="rd-bd-meta">
                    <span><Clock size={15} aria-hidden />{new Date(data.created_at).toLocaleDateString()}</span>
                    <span><Eye size={15} aria-hidden />조회 {(data.views || 0) + 1}</span>
                </p>

                <div className="rd-bd-body">
                    {data.content}
                </div>

                {/* 관리자 답변 — 작성자와 관리자에게만 보인다(잠긴 사람은 본문부터 못 본다) */}
                {(data.admin_reply || isAdmin) && (
                    <div className="rd-bd-reply">
                        <div className="rd-bd-reply-head">
                            <MessageSquare size={18} aria-hidden />
                            <b>답변</b>
                            {data.admin_replied_at && !replyEditing && (
                                <span>{new Date(data.admin_replied_at).toLocaleDateString()}</span>
                            )}
                        </div>

                        {isAdmin && replyEditing ? (
                            <div className="rd-bd-reply-edit">
                                <textarea
                                    value={replyDraft}
                                    onChange={e => setReplyDraft(e.target.value)}
                                    rows={6}
                                    autoFocus
                                    aria-label="답변 내용"
                                    placeholder="답변을 입력하세요. 작성자에게만 보입니다."
                                    className="rd-input rd-bd-textarea rd-bd-reply-input"
                                />
                                <div className="rd-bd-actions is-left">
                                    <button
                                        onClick={handleReplySave}
                                        disabled={replySaving}
                                        className="rd-btn rd-btn-primary"
                                    >
                                        <Send size={16} aria-hidden />
                                        {replySaving ? '저장 중…' : '답변 등록'}
                                    </button>
                                    <button
                                        onClick={() => { setReplyDraft(data.admin_reply || ''); setReplyEditing(false); }}
                                        className="rd-btn rd-btn-gray"
                                    >
                                        취소
                                    </button>
                                </div>
                            </div>
                        ) : data.admin_reply ? (
                            <div className="rd-bd-reply-body">
                                {data.admin_reply}
                                {isAdmin && (
                                    <button
                                        onClick={() => setReplyEditing(true)}
                                        className="rd-bd-textbtn"
                                    >
                                        답변 수정
                                    </button>
                                )}
                            </div>
                        ) : (
                            <button
                                onClick={() => setReplyEditing(true)}
                                className="rd-btn rd-btn-tint rd-btn-sm"
                            >
                                <PenLine size={15} aria-hidden />
                                답변 작성
                            </button>
                        )}
                    </div>
                )}

                <div className="rd-bd-foot">
                    <Link href="/suggestion" className="rd-btn rd-btn-gray">
                        목록으로
                    </Link>
                    {user && (user.id === data.author_id || user.email === 'mathofhy@naver.com') && (
                        <button
                            onClick={handleDelete}
                            className={deleteConfirm ? 'rd-btn rd-btn-danger is-confirm' : 'rd-btn rd-btn-danger'}
                        >
                            {deleteConfirm ? '정말 삭제하시겠습니까?' : '삭제하기'}
                        </button>
                    )}
                </div>
            </article>
        </div>
    );
}
