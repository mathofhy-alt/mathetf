"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { createClient } from '@/utils/supabase/client';
import { ArrowLeft, Clock } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
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
    const [isAdmin, setIsAdmin] = useState(false);
    const router = useRouter();
    const supabase = createClient();

    // [10/27 대표] 관리자만 수정·삭제
    const remove = async () => {
        if (!confirm('이 공지를 삭제할까요? 되돌릴 수 없습니다.')) return;
        const { error } = await supabase.from('notices').delete().eq('id', id);
        if (error) { alert('삭제하지 못했습니다: ' + error.message); return; }
        router.push('/notice');
    };

    useEffect(() => {
        if (!id) return;

        const fetchNotice = async () => {
            // 1. Fetch Data
            const { data, error } = await supabase
                .from('notices')
                .select('*')
                .eq('id', id)
                .single();

            if (data) setNotice(data);
            // [10/27 대표] 조회수는 안 보이게 — 올리지도 않는다
            const { data: { user } } = await supabase.auth.getUser();
            setIsAdmin(user?.email === 'mathofhy@naver.com');
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
                </p>

                <div className="rd-bd-body">
                    {notice.content}
                </div>

                <div className="rd-bd-foot">
                    <Link href="/notice" className="rd-btn rd-btn-gray">
                        목록으로
                    </Link>
                    {isAdmin && <>
                        <Link href={`/notice/write?edit=${notice.id}`} className="rd-btn rd-btn-tint">수정</Link>
                        <button type="button" onClick={remove} className="rd-btn rd-btn-gray">삭제</button>
                    </>}
                </div>
            </article>
        </div>
    );
}
