"use client";
import React, { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { Pencil, Trash2, Loader2 } from 'lucide-react';
import { MockUploadModal, MockEditInitial } from './MockUploadButton';

export default function MockAdminControls({ exam }: { exam: MockEditInitial }) {
    const [isAdmin, setIsAdmin] = useState(false);
    const [editing, setEditing] = useState(false);
    const [deleting, setDeleting] = useState(false);

    useEffect(() => {
        createClient().auth.getUser().then(({ data: { user } }) => {
            setIsAdmin(user?.email === 'mathofhy@naver.com');
        });
    }, []);

    if (!isAdmin) return null;

    const del = async () => {
        if (!confirm('이 회차를 삭제할까요? 파일·미리보기까지 모두 지워집니다.')) return;
        setDeleting(true);
        try {
            const r = await fetch('/api/admin/mock/delete', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: exam.id }),
            });
            const j = await r.json().catch(() => ({}));
            if (!r.ok) { alert(j.error || '삭제 실패'); setDeleting(false); return; }
            alert('삭제됐어요.');
            window.location.href = '/모의고사';
        } catch (e: any) { alert(e.message); setDeleting(false); }
    };

    return (
        <div className="flex items-center gap-1.5">
            <button onClick={() => setEditing(true)}
                className="inline-flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-[#497AB7] bg-slate-100 hover:bg-slate-200 px-2.5 py-1.5 rounded-lg transition-colors">
                <Pencil size={13} /> 수정
            </button>
            <button onClick={del} disabled={deleting}
                className="inline-flex items-center gap-1 text-xs font-bold text-red-500 hover:text-red-600 bg-red-50 hover:bg-red-100 px-2.5 py-1.5 rounded-lg transition-colors disabled:opacity-50">
                {deleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />} 삭제
            </button>
            {editing && <MockUploadModal onClose={() => setEditing(false)} initial={exam} />}
        </div>
    );
}
