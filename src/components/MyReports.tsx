'use client';

import { useEffect, useState } from 'react';
import { Calendar, MessageSquare, Camera, Coins, Download } from 'lucide-react';

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
            <p>무료 타이핑 신청 내역이 없습니다.</p>
            <small>화면 위쪽 ‘무료 타이핑’ 버튼으로 시험지 사진을 보내면, 완성된 한글 파일을 여기에서 받을 수 있어요.</small>
        </div>
    );
    return (
        <ul className="rd-my-list rd-my-reqs">
            {rows.map(row => (
                <li key={row.id} className="rd-my-req">
                    <div className="rd-my-req-head">
                        <div className="rd-my-req-main">
                            <p className="rd-my-req-date"><Calendar size={14} />{new Date(row.created_at).toLocaleString('ko-KR')} 신청</p>
                            <p className="rd-my-title">{row.title} <small className="rd-my-muted">· 사진 {row.count}장</small></p>
                            {row.note && <p className="rd-my-req-note">내가 남긴 메모: {row.note}</p>}
                        </div>
                        {row.reward ? <span className="rd-my-status is-done"><Coins size={13} /> 채택 +{Number(row.reward).toLocaleString()}P</span>
                            : (row.typed_files || []).length ? <span className="rd-my-status is-done">타이핑 완료</span>
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
                    ) : !row.reward && !(row.typed_files || []).length && <p className="rd-my-req-wait">운영자가 확인 중입니다. 한글 파일이 완성되면 여기에서 받을 수 있어요.</p>}
                    {/* [10/8] 무료 타이핑 — 완성된 한글 파일 받기(본인 제보만, 서버가 확인) */}
                    {(row.typed_files || []).length > 0 && <div className="rd-my-typed">
                        <p className="rd-my-reply-head"><Download size={15} /> 완성된 한글 파일</p>
                        {row.typed_files.map((f: any) => <a key={f.i} href={`/api/original-report/typed?id=${row.id}&i=${f.i}`} className="rd-btn rd-btn-primary rd-my-typed-btn"><Download size={16} aria-hidden="true" /> {f.name}</a>)}
                    </div>}
                </li>
            ))}
        </ul>
    );
}
