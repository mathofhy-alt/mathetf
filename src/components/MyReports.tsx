'use client';

import { useEffect, useState } from 'react';
import { Calendar, MessageSquare, Camera, Coins } from 'lucide-react';

/**
 * 마이페이지 '내 요청' 탭 — 내가 올린 원본 제보와 운영자 안내 (10/7, 개인DB 요청과 같은 모양).
 * 안내문은 관리자 화면(/admin/raw-uploads)에서 적는다. 데이터는 GET /api/original-report?mine=1 (본인 것만).
 */
export default function MyReports() {
    const [rows, setRows] = useState<any[] | null>(null);
    const [error, setError] = useState('');
    useEffect(() => {
        fetch('/api/original-report?mine=1', { cache: 'no-store' })
            .then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.error || '불러오지 못했습니다.'); setRows(j.reports || []); })
            .catch(e => setError(e.message || '불러오지 못했습니다.'));
    }, []);
    if (error) return <div className="rd-my-empty is-error" role="alert"><p>{error}</p></div>;
    if (!rows) return <div className="rd-my-empty" role="status"><p className="rd-my-muted">불러오는 중…</p></div>;
    if (rows.length === 0) return (
        <div className="rd-my-empty">
            <span className="rd-my-empty-icon"><Camera size={28} /></span>
            <p>원본 제보 내역이 없습니다.</p>
            <small>화면 위쪽 ‘원본 제보’ 버튼으로 시험지 사진을 보내면 여기에서 처리 결과를 확인할 수 있어요.</small>
        </div>
    );
    return (
        <ul className="rd-my-list rd-my-reqs">
            {rows.map(row => (
                <li key={row.id} className="rd-my-req">
                    <div className="rd-my-req-head">
                        <div className="rd-my-req-main">
                            <p className="rd-my-req-date"><Calendar size={14} />{new Date(row.created_at).toLocaleString('ko-KR')} 제보</p>
                            <p className="rd-my-title">{row.title} <small className="rd-my-muted">· 사진 {row.count}장</small></p>
                            {row.note && <p className="rd-my-req-note">내가 남긴 메모: {row.note}</p>}
                        </div>
                        {row.reward ? <span className="rd-my-status is-done"><Coins size={13} /> 채택 +{Number(row.reward).toLocaleString()}P</span>
                            : <span className="rd-my-status is-wait">검토 중</span>}
                    </div>
                    {row.admin_reply ? (
                        <div className="rd-my-reply">
                            <p className="rd-my-reply-head">
                                <MessageSquare size={15} /> 운영자 안내
                                {row.replied_at && <span>{new Date(row.replied_at).toLocaleDateString('ko-KR')}</span>}
                            </p>
                            <p className="rd-my-reply-body">{row.admin_reply}</p>
                        </div>
                    ) : !row.reward && <p className="rd-my-req-wait">운영자가 확인 중입니다. 안내가 등록되면 여기에 표시됩니다.</p>}
                </li>
            ))}
        </ul>
    );
}
