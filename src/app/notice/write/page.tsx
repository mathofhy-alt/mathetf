"use client";

import React, { useState } from 'react';
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

            const { error } = await supabase.from('notices').insert({
                title,
                content,
                author_id: user.id
            });

            if (error) throw error;

            alert('공지사항이 등록되었습니다.');
            router.push('/notice');
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
                    <Link href="/notice" className="text-slate-500 hover:text-slate-800"><ArrowLeft /></Link>
                    <h1 className="text-xl font-bold text-slate-800">공지사항 등록</h1>
                </div>
            </header>

            <main className="max-w-[800px] mx-auto px-4 py-8">
                <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden p-8 space-y-6">
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
                        <label className="block text-sm font-bold text-slate-700 mb-2">내용</label>
                        <textarea
                            value={content}
                            onChange={e => setContent(e.target.value)}
                            className="w-full h-80 px-4 py-2 border border-slate-300 rounded focus:border-brand-500 focus:outline-none resize-none"
                            placeholder="내용을 입력하세요"
                        />
                    </div>

                    <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                        <Link href="/notice" className="px-6 py-2 border border-slate-300 rounded text-sm font-bold text-slate-600 hover:bg-slate-50">
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
