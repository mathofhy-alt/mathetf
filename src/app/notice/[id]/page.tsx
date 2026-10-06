"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { createClient } from '@/utils/supabase/client';
import { ArrowLeft, Clock, Eye } from 'lucide-react';
import { useParams } from 'next/navigation';
import Header from '@/components/Header';
import { User } from '@supabase/supabase-js';

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

    const shell = (msg: string) => (
        <div className="rd rd-x rd-bd">
            <Header />
            <p className="rd-bd-status" role="status">{msg}</p>
        </div>
    );
    if (loading) return shell('로딩중...');
    if (!notice) return shell('글을 찾을 수 없습니다.');

    return (
        <div className="rd rd-x rd-bd">
            <Header />
            <article className="rd-wrap rd-x-top rd-bd-read">
                <Link href="/notice" className="rd-x-back"><ArrowLeft size={18} /> 공지사항</Link>
                <span className="rd-bd-tag is-accent">공지</span>
                <h1 className="rd-bd-title">{notice.title}</h1>
                <p className="rd-bd-meta">
                    <span><Clock size={15} aria-hidden />{new Date(notice.created_at).toLocaleDateString()}</span>
                    <span><Eye size={15} aria-hidden />조회 {notice.views + 1}</span>
                </p>

                <div className="rd-bd-body">
                    {notice.content}
                </div>

                <div className="rd-bd-foot">
                    <Link href="/notice" className="rd-btn rd-btn-gray">
                        목록으로
                    </Link>
                </div>
            </article>
        </div>
    );
}
