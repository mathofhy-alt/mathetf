"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { createClient } from '@/utils/supabase/client';
import { ArrowLeft, Clock, Eye } from 'lucide-react';
import { useParams } from 'next/navigation';
import Header from '@/components/Header';
import { User } from '@supabase/supabase-js'; // Import User type if needed, though NoticeDetail didn't use 'user' state before, but Header needs it.

// Wait, NoticeDetailPage didn't have user state.
// I need adding user fetching to NoticeDetailPage if I want Header to show login state from props, OR just let Header fetch it.
// Default Header fetches it. So I just need to pass user={null} (or undefined) and let it fetch?
// Or better, add user fetching to Notice as well to avoid flicker if possible, but Header handles it.
// Let's just import Header.

interface Notice {
    id: string;
    title: string;
    content: string;
    created_at: string;
    views: number;
}

export default function NoticeDetailPage() {
    const params = useParams();
    const id = params?.id as string;

    const [notice, setNotice] = useState<Notice | null>(null);
    const [loading, setLoading] = useState(true);
    const supabase = createClient();

    useEffect(() => {
        if (!id) return;

        const fetchNotice = async () => {
            // 1. Fetch Data
            const { data, error } = await supabase
                .from('notices')
                .select('*')
                .eq('id', id)
                .single();

            if (data) {
                setNotice(data);

                // 2. Increment Views (Simple implementation)
                await supabase.from('notices')
                    .update({ views: (data.views || 0) + 1 })
                    .eq('id', id);
            }
            setLoading(false);
        };

        fetchNotice();
    }, [id, supabase]);

    if (loading) return <div className="min-h-screen bg-[#f3f4f6] flex items-center justify-center">로딩중...</div>;
    if (!notice) return <div className="min-h-screen bg-[#f3f4f6] flex items-center justify-center">글을 찾을 수 없습니다.</div>;

    return (
        <div className="min-h-screen bg-[#f3f4f6] text-slate-900 font-sans">
            <Header />
            <div className="bg-white border-b border-slate-200">
                <div className="max-w-[1200px] mx-auto px-4 h-16 flex items-center gap-4">
                    <Link href="/notice" className="text-slate-500 hover:text-slate-800"><ArrowLeft /></Link>
                    <h1 className="text-xl font-bold text-slate-800">공지사항</h1>
                </div>
            </div>

            <main className="max-w-[800px] mx-auto px-4 py-8">
                <article className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
                    <div className="p-8 border-b border-slate-100">
                        <h1 className="text-2xl font-bold text-slate-900 mb-4">{notice.title}</h1>
                        <div className="flex items-center gap-4 text-sm text-slate-500">
                            <span className="flex items-center gap-1">
                                <Clock size={14} />
                                {new Date(notice.created_at).toLocaleDateString()}
                            </span>
                            <span className="flex items-center gap-1">
                                <Eye size={14} />
                                {notice.views + 1}
                            </span>
                        </div>
                    </div>

                    <div className="p-8 min-h-[300px] text-slate-700 leading-relaxed whitespace-pre-wrap">
                        {notice.content}
                    </div>

                    <div className="bg-slate-50 p-6 border-t border-slate-100 flex justify-center">
                        <Link href="/notice" className="px-6 py-2 bg-white border border-slate-300 rounded text-sm font-bold text-slate-600 hover:bg-slate-100 transition-colors">
                            목록으로
                        </Link>
                    </div>
                </article>
            </main>
        </div>
    );
}
