'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/utils/supabase/client';
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
            setDone(true); setMessage(data.kind==='topup' ? `${data.points.toLocaleString()} 포인트 충전이 완료되었습니다.` : '구매가 완료되었습니다. 내 보관함에서 자료를 확인해주세요.');
        } catch (e:any) { setMessage(e.message || '같은 주문의 결과를 다시 확인해주세요.'); }
        finally { setBusy(false); }
    }
    useEffect(()=>{ void verify(); },[]);
    return <div className="max-w-xl mx-auto px-6 py-20"><h1 className="text-2xl font-bold mb-4">결제 결과</h1><p role="status">{message}</p>{!done && <button disabled={busy} onClick={verify} className="my-6 px-6 py-3 bg-brand-600 text-white rounded-lg disabled:opacity-50">결제 결과 다시 확인</button>}<Link href="/mypage" className="block mt-6 underline">내 보관함으로</Link></div>;
}
