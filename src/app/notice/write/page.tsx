"use client";

import Header from "@/components/Header";
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { ArrowLeft } from 'lucide-react';

export default function NoticeWritePage() {
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const router = useRouter();
    const supabase = createClient();

    // [10/27 대표] ?edit=<공지 id> 면 그 공지를 불러와 고친다
    const [editId, setEditId] = useState<string | null>(null);

    // 진입 가드: 관리자가 아니면 폼 작성 전에 돌려보냄 (제출 후 튕기며 입력 소실되던 것 방지)
    useEffect(() => {
        supabase.auth.getUser().then(async ({ data: { user } }) => {
            if (!user || user.email !== 'mathofhy@naver.com') {
                alert('관리자만 작성할 수 있습니다.');
                router.replace('/notice');
                return;
            }
            const eid = new URLSearchParams(window.location.search).get('edit');
            if (eid) {
                const { data } = await supabase.from('notices').select('id, title, content').eq('id', eid).single();
                if (data) { setEditId(data.id); setTitle(data.title || ''); setContent(data.content || ''); }
            }
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!title.trim() || !content.trim()) return alert('제목과 내용을 입력해주세요.');

        setSubmitting(true);

        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user || user.email !== 'mathofhy@naver.com') {
                alert('관리자만 작성할 수 있습니다.');
                router.push('/notice');
                return;
            }

            const { error } = editId
                ? await supabase.from('notices').update({ title, content }).eq('id', editId)
                : await supabase.from('notices').insert({ title, content, author_id: user.id });

            if (error) throw error;

            alert(editId ? '공지사항을 수정했습니다.' : '공지사항이 등록되었습니다.');
            router.push(editId ? `/notice/${editId}` : '/notice');
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
                <Link href="/notice" className="rd-x-back"><ArrowLeft size={18} /> 공지사항</Link>
                <h1 className="rd-x-h1 rd-bd-form-h1">{editId ? '공지사항 수정' : '공지사항 등록'}</h1>

                <form onSubmit={handleSubmit} className="rd-bd-form">
                    <div className="rd-bd-field">
                        <label htmlFor="notice-title" className="rd-bd-label">제목</label>
                        <input
                            id="notice-title"
                            type="text"
                            value={title}
                            onChange={e => setTitle(e.target.value)}
                            className="rd-input"
                            placeholder="제목을 입력하세요"
                        />
                    </div>

                    <div className="rd-bd-field">
                        <label htmlFor="notice-content" className="rd-bd-label">내용</label>
                        <textarea
                            id="notice-content"
                            value={content}
                            onChange={e => setContent(e.target.value)}
                            className="rd-input rd-bd-textarea"
                            placeholder="내용을 입력하세요"
                        />
                    </div>

                    <div className="rd-bd-actions">
                        <Link href="/notice" className="rd-btn rd-btn-gray">
                            취소
                        </Link>
                        <button
                            type="submit"
                            disabled={submitting}
                            className="rd-btn rd-btn-primary"
                        >
                            {submitting ? '저장 중...' : editId ? '수정하기' : '등록하기'}
                        </button>
                    </div>
                </form>
            </section>
        </div>
    );
}
