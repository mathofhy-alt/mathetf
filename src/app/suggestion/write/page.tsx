"use client";

import Header from "@/components/Header";
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
        <div className="rd rd-x rd-bd">
            <Header />
            <section className="rd-wrap rd-x-top rd-bd-read">
                <Link href="/suggestion" className="rd-x-back"><ArrowLeft size={18} /> 건의사항</Link>
                <h1 className="rd-x-h1 rd-bd-form-h1">건의사항 등록</h1>

                <form onSubmit={handleSubmit} className="rd-bd-form">
                    <div className="rd-bd-note">
                        <Lock size={16} aria-hidden />
                        <span><b>비밀글로 등록됩니다.</b> 제목은 목록에 공개됩니다. 본문은 글 비밀번호로 확인하며, 관리자도 확인할 수 있습니다.</span>
                    </div>

                    <div className="rd-bd-field">
                        <label htmlFor="suggestion-title" className="rd-bd-label">제목</label>
                        <input
                            id="suggestion-title"
                            type="text"
                            value={title}
                            onChange={e => setTitle(e.target.value)}
                            className="rd-input"
                            placeholder="제목을 입력하세요"
                        />
                    </div>

                    <div className="rd-bd-field">
                        <label htmlFor="suggestion-password" className="rd-bd-label">비밀번호 설정</label>
                        <input
                            id="suggestion-password"
                            type="password"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            className="rd-input"
                            placeholder="글 확인용 비밀번호 입력"
                            aria-describedby="suggestion-password-hint"
                        />
                        <p id="suggestion-password-hint" className="rd-bd-hint">게시글을 확인할 때 필요하니 꼭 기억해 주세요.</p>
                    </div>

                    <div className="rd-bd-field">
                        <label htmlFor="suggestion-content" className="rd-bd-label">내용</label>
                        <textarea
                            id="suggestion-content"
                            value={content}
                            onChange={e => setContent(e.target.value)}
                            className="rd-input rd-bd-textarea"
                            placeholder="내용을 입력하세요"
                        />
                    </div>

                    <div className="rd-bd-actions">
                        <Link href="/suggestion" className="rd-btn rd-btn-gray">
                            취소
                        </Link>
                        <button
                            type="submit"
                            disabled={submitting}
                            className="rd-btn rd-btn-primary"
                        >
                            {submitting ? '등록 중...' : '등록하기'}
                        </button>
                    </div>
                </form>
            </section>
        </div>
    );
}
