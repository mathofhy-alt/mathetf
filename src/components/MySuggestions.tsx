'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { MessageSquare, ChevronRight } from 'lucide-react';

/**
 * 마이페이지 '내 요청' 탭의 건의·의견 (2026-10-24 대표) — 건의사항 목록을 공개하지 않게 바꾸면서
 * 내가 남긴 의견과 답변 여부를 여기서 본다. 데이터는 GET /api/suggestions (회원은 본인 것만).
 * 답변 내용은 글을 열면 보인다(작성자 본인이라 잠금 없이 열린다).
 */
type Row = { id: string; title: string; created_at: string; answered?: boolean };

export default function MySuggestions() {
    const [rows, setRows] = useState<Row[] | null>(null);
    const [error, setError] = useState('');
    useEffect(() => {
        fetch('/api/suggestions', { cache: 'no-store' })
            .then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.error || '불러오지 못했습니다.'); setRows(j.items || []); })
            .catch(e => setError(e.message || '불러오지 못했습니다.'));
    }, []);
    const date = (v: string) => new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Seoul' }).format(new Date(v));

    if (error) return <p className="rd-my-empty" role="alert">{error}</p>;
    if (!rows) return <p className="rd-my-empty" role="status">불러오는 중…</p>;
    if (!rows.length) return (
        <div className="rd-my-empty">
            <span className="rd-my-empty-icon"><MessageSquare size={22} aria-hidden /></span>
            <p>아직 남긴 의견이 없습니다.</p>
            <Link href="/suggestion/write" className="rd-btn rd-btn-gray">의견 남기기</Link>
        </div>
    );
    return (
        <ul className="rd-my-list">
            {rows.map(r => (
                <li key={r.id}>
                    <Link href={`/suggestion/${r.id}`} className="rd-bd-row">
                        <div className="rd-bd-row-txt">
                            <span className={r.answered ? 'rd-bd-tag is-accent' : 'rd-bd-tag'}>{r.answered ? '답변 완료' : '답변 대기'}</span>
                            <h3>{r.title}</h3>
                            <p className="rd-bd-meta"><span>{date(r.created_at)}</span></p>
                        </div>
                        <ChevronRight size={20} aria-hidden />
                    </Link>
                </li>
            ))}
        </ul>
    );
}
