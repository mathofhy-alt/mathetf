"use client";

import Header from "@/components/Header";
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { ArrowLeft, Lock } from 'lucide-react';
import { NOTIFY_WHEN, type NotifyWhen } from '@/lib/reportDoneNotice';

export default function SuggestionWritePage() {
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [hasPhone, setHasPhone] = useState<boolean | null>(null);
    const [notifySms, setNotifySms] = useState(true);
    const [notifyWhen, setNotifyWhen] = useState<NotifyWhen>('asap');

    const router = useRouter();
    const supabase = createClient();

    // 진입 가드: 비로그인 사용자는 폼 작성 전에 로그인으로 (제출 후 튕기며 입력 소실되던 것 방지)
    useEffect(() => {
        supabase.auth.getUser().then(({ data: { user } }) => {
            if (!user) {
                alert('로그인이 필요합니다.');
                router.replace('/login');
            } else {
                const phone = String(user.user_metadata?.phone || user.phone || '').replace(/\D/g, '');
                setHasPhone(/^01\d{8,9}$/.test(phone));
            }
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!title.trim() || !content.trim()) {
            return alert('제목과 내용을 입력해주세요.');
        }

        setSubmitting(true);

        try {
            const res = await fetch('/api/suggestions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title, content, notify: { sms: hasPhone === true && notifySms, when: notifyWhen } }),
            });
            const j = await res.json();
            if (res.status === 401) {
                alert('로그인이 필요합니다.');
                router.push('/login');
                return;
            }
            if (!res.ok) throw new Error(j.error || '등록 실패');

            alert('의견이 접수되었습니다. 답변은 마이페이지 › 내 요청에서 확인할 수 있어요.');
            router.push('/mypage?tab=requests');
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
                        <span><b>운영자에게만 보입니다.</b> 다른 회원에게는 제목도 보이지 않으며, 답변은 마이페이지 › 내 요청에서 확인할 수 있어요.</span>
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
                        <label htmlFor="suggestion-content" className="rd-bd-label">내용</label>
                        <textarea
                            id="suggestion-content"
                            value={content}
                            onChange={e => setContent(e.target.value)}
                            className="rd-input rd-bd-textarea"
                            placeholder="내용을 입력하세요"
                        />
                    </div>

                    <div className="rd-bd-field">
                        {hasPhone === null ? <p className="rd-bd-hint" role="status">문자 알림 가능 여부를 확인하고 있어요.</p>
                        : hasPhone ? <>
                            <label className="rd-bd-notify">
                                <input type="checkbox" checked={notifySms} onChange={e => setNotifySms(e.target.checked)} />
                                <span>답변이 달리면 문자로 알려 드릴까요?</span>
                            </label>
                            {notifySms && <>
                                <select aria-label="문자 받을 시간" value={notifyWhen} onChange={e => setNotifyWhen(e.target.value as NotifyWhen)} className="rd-input">
                                    {NOTIFY_WHEN.map(w => <option key={w.value} value={w.value}>{w.value === 'asap' ? '답변이 달리는 대로 바로 (새벽에도)' : w.label}</option>)}
                                </select>
                                <p className="rd-bd-hint">회원 정보에 있는 휴대폰 번호로 한 번만 보내요.</p>
                            </>}
                        </> : <p className="rd-bd-hint">휴대폰 번호가 없어 문자 알림을 받을 수 없어요</p>}
                    </div>

                    <div className="rd-bd-actions">
                        <Link href="/suggestion" className="rd-btn rd-btn-gray">
                            취소
                        </Link>
                        <button
                            type="submit"
                            disabled={submitting || hasPhone === null}
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
