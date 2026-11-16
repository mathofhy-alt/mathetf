'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/utils/supabase/client';
import { useCart } from '@/components/providers/CartProvider';
import PendingOrderNotice from '@/components/payments/PendingOrderNotice';
import { payOrder } from '@/lib/payments/client';
import { STORE_ITEM_TYPE } from '@/lib/store/config';
import type { StoreBook } from '@/lib/store/types';

export default function BookCheckout({ book, bought, userId, points }: { book: StoreBook; bought: boolean; userId?: string; points: number }) {
    const [usedPoints, setUsedPoints] = useState(0);
    const [phone, setPhone] = useState('');
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState('');
    const { addToCart, fetchCart } = useCart();
    const router = useRouter();
    const maxPoints = Math.min(points, book.price ?? 0);
    const amount = Math.max(0, (book.price ?? 0) - usedPoints);
    const unavailable = book.price === null || !book.published;
    const item = { item_type: STORE_ITEM_TYPE, item_id: book.id, title: book.title, price: book.price ?? 0 };
    async function purchase() {
        if (busy || unavailable || bought) return;
        setBusy(true); setMessage('');
        try {
            const { data: { user } } = await createClient().auth.getUser();
            if (!user) { router.push(`/login?next=${encodeURIComponent(`/store/${book.slug}`)}`); return; }
            await payOrder(user, { kind: 'cart', items: [item], usedPoints }, phone || undefined);
            await fetchCart();
            // payOrder can reconcile a previous cart order. The server rechecks this book's ownership.
            router.refresh();
            router.push(`/store/${book.slug}/complete`);
        } catch (e) { setMessage(e instanceof Error ? e.message : '결제 결과를 다시 확인해 주세요.'); }
        finally { setBusy(false); }
    }
    async function add() {
        setBusy(true); setMessage('');
        try { await addToCart(item); setMessage('장바구니에 담았습니다.'); }
        catch (e) { setMessage(e instanceof Error ? e.message : '장바구니에 담지 못했습니다.'); }
        finally { setBusy(false); }
    }
    return <aside className="store-checkout" aria-label="책 구매">
        <p className="store-eyebrow">{book.pdf ? 'PDF로 받는 책' : '내 개인DB로 만나는 책'}</p>
        <h2>{bought ? '구매한 책입니다' : '책 구입하기'}</h2>
        <div className="store-price">{book.price === null ? '가격 준비 중' : `${book.price.toLocaleString()}원`}</div>
        {bought ? (book.pdf ? <><p>구매한 책의 PDF를 언제든 다시 받을 수 있습니다.</p><a href={`/api/store/download?book=${book.id}`} className="store-button">PDF 받기</a><Link href="/mypage" className="store-button secondary">구매 내역</Link></>
            : <><p>내 개인DB에서 범위를 골라 시험지를 만들어 보세요.</p><Link href="/question-bank" className="store-button">시험지 만들기에서 쓰기</Link><Link href="/mypage" className="store-button secondary">내 개인DB / 구매 내역</Link></>) : <>
            {userId && !unavailable && <>
                <PendingOrderNotice userId={userId} kind="cart" />
                <label htmlFor="store-points">포인트 사용 <span>보유 {points.toLocaleString()}P</span></label>
                <div className="store-points"><input id="store-points" type="number" inputMode="numeric" min={0} max={maxPoints} step={1} value={usedPoints || ''} placeholder="0" disabled={busy} onChange={e => setUsedPoints(Math.min(maxPoints, Math.max(0, Math.floor(Number(e.target.value) || 0))))} /><button type="button" disabled={busy} onClick={() => setUsedPoints(maxPoints)}>전액 사용</button></div>
                {amount > 0 && <><label htmlFor="store-phone">결제 연락처 <span>회원 정보에 없을 때 입력</span></label><input id="store-phone" type="tel" autoComplete="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="휴대폰 번호" disabled={busy} /></>}
                <div className="store-total"><span>결제할 금액</span><strong>{amount.toLocaleString()}원</strong></div>
                {amount === 0 && <p className="store-muted">{book.pdf ? '카드 결제 없이 바로 PDF를 받을 수 있습니다.' : '카드 결제 없이 바로 개인DB에 추가됩니다.'}</p>}
            </>}
            {unavailable ? <button className="store-button" disabled>{book.price === null ? '가격 준비 중' : '공개 준비 중'}</button> : userId ? <>
                <button className="store-button" disabled={busy} onClick={purchase}>{busy ? '처리 중…' : '구매하기 / 결과 확인'}</button>
                <button className="store-button secondary" disabled={busy} onClick={add}>장바구니에 담기</button>
                <Link href="/cart" className="store-text-link">장바구니 보기</Link>
            </> : <Link className="store-button" href={`/login?next=${encodeURIComponent(`/store/${book.slug}`)}`}>로그인하고 구매하기</Link>}
            <p className="store-muted">{book.pdf ? '결제 후 바로 PDF로 받는 디지털 문제집입니다. 구매한 책은 기간 제한 없이 다시 받을 수 있습니다.' : '구매한 회원의 개인DB에 추가되는 디지털 문제집입니다. 시험지 만들기 이용권은 기존 이용 정책을 따릅니다.'}</p>
        </>}
        {message && <p role="status" className="store-message">{message}</p>}
    </aside>;
}
