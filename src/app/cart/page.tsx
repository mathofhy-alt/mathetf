"use client";

import React, { useState, useEffect } from 'react';
import { useCart } from '@/components/providers/CartProvider';
import { ShoppingCart, Trash2, CreditCard } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import type { User } from '@supabase/supabase-js';

export default function CartPage() {
    const { items, cartCount, totalPrice, isLoading, removeFromCart, fetchCart, clearCart } = useCart();
    const [isCheckingOut, setIsCheckingOut] = useState(false);
    const [user, setUser] = useState<User | null>(null);
    const [earnedPoints, setEarnedPoints] = useState(0);
    const [pointsToUse, setPointsToUse] = useState<number | string>('');
    const supabase = createClient();

    const totalPoints = earnedPoints;
    const usedPoints = typeof pointsToUse === 'number' ? pointsToUse : 0;
    const finalAmount = Math.max(0, totalPrice - usedPoints);

    useEffect(() => {
        supabase.auth.getUser().then(({ data }) => {
            setUser(data.user);
            if (data.user) {
                supabase.from('profiles').select('earned_points').eq('id', data.user.id).single()
                .then(({ data: profileData }) => {
                    if (profileData) {
                        setEarnedPoints(profileData.earned_points || 0);
                    }
                });
            }
        });
        fetchCart();
    }, [supabase, fetchCart]);

    const handleCheckout = async () => {
        if (!user || cartCount === 0) return;
        setIsCheckingOut(true);

        const storeId = process.env.NEXT_PUBLIC_PORTONE_STORE_ID;
        const channelKey = process.env.NEXT_PUBLIC_PORTONE_CHANNEL_KEY;

        if (!(window as any).PortOne) {
            alert('결제 모듈이 로드되지 않았습니다.');
            setIsCheckingOut(false);
            return;
        }

        const paymentId = `cart-pay-${crypto.randomUUID().replace(/-/g, '').substring(0, 29)}`;
        const orderName = items.length === 1 ? items[0].title : `${items[0].title} 외 ${items.length - 1}건`;

        try {
            // 0원 결제 (포인트 전액 결제) 처리
            if (finalAmount === 0) {
                // PG 호출 스킵, 바로 API 전송
                const verifyRes = await fetch('/api/cart/checkout', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        paymentId: paymentId,
                        amount: 0,
                        originalTotalAmount: totalPrice,
                        usedPoints: usedPoints,
                        userId: user.id,
                        items: items
                    })
                });

                const verifyData = await verifyRes.json();

                if (verifyData.success) {
                    // Google Ads 전환 추적
                    if (typeof window !== 'undefined' && (window as any).gtag) {
                        (window as any).gtag('event', 'conversion', {'send_to': 'AW-17263917467/Rs-WCNjnvOgaEJvziahA'});
                    }
                    alert(`포인트 결제가 성공적으로 완료되었습니다.`);
                    await clearCart();
                    window.location.href = '/mypage';
                } else {
                    alert(`주문 처리 실패: ${verifyData.message}`);
                }
                setIsCheckingOut(false);
                return;
            }

            const response = await (window as any).PortOne.requestPayment({
                storeId,
                paymentId,
                orderName: orderName,
                totalAmount: finalAmount,
                currency: 'CURRENCY_KRW',
                channelKey,
                payMethod: 'CARD', // 장바구니 모델이므로 간편결제, 네이버페이, 카드 등 모두 가능
                isEscrow: false,   // 3만원 이하, 환금성 아니므로 에스크로 면제 가능
                customer: {
                    fullName: user.email?.split('@')[0] || 'User',
                    email: user.email,
                    id: user.id,
                    phoneNumber: user.user_metadata?.phone || user.phone || '010-0000-0000',
                }
            });

            if (response.code != null) {
                alert(`결제 실패: ${response.message}`);
                setIsCheckingOut(false);
                return;
            }

            // Verify Cart Checkout
            const verifyRes = await fetch('/api/cart/checkout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    paymentId: response.paymentId,
                    amount: finalAmount,
                    originalTotalAmount: totalPrice,
                    usedPoints: usedPoints,
                    userId: user.id,
                    items: items
                })
            });

            const verifyData = await verifyRes.json();

            if (verifyData.success) {
                // Google Ads 전환 추적
                if (typeof window !== 'undefined' && (window as any).gtag) {
                    (window as any).gtag('event', 'conversion', {'send_to': 'AW-17263917467/Rs-WCNjnvOgaEJvziahA'});
                }
                alert(`결제가 성공적으로 완료되었습니다.`);
                await clearCart();
                // Optionally redirect to My Page or Library
                window.location.href = '/mypage';
            } else {
                alert(`주문 처리 실패: ${verifyData.message}`);
            }
        } catch (error: any) {
            alert(`결제 중 오류가 발생했습니다: ${error.message}`);
        } finally {
            setIsCheckingOut(false);
        }
    };

    if (isLoading) {
        return <div className="p-8 text-center text-slate-500">장바구니를 불러오는 중...</div>;
    }

    return (
        <div className="max-w-[1000px] mx-auto p-6 md:p-12 w-full">
            <h1 className="text-3xl font-bold flex items-center gap-3 mb-8 text-slate-800">
                <ShoppingCart size={32} className="text-brand-600" />
                장바구니
            </h1>

            {cartCount === 0 ? (
                <div className="text-center py-20 bg-slate-50 rounded-2xl border border-slate-100">
                    <ShoppingCart size={48} className="mx-auto text-slate-300 mb-4" />
                    <p className="text-lg text-slate-500 font-medium">장바구니가 비어있습니다.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Items List */}
                    <div className="lg:col-span-2 space-y-4">
                        {items.map(item => (
                            <div key={item.id} className="flex justify-between items-center bg-white p-5 border border-slate-200 rounded-xl shadow-sm hover:border-brand-300 transition-colors">
                                <div>
                                    <span className="text-xs font-bold text-brand-600 bg-brand-50 px-2 py-1 rounded mb-2 inline-block">
                                        {item.item_type === 'MOCK_EXAM' ? '모의고사' : item.item_type === 'HWP_DOC' ? '한글문서' : item.item_type}
                                    </span>
                                    <h3 className="font-bold text-slate-800 text-lg">{item.title}</h3>
                                    <p className="text-slate-500 text-sm mt-1">{item.price.toLocaleString()} 원</p>
                                </div>
                                <button 
                                    onClick={() => removeFromCart(item.id)}
                                    className="text-slate-400 hover:text-red-500 hover:bg-red-50 p-2 rounded-full transition-colors"
                                    title="삭제"
                                >
                                    <Trash2 size={20} />
                                </button>
                            </div>
                        ))}
                    </div>

                    {/* Order Summary */}
                    <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 h-fit sticky top-20">
                        <h2 className="text-lg font-bold text-slate-800 mb-6">결제 정보</h2>
                        
                        <div className="space-y-3 mb-6">
                            <div className="flex justify-between text-slate-600">
                                <span>총 상품 수량</span>
                                <span className="font-bold">{cartCount}개</span>
                            </div>
                            <div className="flex justify-between text-slate-600">
                                <span>상품 금액</span>
                                <span>{totalPrice.toLocaleString()}원</span>
                            </div>
                        </div>

                        {/* 포인트 사용 UI */}
                        <div className="border-t border-slate-200 pt-4 mb-6 space-y-3">
                            <div className="flex justify-between items-center">
                                <span className="text-slate-800 font-bold">포인트 사용</span>
                                <span className="text-xs text-slate-500">보유: {totalPoints.toLocaleString()}P</span>
                            </div>
                            <div className="flex gap-2">
                                <input
                                    type="number"
                                    value={pointsToUse}
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        if (val === '') {
                                            setPointsToUse('');
                                            return;
                                        }
                                        let num = parseInt(val, 10);
                                        if (isNaN(num)) return;
                                        if (num < 0) num = 0;
                                        // 보유 포인트 또는 총 결제 금액을 초과할 수 없음
                                        const maxUsable = Math.min(totalPoints, totalPrice);
                                        if (num > maxUsable) num = maxUsable;
                                        setPointsToUse(num);
                                    }}
                                    placeholder="0"
                                    className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-right focus:outline-none focus:border-brand-500"
                                />
                                <button
                                    onClick={() => setPointsToUse(Math.min(totalPoints, totalPrice))}
                                    className="px-3 py-2 bg-slate-800 text-white text-sm font-bold rounded-lg hover:bg-slate-700 whitespace-nowrap transition-colors"
                                >
                                    전액사용
                                </button>
                            </div>
                        </div>

                        <div className="border-t border-slate-200 pt-4 mb-8">
                            {usedPoints > 0 && (
                                <div className="flex justify-between items-center text-sm mb-2 text-rose-500 font-bold">
                                    <span>포인트 할인</span>
                                    <span>-{usedPoints.toLocaleString()}원</span>
                                </div>
                            )}
                            <div className="flex justify-between items-center text-lg">
                                <span className="font-bold text-slate-800">최종 결제 금액</span>
                                <span className="font-black text-brand-600 text-2xl">{finalAmount.toLocaleString()}원</span>
                            </div>
                            <div className="mt-4 p-3 bg-brand-50 rounded-lg text-xs text-brand-700 flex flex-col gap-1">
                                <p><strong>유의사항:</strong> 구매하신 문서(PDF/HWP)는 결제일로부터 <strong>30일간</strong>만 다운로드 가능합니다. (개인DB 제외)</p>
                            </div>
                        </div>

                        <button
                            onClick={handleCheckout}
                            disabled={isCheckingOut}
                            className="w-full bg-brand-600 hover:bg-brand-700 disabled:bg-slate-300 transform active:scale-95 transition-all text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-brand-200"
                        >
                            {isCheckingOut ? (
                                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : (
                                <>
                                    <CreditCard size={20} />
                                    결제하기
                                </>
                            )}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
