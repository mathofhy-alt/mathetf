'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Calendar, MessageSquare, Database } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import { payOrder } from '@/lib/payments/client';

/**
 * 마이페이지 '내 요청' 탭 (2026-10-06) — 개인DB 요청의 처리 상태와 운영자 안내를 보여준다.
 * 안내문은 관리자 화면(/admin/db-requests)에서 적는다. 데이터는 GET /api/db-request (본인 것만).
 */
const STATUS_STYLE: Record<string, string> = {
    '접수': 'is-wait',
    '처리중': 'is-doing',
    '완료': 'is-done',
    '반려': 'is-no',
};

export default function MyDbRequests() {
    const [rows, setRows] = useState<any[] | null>(null);
    const [error, setError] = useState('');
    const [paying, setPaying] = useState<string | null>(null);

    const load = () => fetch('/api/db-request', { cache: 'no-store' })
        .then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.error || '불러오지 못했습니다.'); setRows(j.requests || []); })
        .catch(e => setError(e.message || '불러오지 못했습니다.'));
    useEffect(() => { void load(); }, []);

    // [10/6] 회원 전용 개인DB 결제 — 기존 장바구니 결제(PortOne)와 같은 주문 경로. 주인 확인은 서버(orders)가 한다.
    const pay = async (product: any) => {
        const { data: { user } } = await createClient().auth.getUser();
        if (!user) { alert('로그인이 필요합니다.'); return; }
        setPaying(product.id);
        try {
            await payOrder(user, { kind: 'cart', items: [{ item_id: product.id }], usedPoints: 0 });
            alert('결제가 완료되었습니다. 시험지 만들기의 출제 자료에서 ‘내 개인DB’로 이용하실 수 있어요.');
            await load();
        } catch (e: any) { alert(e?.message || '결제를 완료하지 못했습니다.'); }
        finally { setPaying(null); }
    };

    if (error) return <div className="rd-my-empty is-error" role="alert"><p>{error}</p></div>;
    if (!rows) return <div className="rd-my-empty" role="status"><p className="rd-my-muted">불러오는 중…</p></div>;
    if (rows.length === 0) return (
        <div className="rd-my-empty">
            <span className="rd-my-empty-icon"><MessageSquare size={28} /></span>
            <p>개인DB 요청 내역이 없습니다.</p>
            <small>화면 위쪽 ‘개인DB 요청’ 버튼으로 자료를 보내면 여기에서 처리 결과를 확인할 수 있어요.</small>
        </div>
    );

    return (
        <ul className="rd-my-list rd-my-reqs">
            {rows.map(row => (
                <li key={row.id} className="rd-my-req">
                    <div className="rd-my-req-head">
                        <div className="rd-my-req-main">
                            <p className="rd-my-req-date"><Calendar size={14} />{new Date(row.created_at).toLocaleString('ko-KR')} 요청</p>
                            <ul className="rd-my-req-files">
                                {(row.files || []).map((f: any, i: number) => <li key={i}>{f.name}</li>)}
                            </ul>
                            {row.note && <p className="rd-my-req-note">내가 남긴 메모: {row.note}</p>}
                        </div>
                        <span className={`rd-my-status ${STATUS_STYLE[row.status] || STATUS_STYLE['접수']}`}>{row.status}</span>
                    </div>
                    {row.admin_reply ? (
                        <div className="rd-my-reply">
                            <p className="rd-my-reply-head">
                                <MessageSquare size={15} /> 운영자 안내
                                {row.replied_at && <span>{new Date(row.replied_at).toLocaleDateString('ko-KR')}</span>}
                            </p>
                            <p className="rd-my-reply-body">{row.admin_reply}</p>
                        </div>
                    ) : !row.product && (
                        <p className="rd-my-req-wait">운영자가 확인 중입니다. 안내가 등록되면 여기에 표시됩니다.</p>
                    )}
                    {row.product && (
                        <div className="rd-my-product">
                            <span className="rd-my-ficon is-db"><Database size={20} /></span>
                            <div className="rd-my-product-txt">
                                <p className="rd-my-title">{row.product.title}</p>
                                <p className="rd-my-product-sub">{row.product.paid ? '이용 중 — 시험지 만들기 › 출제 자료 › 내 개인DB' : `회원님 전용 개인DB가 준비됐습니다 · ${Number(row.product.price).toLocaleString()}원`}</p>
                            </div>
                            {row.product.paid ? (
                                <Link href="/question-bank" className="rd-btn rd-btn-primary rd-my-product-btn">시험지 만들기</Link>
                            ) : (
                                <button type="button" onClick={() => pay(row.product)} disabled={paying === row.product.id} className="rd-btn rd-btn-primary rd-my-product-btn">
                                    {paying === row.product.id ? '결제 진행 중…' : '결제하기'}
                                </button>
                            )}
                        </div>
                    )}
                </li>
            ))}
        </ul>
    );
}
