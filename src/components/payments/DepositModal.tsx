"use client";

import React, { useState } from 'react';
import { X, Coins, CreditCard, ChevronRight } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';

interface DepositModalProps {
    isOpen: boolean;
    onClose: () => void;
    user: any;
    onSuccess?: (points: number) => void;
}

const POINT_PACKAGES = [
    { points: 5000, label: '5,000 P' },
    { points: 10000, label: '10,000 P', popular: true },
    { points: 30000, label: '30,000 P' },
    { points: 50000, label: '50,000 P' },
];

export default function DepositModal({ isOpen, onClose, user, onSuccess }: DepositModalProps) {
    const [cart, setCart] = useState<{ [points: number]: number }>({});
    const [loading, setLoading] = useState(false);
    const supabase = createClient();

    if (!isOpen) return null;

    const netAmount = Object.entries(cart).reduce((sum, [points, qty]) => sum + (Number(points) * qty), 0);
    const vatAmount = Math.floor(netAmount * 0.1);
    const totalAmount = netAmount + vatAmount;

    // Selected Items for Order Name & DB
    const selectedItems = POINT_PACKAGES.filter(pkg => cart[pkg.points] > 0);
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

        if (!(window as any).PortOne) {
            alert('결제 모듈이 로드되지 않았습니다.');
            setLoading(false);
            return;
        }

        const paymentId = `payment-${crypto.randomUUID()}`;
        const orderName = selectedItems.map(item => `${item.points.toLocaleString()}P x${cart[item.points]}`).join(', ');

        try {
            const response = await (window as any).PortOne.requestPayment({
                storeId,
                paymentId,
                orderName: `수학ETF 포인트 (${orderName})`,
                totalAmount: totalAmount,
                currency: 'CURRENCY_KRW',
                channelKey,
                payMethod: 'CARD',
                customer: {
                    fullName: user.email?.split('@')[0] || 'User',
                    email: user.email,
                    id: user.id,
                }
            });

            if (response.code != null) {
                alert(`결제 실패: ${response.message}`);
                return;
            }

            // Verify
            const verifyRes = await fetch('/api/payments/complete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    paymentId: response.paymentId,
                    amount: totalAmount,
                    points: totalPoints,
                    userId: user.id
                })
            });

            const verifyData = await verifyRes.json();

            if (verifyData.success) {
                alert(`${totalPoints.toLocaleString()} 포인트가 충전되었습니다!`);
                if (onSuccess) onSuccess(totalPoints);
                onClose();
            } else {
                alert(`충전 실패: ${verifyData.message}`);
            }
        } catch (error: any) {
            alert(`오류가 발생했습니다: ${error.message}`);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                    <h3 className="font-bold text-slate-800 flex items-center gap-2">
                        <Coins size={18} className="text-yellow-500" />
                        포인트 충전
                    </h3>
                    <button onClick={onClose} className="p-1 hover:bg-slate-200 rounded-full transition-colors">
                        <X size={20} className="text-slate-400" />
                    </button>
                </div>

                <div className="p-6">
                    {/* Fixed height package list container */}
                    <div className="space-y-3 mb-6 h-[320px] overflow-y-auto pr-1">
                        {POINT_PACKAGES.map((pkg) => (
                            <div
                                key={pkg.points}
                                className={`w-full flex items-center justify-between p-4 rounded-xl border-2 transition-all ${cart[pkg.points] > 0
                                    ? 'border-brand-600 bg-brand-50/30'
                                    : 'border-slate-100 bg-white'
                                    }`}
                            >
                                <div className="flex items-center gap-3">
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${cart[pkg.points] > 0 ? 'bg-brand-100 text-brand-600' : 'bg-slate-100 text-slate-400'
                                        }`}>
                                        <Coins size={20} />
                                    </div>
                                    <div className="text-left">
                                        <div className="font-bold text-slate-800">{pkg.label}</div>
                                        <div className="text-[10px] text-slate-500">{(pkg.points * 1.1).toLocaleString()}원 (VAT포함)</div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <div className="flex items-center gap-2 border border-slate-200 rounded-lg p-1 bg-white shadow-sm">
                                        <button
                                            onClick={() => updateQuantity(pkg.points, -1)}
                                            className="w-6 h-6 flex items-center justify-center rounded hover:bg-slate-100 text-slate-400 transition-colors"
                                        >
                                            -
                                        </button>
                                        <span className="min-w-[16px] text-center text-xs font-bold text-slate-700">
                                            {cart[pkg.points] || 0}
                                        </span>
                                        <button
                                            onClick={() => updateQuantity(pkg.points, 1)}
                                            className="w-6 h-6 flex items-center justify-center rounded hover:bg-slate-100 text-brand-600 transition-colors"
                                        >
                                            +
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Fixed height summary container */}
                    <div className="h-[140px] mb-6">
                        {totalAmount > 0 ? (
                            <div className="bg-slate-50 rounded-xl p-4 h-full border border-slate-100 animate-in fade-in slide-in-from-bottom-2 duration-300 flex flex-col justify-between">
                                <div>
                                    <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">선택한 항목</div>
                                    <div className="space-y-1 max-h-[40px] overflow-y-auto">
                                        {selectedItems.map(item => (
                                            <div key={item.points} className="flex justify-between text-xs">
                                                <span className="text-slate-600">{item.label} × {cart[item.points]}세트</span>
                                                <span className="font-medium text-slate-700">{(item.points * cart[item.points]).toLocaleString()}원</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <div>
                                    <div className="flex justify-between items-center text-xs text-slate-400 mb-2 border-t border-dashed border-slate-200 pt-2">
                                        <span>부가가치세 (10%)</span>
                                        <span>{vatAmount.toLocaleString()}원</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="font-bold text-slate-700">최종 결제 금액</span>
                                        <div className="text-right">
                                            <span className="text-xl font-black text-brand-600">{totalAmount.toLocaleString()}원</span>
                                            <div className="text-[10px] text-slate-400 text-right">부가가치세 포함</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center text-slate-300 border-2 border-dashed border-slate-100 rounded-xl bg-slate-50/30">
                                <Coins size={32} className="mb-2 opacity-20" />
                                <span className="text-xs">충전할 포인트를 선택해 주세요</span>
                            </div>
                        )}
                    </div>

                    <button
                        onClick={handlePayment}
                        disabled={loading || totalAmount === 0}
                        className="w-full bg-brand-600 hover:bg-brand-700 disabled:bg-slate-200 disabled:text-slate-400 text-white py-4 rounded-xl font-bold text-lg shadow-lg shadow-brand-600/20 transition-all flex items-center justify-center gap-2 active:scale-[0.98]"
                    >
                        {loading ? (
                            <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                            <>
                                <CreditCard size={20} />
                                {totalAmount === 0 ? '포인트를 선택해주세요' : `${totalAmount.toLocaleString()}원 결제하기`}
                            </>
                        )}
                    </button>

                    <p className="text-[11px] text-slate-400 text-center mt-4 leading-relaxed">
                        결제 시 이용약관 및 환불 정책에 동의하는 것으로 간주됩니다.<br />
                        충전된 포인트는 즉시 지급되며 마이페이지에서 확인 가능합니다.
                    </p>
                </div>
            </div>
        </div>
    );
}
