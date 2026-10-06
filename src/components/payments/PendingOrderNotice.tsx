'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
// 10/7: 장바구니 새 디자인(.rd) 안에서만 쓰여 rd-cart-pending 으로 꾸민다. 판단 로직은 그대로.
export default function PendingOrderNotice({userId,kind}:{userId?:string;kind:'cart'|'topup'}){
 const [id,setId]=useState('');
 useEffect(()=>{if(userId){try{setId(localStorage.getItem(`mathetf_pending_payment_${userId}_${kind}`)||'');}catch{}}},[userId,kind]);
 if(!/^order-[a-f0-9]{32}$/.test(id))return null;
 return <div role="status" className="rd-cart-pending"><span>결과 확인이 필요한 이전 주문이 있습니다.</span> <Link className="rd-cart-pending-link" href={`/payments/return?paymentId=${encodeURIComponent(id)}`}>다시 결제하지 않고 결과 확인하기</Link></div>;
}
