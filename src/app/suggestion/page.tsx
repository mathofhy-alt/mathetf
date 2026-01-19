"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { createClient } from '@/utils/supabase/client';
import { User } from '@supabase/supabase-js';
import { ArrowLeft, PenSquare, Lock } from 'lucide-react';
import Header from '@/components/Header';

interface Suggestion {
    id: string;
    title: string;
    created_at: string;
    views: number;
    author_id: string;
}

export default function SuggestionListPage() {
    const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
    const [loading, setLoading] = useState(true);
    const [user, setUser] = useState<User | null>(null);
    const supabase = createClient();

    useEffect(() => {
        const fetchData = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            setUser(user);

            const { data, error } = await supabase
                .from('suggestions')
                .select('id, title, created_at, views, author_id, author_nickname') // Removed author_email
                .order('created_at', { ascending: false });

            if (data) {
                setSuggestions(data);
            }
            setLoading(false);
        };
        fetchData();
    }, [supabase]);

    const displayAuthor = (nickname?: string) => {
        return nickname || '익명';
    };

    return (
        <div className="min-h-screen bg-[#f3f4f6] text-slate-900 font-sans">
            <Header user={user} hideUploadButton={true} />
            <div className="bg-white border-b border-slate-200">
                <div className="max-w-[1200px] mx-auto px-4 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link href="/" className="text-slate-500 hover:text-slate-800"><ArrowLeft /></Link>
                        <h1 className="text-xl font-bold text-slate-800">건의사항</h1>
                    </div>
                    {user && (
                        <Link href="/suggestion/write" className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white rounded text-sm font-bold hover:bg-brand-700">
                            <PenSquare size={16} />
                            <span>글쓰기</span>
                        </Link>
                    )}
                </div>
            </div>

            <main className="max-w-[1200px] mx-auto px-4 py-8">
                <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
                            <tr>
                                <th className="px-6 py-4 w-16 text-center">번호</th>
                                <th className="px-6 py-4">제목</th>
                                <th className="px-6 py-4 w-32 text-center">작성자</th>
                                <th className="px-6 py-4 w-32 text-center">작성일</th>
                                <th className="px-6 py-4 w-24 text-center">조회수</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {loading ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-12 text-center text-slate-400">
                                        로딩중...
                                    </td>
                                </tr>
                            ) : suggestions.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-12 text-center text-slate-400">
                                        등록된 건의사항이 없습니다.
                                    </td>
                                </tr>
                            ) : (
                                suggestions.map((item, index) => (
                                    <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                                        <td className="px-6 py-4 text-center text-slate-400">{suggestions.length - index}</td>
                                        <td className="px-6 py-4">
                                            <Link href={`/suggestion/${item.id}`} className="flex items-center gap-2 font-medium text-slate-800 hover:text-brand-600">
                                                <Lock size={14} className="text-slate-400" />
                                                {item.title}
                                            </Link>
                                        </td>
                                        <td className="px-6 py-4 text-center text-slate-600">
                                            {/* @ts-ignore */}
                                            {displayAuthor(item.author_nickname)}
                                        </td>
                                        <td className="px-6 py-4 text-center text-slate-500">
                                            {new Date(item.created_at).toLocaleDateString()}
                                        </td>
                                        <td className="px-6 py-4 text-center text-slate-400">{item.views}</td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </main>
        </div>
    );
}
