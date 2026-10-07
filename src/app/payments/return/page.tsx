'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { createClient } from '@/utils/supabase/client';
// 결제 결과(10/7 새 디자인) — 계정 화면과 같은 가운데 카드(rd-auth). 확인 로직은 그대로, 겉모습만 바꿨다.
export default function PaymentReturn() {
    const [message,setMessage] = useState('결제 결과를 확인하고 있습니다.');
    const [done,setDone] = useState(false);
    const [busy,setBusy] = useState(false);
    async function verify() {
        setBusy(true);
        try {
            const params = new URLSearchParams(window.location.search);
            const paymentId = params.get('paymentId');
            if (!paymentId) { setMessage('주문 번호가 없습니다. 결제를 시작한 화면에서 결과 확인을 눌러주세요.'); return; }
            const res = await fetch('/api/payments/complete', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({paymentId}) });
            if (res.status===401) { window.location.href=`/login?next=${encodeURIComponent(window.location.pathname+window.location.search)}`; return; }
            const data = await res.json();
            if (data.code === 'PAYMENT_NOT_PAID') {
                const { data: { user } } = await createClient().auth.getUser();
                if (user) for (const kind of ['topup', 'cart']) {
                    const key = `mathetf_pending_payment_${user.id}_${kind}`;
                    if (localStorage.getItem(key) === paymentId) localStorage.removeItem(key);
                }
            }
            if (!res.ok || !data.success) throw new Error(data.message);
            const {data:{user}} = await createClient().auth.getUser();
            if(user) localStorage.removeItem(`mathetf_pending_payment_${user.id}_${data.kind}`);
            setDone(true); setMessage(data.kind==='topup' ? `${data.points.toLocaleString()} 포인트 충전이 완료되었습니다.` : '결제가 완료되었습니다. 이용권은 시험지 만들기에 바로 적용되고, 자료는 마이페이지 구매 내역에서 받을 수 있습니다.');
        } catch (e:any) { setMessage(e.message || '같은 주문의 결과를 다시 확인해주세요.'); }
        finally { setBusy(false); }
    }
    useEffect(()=>{ void verify(); },[]);
    return <div className="rd rd-auth rd-cart-ret">
        <div className="rd-auth-card">
            <Link href="/" className="rd-auth-brand"><Image src="/icon.svg" alt="" width={32} height={32} /><span>수학ETF</span></Link>
            <h1 className="rd-auth-title">결제 결과</h1>
            <p role="status" className={done ? 'rd-cart-ret-msg is-done' : 'rd-cart-ret-msg'}>{message}</p>
            <div className="rd-cart-ret-actions">
                {!done && <button disabled={busy} onClick={verify} className="rd-btn rd-btn-primary rd-btn-block">결제 결과 다시 확인</button>}
                <Link href="/mypage" className={done ? 'rd-btn rd-btn-primary rd-btn-block' : 'rd-btn rd-btn-gray rd-btn-block'}>내 보관함으로</Link>
            </div>
        </div>
        <Link className="rd-auth-home" href="/">홈으로 돌아가기</Link>
    </div>;
}
