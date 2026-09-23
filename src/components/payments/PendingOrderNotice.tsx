'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
export default function PendingOrderNotice({userId,kind}:{userId?:string;kind:'cart'|'topup'}){
 const [id,setId]=useState('');
 useEffect(()=>{if(userId){try{setId(localStorage.getItem(`mathetf_pending_payment_${userId}_${kind}`)||'');}catch{}}},[userId,kind]);
 if(!/^order-[a-f0-9]{32}$/.test(id))return null;
 return <div role="status" className="my-4 p-4 rounded-xl bg-amber-50 border border-amber-200 text-sm">결과 확인이 필요한 이전 주문이 있습니다. <Link className="font-bold underline" href={`/payments/return?paymentId=${encodeURIComponent(id)}`}>다시 결제하지 않고 결과 확인하기</Link></div>;
}
