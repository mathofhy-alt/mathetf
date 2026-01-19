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
    { points: 5000, price: 5000, label: '5,000 P' },
    { points: 10000, price: 10000, label: '10,000 P' },
    { points: 30000, price: 30000, label: '30,000 P' },
    { points: 50000, price: 50000, label: '50,000 P' },
];

export default function ChargePage() {
    const [user, setUser] = useState<User | null>(null);
    const [currentPoints, setCurrentPoints] = useState(0);
    const [selectedPackage, setSelectedPackage] = useState(POINT_PACKAGES[1]); // Default 10000
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

    const handlePayment = async () => {
        if (!user) return;
        setLoading(true);

        const storeId = process.env.NEXT_PUBLIC_PORTONE_STORE_ID;
        const channelKey = process.env.NEXT_PUBLIC_PORTONE_CHANNEL_KEY;

        if (!window.PortOne) {
            alert('결제 모듈(PortOne)이 로드되지 않았습니다. 새로고침 후 다시 시도해주세요.');
            setLoading(false);
            return;
        }

        if (!storeId || !channelKey) {
            alert('상점 ID 또는 채널 키 설정이 누락되었습니다.');
            setLoading(false);
            return;
        }

        const paymentId = `payment-${crypto.randomUUID()}`;

        try {
            // 1. Request Payment (PortOne V2)
            const response = await window.PortOne.requestPayment({
                storeId: storeId,
                paymentId: paymentId,
                orderName: `수학ETF 포인트 충전 (${selectedPackage.points}P)`,
                totalAmount: selectedPackage.price,
                currency: 'CURRENCY_KRW',
                channelKey: channelKey,
                payMethod: 'CARD', // Changed to CARD (Standard) as it is required
                customer: {
                    fullName: user.email?.split('@')[0] || 'User',
                    email: user.email,
                    id: user.id,
                    phoneNumber: '010-0000-0000', // Required field often
                }
            });

            if (response.code != null) {
                // Error occurred
                alert(`결제 실패: ${response.message}`);
                setLoading(false);
                return;
            }

            // 2. Determine Payment ID
            const completedPaymentId = response.paymentId;

            // 3. Verify on Server
            const verifyRes = await fetch('/api/payments/complete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    paymentId: completedPaymentId,
                    orderId: paymentId,
                    amount: selectedPackage.price,
                    userId: user.id
                })
            });

            const verifyData = await verifyRes.json();

            if (verifyData.success) {
                alert(`${selectedPackage.points.toLocaleString()} 포인트가 충전되었습니다!`);
                router.push('/mypage');
            } else {
                alert(`충전 실패: ${verifyData.message}`);
            }

        } catch (error: any) {
            console.error('Payment Error Details:', error);
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
                    <h2 className="text-lg font-bold text-slate-800 mb-6">충전할 금액을 선택하세요</h2>

                    <div className="grid grid-cols-2 gap-4 mb-8">
                        {POINT_PACKAGES.map(pkg => (
                            <button
                                key={pkg.points}
                                onClick={() => setSelectedPackage(pkg)}
                                className={`p-6 rounded-lg border-2 text-left transition-all ${selectedPackage.points === pkg.points
                                    ? 'border-brand-600 bg-brand-50'
                                    : 'border-slate-200 hover:border-brand-200 hover:bg-slate-50'
                                    }`}
                            >
                                <div className={`text-lg font-bold mb-1 ${selectedPackage.points === pkg.points ? 'text-brand-700' : 'text-slate-800'}`}>
                                    {pkg.label}
                                </div>
                                <div className="text-sm text-slate-500">
                                    {pkg.price.toLocaleString()}원
                                </div>
                            </button>
                        ))}
                    </div>

                    <div className="border-t border-slate-200 pt-6">
                        <div className="flex justify-between items-center mb-6">
                            <span className="text-slate-600 font-medium">총 결제 금액</span>
                            <span className="text-2xl font-bold text-brand-600">{selectedPackage.price.toLocaleString()}원</span>
                        </div>

                        <button
                            onClick={handlePayment}
                            disabled={loading}
                            className={`w-full py-4 rounded-lg font-bold text-lg text-white flex items-center justify-center gap-2 transition-colors ${loading ? 'bg-slate-400 cursor-not-allowed' : 'bg-brand-600 hover:bg-brand-700'
                                }`}
                        >
                            {loading ? '결제 진행 중...' : (
                                <>
                                    <CreditCard size={20} />
                                    <span>결제하기</span>
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </main>
        </div>
    );
}
