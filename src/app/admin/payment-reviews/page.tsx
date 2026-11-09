'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

export default function PaymentReviews() {
    const [orders, setOrders] = useState<any[]>([]);
    const [cursor, setCursor] = useState<string | null>(null);
    const [selected, setSelected] = useState<any>(null);
    const [note, setNote] = useState('');
    const [confirmedOwner, setConfirmedOwner] = useState(false);
    const [message, setMessage] = useState('');
    const [busy, setBusy] = useState(false);
    const request = async (url: string, options?: RequestInit) => {
        const res = await fetch(url, { cache: 'no-store', ...options });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || '운영자 로그인과 조회 상태를 확인해주세요.');
        return data;
    };
    const load = async (next?: string) => {
        try {
            const data = await request(`/api/admin/payment-reviews${next ? `?cursor=${encodeURIComponent(next)}` : ''}`);
            setOrders(prev => next ? [...prev, ...data.orders] : data.orders);
            setCursor(data.nextCursor);
        } catch (e: any) { setMessage(e.message); }
    };
    useEffect(() => { void load(); }, []);
    const inspect = async (paymentId: string) => {
        setBusy(true); setMessage(''); setSelected(null); setNote(''); setConfirmedOwner(false);
        try { setSelected(await request(`/api/admin/payment-reviews?paymentId=${paymentId}`)); }
        catch (e: any) { setMessage(e.message); }
        finally { setBusy(false); }
    };
    const resolve = async (action: 'fulfill' | 'refund' | 'close_review') => {
        setBusy(true); setMessage('');
        try {
            const data = await request('/api/admin/payment-reviews', { method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ paymentId: selected.order.payment_id, action, note, confirmedOwner }) });
            setMessage(data.reviewClosed ? '검토를 종결했습니다. 해당 상품을 다시 구매할 수 있습니다.' : data.pending ? data.message : data.refunded ? '전액 취소와 포인트 반환을 확정했습니다.' : '상품 지급을 확정했습니다.');
            setSelected(null); await load();
        } catch (e: any) { setMessage(e.message); }
        finally { setBusy(false); }
    };
    const canResolve = selected?.order.legacy_reconciliation && (selected.verified || (selected.missingIdentity && confirmedOwner)) && note.trim().length >= 5;
    const canRefund = canResolve || (['pending', 'completed', 'superseded'].includes(selected?.order.status) && selected.order.manual_review_required
        && ['partial_cancelled', 'provider_mismatch', 'provider_state', 'ledger_conflict'].includes(selected.order.review_reason)
        && selected.verified && note.trim().length >= 5);
    const canClose = selected?.order.status === 'cancelled' && selected.order.refund_status === 'succeeded'
        && (selected.order.manual_review_required || selected.order.review_reason === 'bundle_entitlement_review') && selected.cancellation && (selected.verified || (selected.missingIdentity && confirmedOwner)) && note.trim().length >= 5;
    const internalReview = selected?.order.amount === 0 && selected.order.status === 'pending'
        && selected.order.manual_review_required && selected.order.review_reason === 'ledger_conflict' && note.trim().length >= 5;
    return <main className="payment-reviews" style={{ maxWidth: 1000, margin: 'auto', padding: 24 }}>
        <Link href="/admin">관리자 대시보드</Link>
        <h1>결제 검토함</h1>
        <p>기존 주문은 승인 내역과 지급·포인트 원장을 먼저 확인합니다. 지급 완료 원장이 일치하면 추가 차감·지급 없이 완료로 확정합니다. 전액 취소는 카드 취소 확인 후 권한을 회수하고 실제 차감된 포인트를 반환합니다.</p>
        <p role="status">{message}</p>
        {selected && <section style={{ border: '1px solid #ccc', padding: 16, marginBottom: 24, overflowWrap: 'anywhere' }}>
            <h2>{selected.order.name}</h2>
            <p style={{ overflowWrap: 'anywhere' }}>{selected.order.payment_id} / 회원 {selected.order.user_id}</p>
            <p>카드 {selected.order.amount.toLocaleString()}원 · 사용 {selected.order.used_points.toLocaleString()}P</p>
            <p>결제사 상태: {selected.provider?.status || '조회 없음'} · 승인 금액: {selected.provider?.amount?.total ?? '없음'}원</p>
            {selected.order.review_reason === 'partial_cancelled' && <p>부분 취소 검토: 상품 지급 여부와 포인트 원장을 확인한 뒤 남은 카드 금액까지 취소할 수 있습니다. 미지급 주문은 지급하지 않으며, 전액 취소가 확인되면 기존 권한 회수와 실제 차감된 포인트 반환을 확정합니다.</p>}
            {['provider_mismatch', 'provider_state', 'ledger_conflict'].includes(selected.order.review_reason) && <p>결제 정보·상태 또는 원장 검토: 추가 지급은 중단했습니다. 결제 정보가 주문과 일치하고 취소 가능한 상태인지 확인한 뒤 전액 취소로 정리할 수 있습니다.</p>}
            <p>원장 대조: {({ unfulfilled: '미지급 확인', fulfilled: '지급 완료 일치', conflict: '원장 충돌 — 추가 조사 필요' } as Record<string, string>)[selected.ledger]}</p>
            <ul>{selected.order.items.map((item: any) => <li key={item.item_id}>{item.title} ({item.price.toLocaleString()}원)</li>)}</ul>
            <p>결제 원장 {selected.history.length}건: {selected.history.map((row: any) => `${row.status} / ${row.amount}원 / 회원 ${row.user_id}`).join(', ') || '없음'}</p>
            <p>지급 원장 {selected.grants.length}건: {selected.grants.map((row: any) => `${row.title || row.item_id} / ${row.price_paid}원 / ${row.item_type}`).join(', ') || '없음'}</p>
            <p>포인트 원장 {selected.debits.length}건: {selected.debits.map((row: any) => `${row.type} / ${row.amount}P / 회원 ${row.user_id}`).join(', ') || '없음'}</p>
            {selected.cancellation && <p>전액 취소 확정: {selected.cancellation.amount.toLocaleString()}원 · 포인트 반환: {selected.cancellation.returned_points.toLocaleString()}P</p>}
            {selected.cancellation?.bundle_review_ids?.length > 0 && <p>구매 귀속 검토: 다른 구매가 함께 보장하거나 귀속을 확정할 수 없어 다음 미수령 작업의 이용 권한을 유지했습니다. 이 표시는 새 구매를 막지 않습니다. 작업 번호: {selected.cancellation.bundle_review_ids.join(', ')}</p>}
            {selected.missingIdentity && <label><input type="checkbox" checked={confirmedOwner} onChange={e => setConfirmedOwner(e.target.checked)} />옛 승인 정보에 회원·주문 연결 정보가 빠졌습니다. 구매자 본인임을 별도로 확인했습니다. 충돌하는 정보는 이 선택으로 처리할 수 없습니다.</label>}
            {selected.internal && <p>전액 포인트 주문: 내부 원장으로 확인합니다. 취소 시 입증된 실제 차감 {selected.internal.returnPoints.toLocaleString()}P만 반환합니다.</p>}
            {!selected.internal && !selected.verified && !selected.missingIdentity && <p>승인 정보가 주문과 일치하지 않거나 조회되지 않았습니다. 처리할 수 없습니다.</p>}
            <p><label>확인 근거 <textarea value={note} onChange={e => setNote(e.target.value)} maxLength={1000} style={{ width: '100%' }} /></label></p>
            {selected.ledger === 'conflict' && <p>원장이 충돌하면 추가 지급은 차단합니다. 전액 취소는 가능하며, 차감 원장이 일치하는 포인트만 반환하고 확인이 필요한 내역은 검토함에 남깁니다.</p>}
            <button disabled={busy || (selected.internal ? !(internalReview && selected.internal.canFulfill) : !canResolve || selected.ledger === 'conflict' || selected.provider?.status !== 'PAID')} onClick={() => resolve('fulfill')}>확인한 주문 지급 확정</button>{' '}
            <button className="refund-action" disabled={busy || (selected.internal ? !(internalReview && selected.internal.canRefund) : !canRefund || !['PAID', 'PARTIAL_CANCELLED', 'CANCELLED'].includes(selected.provider?.status))} onClick={() => resolve('refund')}>{selected.internal ? '확인한 포인트 주문 취소·차감 반환' : '확인한 주문 카드 전액 취소'}</button>
            {selected.order.status === 'cancelled' && (selected.order.manual_review_required || selected.order.review_reason === 'bundle_entitlement_review') && <p><button disabled={busy || !canClose || selected.provider?.status !== 'CANCELLED'} onClick={() => resolve('close_review')}>취소·포인트 반환 확인 후 검토 종결</button></p>}
        </section>}
        <button disabled={busy} onClick={() => load()}>목록 새로고침</button>
        <ul>{orders.map(order => <li key={order.payment_id} style={{ margin: '16px 0', overflowWrap: 'anywhere' }}>
            {order.name} · {order.amount.toLocaleString()}원 · {order.status} · {order.provider_status || '미조회'} {order.manual_review_required && '· 확인 필요'} {order.review_reason === 'bundle_entitlement_review' && '· 구매 귀속 확인(이용 유지)'}{' '}
            <button disabled={busy} onClick={() => inspect(order.payment_id)}>승인·원장 확인</button>
        </li>)}</ul>
        {cursor && <button disabled={busy} onClick={() => load(cursor)}>다음 100건</button>}
        <style jsx>{`
            .payment-reviews { line-height: 1.6; overflow-wrap: anywhere; }
            h1 { font-size: 26px; font-weight: 700; margin: 16px 0; }
            h2 { font-size: 20px; font-weight: 700; }
            p { margin: 12px 0; }
            button { border: 1px solid #64748b; border-radius: 6px; background: white; padding: 9px 12px; margin: 6px 0; text-align: left; }
            button:disabled { opacity: .45; cursor: not-allowed; }
            .refund-action { color: #9f1239; border-color: #9f1239; background: #fff1f2; }
            textarea { min-height: 85px; border: 1px solid #64748b; border-radius: 6px; padding: 8px; }
        `}</style>
    </main>;
}
