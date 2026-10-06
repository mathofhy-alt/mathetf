'use client';

import { useEffect, useState } from 'react';
import { Calendar, MessageSquare } from 'lucide-react';

/**
 * 마이페이지 '내 요청' 탭 (2026-10-06) — 개인DB 요청의 처리 상태와 운영자 안내를 보여준다.
 * 안내문은 관리자 화면(/admin/db-requests)에서 적는다. 데이터는 GET /api/db-request (본인 것만).
 */
const STATUS_STYLE: Record<string, string> = {
    '접수': 'bg-slate-100 text-slate-600',
    '처리중': 'bg-amber-100 text-amber-700',
    '완료': 'bg-emerald-100 text-emerald-700',
    '반려': 'bg-rose-100 text-rose-600',
};

export default function MyDbRequests() {
    const [rows, setRows] = useState<any[] | null>(null);
    const [error, setError] = useState('');

    useEffect(() => {
        fetch('/api/db-request', { cache: 'no-store' })
            .then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.error || '불러오지 못했습니다.'); setRows(j.requests || []); })
            .catch(e => setError(e.message || '불러오지 못했습니다.'));
    }, []);

    if (error) return <div className="p-10 text-center text-sm text-rose-600 font-bold bg-white rounded-2xl border border-slate-200">{error}</div>;
    if (!rows) return <div className="p-10 text-center text-sm text-slate-400 font-bold bg-white rounded-2xl border border-slate-200">불러오는 중…</div>;
    if (rows.length === 0) return (
        <div className="p-10 text-center bg-white rounded-2xl border border-slate-200">
            <p className="text-sm font-bold text-slate-600">개인DB 요청 내역이 없습니다.</p>
            <p className="text-xs text-slate-400 mt-1">화면 위쪽 ‘개인DB 요청’ 버튼으로 자료를 보내면 여기에서 처리 결과를 확인할 수 있어요.</p>
        </div>
    );

    return (
        <div className="space-y-3">
            {rows.map(row => (
                <div key={row.id} className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5">
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            <p className="flex items-center gap-1 text-xs text-slate-400"><Calendar size={12} />{new Date(row.created_at).toLocaleString('ko-KR')} 요청</p>
                            <ul className="mt-1 text-sm font-bold text-slate-800 space-y-0.5">
                                {(row.files || []).map((f: any, i: number) => <li key={i} className="break-all">{f.name}</li>)}
                            </ul>
                            {row.note && <p className="mt-1 text-xs text-slate-500">내가 남긴 메모: {row.note}</p>}
                        </div>
                        <span className={`shrink-0 text-xs font-extrabold px-2.5 py-1 rounded-full ${STATUS_STYLE[row.status] || STATUS_STYLE['접수']}`}>{row.status}</span>
                    </div>
                    {row.admin_reply ? (
                        <div className="mt-3 rounded-xl bg-brand-50 border border-brand-100 p-3">
                            <p className="flex items-center gap-1 text-xs font-bold text-brand-700 mb-1">
                                <MessageSquare size={13} /> 운영자 안내
                                {row.replied_at && <span className="font-normal text-slate-400">· {new Date(row.replied_at).toLocaleDateString('ko-KR')}</span>}
                            </p>
                            <p className="text-sm text-slate-700 whitespace-pre-wrap break-keep leading-relaxed">{row.admin_reply}</p>
                        </div>
                    ) : (
                        <p className="mt-3 text-xs text-slate-400">운영자가 확인 중입니다. 안내가 등록되면 여기에 표시됩니다.</p>
                    )}
                </div>
            ))}
        </div>
    );
}
