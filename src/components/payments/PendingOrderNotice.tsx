'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import { reviewKey } from '@/lib/payments/client';
// 10/7: 장바구니 새 디자인(.rd) 안에서만 쓰여 rd-cart-pending 으로 꾸민다. 판단 로직은 그대로.
export default function PendingOrderNotice({userId,kind}:{userId?:string;kind:'cart'|'topup'}){
 const [id,setId]=useState('');
 const [reviews,setReviews]=useState<string[]>([]);
 useEffect(()=>{
  const sync=()=>{try{setId(userId?localStorage.getItem(`mathetf_pending_payment_${userId}_${kind}`)||'':'');setReviews(userId?JSON.parse(localStorage.getItem(reviewKey(userId,kind))||'[]'):[]);}catch{}};
  sync();window.addEventListener('payment-updated',sync);window.addEventListener('storage',sync);window.addEventListener('pageshow',sync);
  return()=>{window.removeEventListener('payment-updated',sync);window.removeEventListener('storage',sync);window.removeEventListener('pageshow',sync);};
 },[userId,kind]);
 const valid=(value:string)=>/^order-[a-f0-9]{32}$/.test(value);
 if(!valid(id)&&!reviews.some(valid))return null;
 return <div role="status" className="rd-cart-pending">
  {valid(id)&&<p>결과 확인이 필요한 이전 주문이 있습니다. <Link className="rd-cart-pending-link" href={`/payments/return?paymentId=${encodeURIComponent(id)}`}>다시 확인 · 미결제 주문 정리</Link></p>}
  {reviews.filter(valid).map(review=><p key={review}>별도로 처리 중인 이전 주문이 있습니다. 다른 상품은 구매할 수 있습니다. <Link className="rd-cart-pending-link" href={`/payments/return?paymentId=${review}`}>처리 결과 확인 ({review.slice(-6)})</Link></p>)}
 </div>;
}
