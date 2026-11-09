'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { createClient } from '@/utils/supabase/client';
import { gaEvent } from '@/lib/analytics/ga';
import { clearPendingPayment, rememberPaymentReview, clearPaymentReview } from '@/lib/payments/client';
// 결제사 상태를 서버에서 확정한 뒤 복구 포인터를 정리하고 구매 내역으로 이동한다.
export default function PaymentReturn() {
    const [message,setMessage] = useState('결제 결과를 확인하고 있습니다.');
    const [done,setDone] = useState(false);
    const [busy,setBusy] = useState(false);
    const [unpaid,setUnpaid] = useState(false);
    const [choice,setChoice] = useState(false);
    const verifying = useRef(false);
    async function verify() {
        if (verifying.current) return;
        verifying.current = true;
        setBusy(true);
        setUnpaid(false); setChoice(false);
        try {
            const params = new URLSearchParams(window.location.search);
            const paymentId = params.get('paymentId');
            if (!paymentId) { setMessage('주문 번호가 없습니다. 결제를 시작한 화면에서 결과 확인을 눌러주세요.'); return; }
            // Redirect code/message are untrusted and can race with approval.
            // Always reconcile PAID on the server before clearing recovery state.
            const res = await fetch('/api/payments/complete', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({paymentId}), signal:AbortSignal.timeout(45000) });
            if (res.status===401) { window.location.href=`/login?next=${encodeURIComponent(window.location.pathname+window.location.search)}`; return; }
            const data = await res.json();
            if (['PAYMENT_MANUAL_REVIEW', 'PAYMENT_REFUND_PENDING'].includes(data.code)) {
                const { data: { user } } = await createClient().auth.getUser();
                if (user) rememberPaymentReview(user.id, 'cart', paymentId);
            }
            if (['PAYMENT_NOT_PAID', 'PAYMENT_SUPERSEDED', 'PAYMENT_REFUNDED', 'PAYMENT_RETRY_CHOICE', 'PAYMENT_CLOSED'].includes(data.code)) {
                const { data: { user } } = await createClient().auth.getUser();
                if (user && ['PAYMENT_SUPERSEDED', 'PAYMENT_REFUNDED', 'PAYMENT_CLOSED'].includes(data.code)) for (const kind of ['topup', 'cart']) {
                    clearPendingPayment(user.id, kind, paymentId);
                    clearPaymentReview(user.id, kind, paymentId);
                }
                setUnpaid(data.code !== 'PAYMENT_RETRY_CHOICE');
                setChoice(data.code === 'PAYMENT_RETRY_CHOICE');
            }
            if (!res.ok || !data.success) throw new Error(data.message);
            const {data:{user}} = await createClient().auth.getUser();
            if(user) { clearPendingPayment(user.id, data.kind, paymentId); clearPaymentReview(user.id, data.kind, paymentId); }
            if (!data.alreadyProcessed) gaEvent('purchase', { transaction_id: paymentId, value: data.amount, currency: 'KRW', kind: data.kind });
            setDone(true); setMessage(data.kind==='topup' ? `${data.points.toLocaleString()} 포인트 충전이 완료되었습니다.` : '결제가 완료되었습니다. 이용권은 시험지 만들기에 바로 적용되고, 자료는 마이페이지 구매 내역에서 받을 수 있습니다.');
            window.location.replace('/mypage');
        } catch (e:any) { setMessage(e.message || '같은 주문의 결과를 다시 확인해주세요.'); }
        finally { verifying.current = false; setBusy(false); }
    }
    useEffect(()=>{ void verify(); },[]);
    return <div className="rd rd-auth rd-cart-ret">
        <div className="rd-auth-card">
            <Link href="/" className="rd-auth-brand"><Image src="/icon.svg" alt="" width={32} height={32} /><span>수학ETF</span></Link>
            <h1 className="rd-auth-title">결제 결과</h1>
            <p role="status" className={done ? 'rd-cart-ret-msg is-done' : 'rd-cart-ret-msg'}>{message}</p>
            <div className="rd-cart-ret-actions">
                {!done && !unpaid && <button disabled={busy} onClick={verify} className="rd-btn rd-btn-primary rd-btn-block">결제 결과 다시 확인</button>}
                {unpaid && <Link href="/cart" className="rd-btn rd-btn-primary rd-btn-block">장바구니에서 다시 결제</Link>}
                {choice && <Link href="/cart" className="rd-btn rd-btn-gray rd-btn-block">결제창을 닫았어요 · 장바구니에서 새로 결제</Link>}
                <Link href="/mypage" className={done ? 'rd-btn rd-btn-primary rd-btn-block' : 'rd-btn rd-btn-gray rd-btn-block'}>내 보관함으로</Link>
            </div>
        </div>
        <Link className="rd-auth-home" href="/">홈으로 돌아가기</Link>
    </div>;
}
