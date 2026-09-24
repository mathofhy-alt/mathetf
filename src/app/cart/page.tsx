"use client";

import PageHeading from "@/components/PageHeading";
import { payOrder } from '@/lib/payments/client';
import PendingOrderNotice from '@/components/payments/PendingOrderNotice';
import React, { useState, useEffect } from 'react';
import { useCart } from '@/components/providers/CartProvider';
import { ShoppingCart, Trash2, CreditCard } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import Header from '@/components/Header';
import Link from 'next/link';
import type { User } from '@supabase/supabase-js';

export default function CartPage() {
    const { items, cartCount, totalPrice, isLoading, removeFromCart, fetchCart } = useCart();
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
        try {
            await payOrder(user, {kind:'cart',items,usedPoints});
            window.location.href='/mypage';
        } catch(e:any) { alert(e.message); }
        finally { setIsCheckingOut(false); }
    };

    if (isLoading) {
        return <div className="p-8 text-center text-slate-500">장바구니를 불러오는 중...</div>;
    }

    return (
        <div className="min-h-screen bg-[#F2F3F0]">
            <Header />
        <div className="max-w-[1000px] mx-auto p-6 md:p-12 w-full">
            <PageHeading eyebrow="YOUR SELECTION" title="선택한 자료." description="필요한 자료를 한곳에 모았습니다. 구매할 항목을 확인해 주세요."/>

            <PendingOrderNotice userId={user?.id} kind="cart" />
            {cartCount === 0 ? (
                <div className="text-center py-20 bg-slate-50 rounded-2xl border border-slate-100">
                    <ShoppingCart size={48} className="mx-auto text-slate-300 mb-4" />
                    <p className="text-lg text-slate-500 font-medium">장바구니가 비어있습니다.</p>
                    <p className="mt-2 text-sm text-slate-500">기출 시험지를 살펴보고 필요한 파일을 골라주세요.</p>
                    <Link href="/#catalog" className="mt-5 inline-flex rounded-xl bg-[#193740] px-5 py-3 text-sm font-bold text-white">출제자료 살펴보기 →</Link>
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
                                <p><strong>자료 제공:</strong> 유료 PDF·HWP는 결제 완료 후 즉시 다운로드할 수 있습니다.</p>
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
                                    결제 / 결과 확인
                                </>
                            )}
                        </button>
                    </div>
                </div>
            )}
        </div>
        </div>
    );
}
