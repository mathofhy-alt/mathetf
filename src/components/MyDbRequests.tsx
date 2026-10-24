'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Calendar, MessageSquare, Database, X } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import { payOrder } from '@/lib/payments/client';
import PointsPicker from '@/components/PointsPicker';
import RefundPolicyModal from '@/components/RefundPolicyModal';

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
    // [10/24 대표] 결제하기를 누르면 카드 창이 바로 떴다(포인트를 쓸지 안 물음) → 먼저 확인 창: 가격·포인트 사용·결제 금액.
    //   전액 포인트면 카드 창 없이 끝난다(payOrder). 휴대폰 번호 없는 옛 계정은 이용권 창처럼 여기서 받는다.
    const [checkout, setCheckout] = useState<{ product: any; user: any; points: number } | null>(null);
    const [pointsPick, setPointsPick] = useState(0);   // [10/24 대표] 쓸 포인트는 회원이 1,000P 단위로 고른다
    const [phone, setPhone] = useState('');
    const [payErr, setPayErr] = useState('');
    // [10/24 대표] 환불 불가 동의 — 이용권 창과 같다. 동의해야 결제 버튼이 눌린다
    const [agree, setAgree] = useState(false);
    const [showRefund, setShowRefund] = useState(false);
    const open = async (product: any) => {
        const sb = createClient();
        const { data: { user } } = await sb.auth.getUser();
        if (!user) { alert('로그인이 필요합니다.'); return; }
        const { data } = await sb.from('profiles').select('earned_points').eq('id', user.id).single();
        setPointsPick(0); setPhone(''); setAgree(false); setPayErr('');
        setCheckout({ product, user, points: Number(data?.earned_points) || 0 });
    };
    const price = Number(checkout?.product.price) || 0;
    const usedPoints = checkout ? Math.min(pointsPick, checkout.points, price) : 0;
    const due = price - usedPoints;
    const needPhone = !!checkout && due > 0 && !(checkout.user.user_metadata?.phone || checkout.user.phone);
    const phoneOk = !needPhone || /^01[016789]\d{7,8}$/.test(phone.replace(/[^0-9]/g, ''));
    const pay = async () => {
        if (!checkout || paying || !phoneOk || !agree) return;
        const { product, user } = checkout;
        setPaying(product.id); setPayErr('');
        try {
            const digits = phone.replace(/[^0-9]/g, '');
            if (needPhone) await createClient().auth.updateUser({ data: { phone: digits } }).catch(() => null);   // 다음 결제부터는 묻지 않게
            await payOrder(user, { kind: 'cart', items: [{ item_id: product.id }], usedPoints }, needPhone ? digits : undefined);
            setCheckout(null);
            alert('결제가 완료되었습니다. 시험지 만들기의 출제 자료에서 ‘내 개인DB’로 이용하실 수 있어요.');
            await load();
        } catch (e: any) { setPayErr(e?.message || '결제를 완료하지 못했습니다.'); }
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
        <>
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
                                <button type="button" onClick={() => open(row.product)} disabled={paying === row.product.id} className="rd-btn rd-btn-primary rd-my-product-btn">
                                    {paying === row.product.id ? '결제 진행 중…' : '결제하기'}
                                </button>
                            )}
                        </div>
                    )}
                </li>
            ))}
        </ul>
        {checkout && (
            <div className="rd rd-overlay" style={{ zIndex: 300 }} onClick={e => { if (e.target === e.currentTarget && !paying) setCheckout(null); }}>
                <div className="rd-modal rd-modal-sm rd-pass" role="dialog" aria-modal="true" aria-labelledby="privdb-pay-title">
                    <div className="rd-sheet-handle" aria-hidden="true" />
                    <div className="rd-modal-head">
                        <h2 id="privdb-pay-title" className="rd-modal-title">개인DB 결제</h2>
                        <button type="button" className="rd-modal-x" aria-label="닫기" onClick={() => !paying && setCheckout(null)}><X size={20} /></button>
                    </div>
                    <div className="rd-pass-card">
                        <p className="rd-pass-name">{checkout.product.title}</p>
                        <p className="rd-pass-price"><b>{price.toLocaleString()}</b>원</p>
                        <p className="rd-my-product-sub">회원님 전용 · 결제하면 시험지 만들기 › 출제 자료 › 내 개인DB에서 바로 쓸 수 있어요.</p>
                    </div>
                    <PointsPicker points={checkout.points} total={price} value={usedPoints} onChange={setPointsPick} />
                    {usedPoints > 0 && <p className="rd-pass-fine">포인트 -{usedPoints.toLocaleString()}원 · 결제 금액 {due.toLocaleString()}원</p>}
                    {needPhone && <label className="rd-pass-phone">
                        <span>결제에 쓸 휴대폰 번호 <small>카드 결제에 꼭 필요해요</small></span>
                        <input type="tel" inputMode="numeric" autoComplete="tel" placeholder="01012345678" value={phone} onChange={e => setPhone(e.target.value)} className="rd-input" />
                    </label>}
                    <label className="rd-pass-agree">
                        <input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} />
                        <span>개인DB는 결제 즉시 이용이 시작되어, <b>결제 후에는 사용하지 않았더라도 환불되지 않는다</b>는 데 동의합니다. <button type="button" onClick={() => setShowRefund(true)}>환불 정책 보기</button></span>
                    </label>
                    {payErr && <p className="rd-pass-err" role="alert">{payErr}</p>}
                    <div className="rd-modal-actions">
                        <button type="button" className="rd-btn rd-btn-primary rd-btn-block" onClick={pay} disabled={!!paying || !phoneOk || !agree}>
                            {paying ? '결제 진행 중…' : due === 0 ? `포인트 ${usedPoints.toLocaleString()}P로 결제하기` : `${due.toLocaleString()}원 결제하기`}
                        </button>
                        <button type="button" className="rd-btn rd-btn-gray rd-btn-block" onClick={() => setCheckout(null)} disabled={!!paying}>닫기</button>
                    </div>
                </div>
                {showRefund && <div style={{ position: 'relative', zIndex: 310 }}><RefundPolicyModal isOpen onClose={() => setShowRefund(false)} /></div>}
            </div>
        )}
        </>
    );
}
