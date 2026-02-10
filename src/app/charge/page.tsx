"use client";

import React, { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Coins, CreditCard } from 'lucide-react';
import Link from 'next/link';
import { User } from '@supabase/supabase-js';

// PortOne SDK Type Declaration
declare global {
    interface Window {
        PortOne: any;
    }
}

const POINT_PACKAGES = [
    { points: 5000, label: '5,000 P' },
    { points: 10000, label: '10,000 P', popular: true },
    { points: 30000, label: '30,000 P' },
    { points: 50000, label: '50,000 P' },
];

export default function ChargePage() {
    const [user, setUser] = useState<User | null>(null);
    const [currentPoints, setCurrentPoints] = useState(0);
    const [cart, setCart] = useState<{ [points: number]: number }>({});
    const [loading, setLoading] = useState(false);

    const router = useRouter();
    const supabase = createClient();

    useEffect(() => {
        const init = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                router.push('/login');
                return;
            }
            setUser(user);

            const { data } = await supabase.from('profiles').select('purchased_points').eq('id', user.id).single();
            if (data) setCurrentPoints(data.purchased_points);
        };
        init();
    }, [router, supabase]);

    const netAmount = Object.entries(cart).reduce((sum, [points, qty]) => sum + (Number(points) * qty), 0);
    const vatAmount = Math.floor(netAmount * 0.1);
    const totalAmount = netAmount + vatAmount;

    const selectedItems = POINT_PACKAGES.filter(pkg => (cart[pkg.points] || 0) > 0);
    const totalPoints = netAmount;

    const updateQuantity = (points: number, delta: number) => {
        setCart(prev => {
            const current = prev[points] || 0;
            const next = Math.max(0, Math.min(20, current + delta));
            if (next === 0) {
                const newCart = { ...prev };
                delete newCart[points];
                return newCart;
            }
            return { ...prev, [points]: next };
        });
    };

    const handlePayment = async () => {
        if (!user || totalAmount === 0) return;
        setLoading(true);

        const storeId = process.env.NEXT_PUBLIC_PORTONE_STORE_ID;
        const channelKey = process.env.NEXT_PUBLIC_PORTONE_CHANNEL_KEY;

        if (!window.PortOne) {
            alert('결제 모듈(PortOne)이 로드되지 않았습니다. 새로고침 후 다시 시도해주세요.');
            setLoading(false);
            return;
        }

        const paymentId = `payment-${crypto.randomUUID()}`;
        const orderNameStr = selectedItems.map(item => `${item.points.toLocaleString()}P x${cart[item.points]}`).join(', ');

        try {
            // 1. Request Payment (PortOne V2)
            const response = await window.PortOne.requestPayment({
                storeId: storeId,
                paymentId: paymentId,
                orderName: `수학ETF 포인트 (${orderNameStr})`,
                totalAmount: totalAmount,
                currency: 'CURRENCY_KRW',
                channelKey: channelKey,
                payMethod: 'CARD',
                customer: {
                    fullName: user.email?.split('@')[0] || 'User',
                    email: user.email,
                    id: user.id,
                    phoneNumber: '010-0000-0000',
                }
            });

            if (response.code != null) {
                alert(`결제 실패: ${response.message}`);
                setLoading(false);
                return;
            }

            // 3. Verify on Server
            const verifyRes = await fetch('/api/payments/complete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    paymentId: response.paymentId,
                    orderId: paymentId,
                    amount: totalAmount,
                    points: totalPoints,
                    userId: user.id
                })
            });

            const verifyData = await verifyRes.json();

            if (verifyData.success) {
                alert(`${totalPoints.toLocaleString()} 포인트가 충전되었습니다!`);
                router.push('/mypage');
            } else {
                alert(`충전 실패: ${verifyData.message}`);
            }

        } catch (error: any) {
            alert(`결제 중 오류가 발생했습니다: ${error.message || error}`);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#f3f4f6]">
            <header className="bg-white border-b border-slate-200">
                <div className="max-w-[800px] mx-auto px-4 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link href="/mypage" className="text-slate-500 hover:text-slate-800"><ArrowLeft /></Link>
                        <h1 className="text-xl font-bold text-slate-800">포인트 충전</h1>
                    </div>
                    <div className="flex items-center gap-2 text-sm font-medium text-slate-600 bg-slate-100 px-3 py-1.5 rounded-full">
                        <Coins size={14} className="text-yellow-500" />
                        <span>현재: {currentPoints.toLocaleString()} P</span>
                    </div>
                </div>
            </header>

            <main className="max-w-[800px] mx-auto px-4 py-8">
                <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-8">
                    <h2 className="text-lg font-bold text-slate-800 mb-6 font-display">원하는 포인트를 담으세요</h2>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                        {POINT_PACKAGES.map(pkg => (
                            <div
                                key={pkg.points}
                                className={`p-5 rounded-xl border-2 flex items-center justify-between transition-all ${cart[pkg.points] > 0
                                    ? 'border-brand-600 bg-brand-50/30'
                                    : 'border-slate-100 hover:border-brand-100'
                                    }`}
                            >
                                <div className="flex items-center gap-4">
                                    <div className={`w-12 h-12 rounded-full flex items-center justify-center ${cart[pkg.points] > 0 ? 'bg-brand-100 text-brand-600' : 'bg-slate-100 text-slate-400'}`}>
                                        <Coins size={24} />
                                    </div>
                                    <div>
                                        <div className="font-bold text-slate-800">{pkg.label}</div>
                                        <div className="text-xs text-slate-400">{(pkg.points * 1.1).toLocaleString()}원 (VAT포함)</div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <div className="flex items-center gap-2 border border-slate-200 rounded-lg p-1 bg-white">
                                        <button
                                            onClick={() => updateQuantity(pkg.points, -1)}
                                            className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-slate-100 text-slate-400 font-bold"
                                        >
                                            -
                                        </button>
                                        <span className="min-w-[20px] text-center font-black text-slate-800">
                                            {cart[pkg.points] || 0}
                                        </span>
                                        <button
                                            onClick={() => updateQuantity(pkg.points, 1)}
                                            className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-slate-100 text-brand-600 font-bold"
                                        >
                                            +
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="bg-slate-50 rounded-xl p-6 mb-8 border border-slate-200 border-dashed">
                        <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-4">결제 내역 요약</h3>

                        {selectedItems.length > 0 ? (
                            <div className="space-y-3 mb-6">
                                {selectedItems.map(item => (
                                    <div key={item.points} className="flex justify-between items-center bg-white p-3 rounded-lg shadow-sm border border-slate-100">
                                        <div className="flex items-center gap-2">
                                            <span className="text-brand-600 font-bold">{item.label}</span>
                                            <span className="text-slate-400 text-xs">× {cart[item.points]}세트</span>
                                        </div>
                                        <span className="font-bold text-slate-700">{(item.points * cart[item.points]).toLocaleString()}원</span>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="py-8 text-center text-slate-400 text-sm italic">
                                포인트를 선택하면 여기에 내역이 표시됩니다.
                            </div>
                        )}

                        <div className="border-t border-slate-200 pt-4 flex flex-col items-end gap-2">
                            <div className="flex justify-between w-full text-sm text-slate-500">
                                <span>공급가액 총 합계</span>
                                <span>{netAmount.toLocaleString()}원</span>
                            </div>
                            <div className="flex justify-between w-full text-sm text-slate-500 border-b border-slate-200 pb-2 mb-2">
                                <span>부가가치세 (10%)</span>
                                <span>{vatAmount.toLocaleString()}원</span>
                            </div>
                            <div className="flex justify-between w-full items-center">
                                <span className="text-slate-800 font-bold italic">FINAL TOTAL</span>
                                <div className="text-right">
                                    <span className="text-3xl font-black text-brand-600">{totalAmount.toLocaleString()}원</span>
                                    <div className="text-[10px] text-slate-400">부가가치세 포함</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <button
                        onClick={handlePayment}
                        disabled={loading || totalAmount === 0}
                        className={`w-full py-5 rounded-xl font-bold text-xl text-white shadow-xl shadow-brand-600/20 flex items-center justify-center gap-3 transition-all active:scale-[0.98] ${loading || totalAmount === 0
                                ? 'bg-slate-300 cursor-not-allowed shadow-none'
                                : 'bg-brand-600 hover:bg-brand-700'
                            }`}
                    >
                        {loading ? (
                            <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                            <>
                                <CreditCard size={24} />
                                <span>{totalAmount === 0 ? '구매할 포인트를 선택해주세요' : `${totalAmount.toLocaleString()}원 결제하기`}</span>
                            </>
                        )}
                    </button>

                    <p className="mt-6 text-center text-slate-400 text-xs leading-relaxed">
                        선택하신 포인트는 결제 완료 즉시 계정에 반영됩니다.<br />
                        결제 및 환불 관련 문의는 고객센터를 이용해 주세요.
                    </p>
                </div>
            </main>
        </div>
    );
}
