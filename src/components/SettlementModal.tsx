
"use client";

import React, { useState } from 'react';
import { X, Check } from 'lucide-react';

interface SettlementModalProps {
    isOpen: boolean;
    onClose: () => void;
    earnedPoints: number;
    userId: string;
}

export default function SettlementModal({ isOpen, onClose, earnedPoints, userId }: SettlementModalProps) {
    const [amount, setAmount] = useState('');
    const [bankName, setBankName] = useState('');
    const [accountNumber, setAccountNumber] = useState('');
    const [accountHolder, setAccountHolder] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        setResult(null);

        const reqAmount = Number(amount);
        if (reqAmount > earnedPoints) {
            setResult({ success: false, message: '출금 요청 포인트가 보유한 수익 포인트를 초과할 수 없습니다.' });
            setIsSubmitting(false);
            return;
        }
        if (reqAmount < 1000) { // Minimum policy assumption
            setResult({ success: false, message: '최소 1,000P 부터 환전 가능합니다.' });
            setIsSubmitting(false);
            return;
        }

        try {
            const res = await fetch('/api/settlements/request', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    amount: reqAmount,
                    bankName,
                    accountNumber,
                    accountHolder
                })
            });

            const data = await res.json();
            if (data.success) {
                setResult({ success: true, message: '정산 요청이 완료되었습니다.' });
                setTimeout(() => {
                    onClose();
                    window.location.reload(); // Refresh to update points
                }, 1500);
            } else {
                setResult({ success: false, message: data.message || '요청 실패' });
            }
        } catch (error) {
            setResult({ success: false, message: '서버 오류가 발생했습니다.' });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                    <h3 className="font-bold text-slate-800">수익금 정산 신청</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
                        <X size={20} />
                    </button>
                </div>

                <div className="p-6">
                    {result?.success ? (
                        <div className="flex flex-col items-center justify-center py-8 text-center">
                            <div className="w-12 h-12 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-4">
                                <Check size={24} />
                            </div>
                            <h4 className="text-lg font-bold text-slate-800 mb-2">신청 완료!</h4>
                            <p className="text-slate-600">{result.message}</p>
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">출금 가능 포인트</label>
                                <div className="text-xl font-bold text-brand-600">{earnedPoints.toLocaleString()} P</div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">신청 금액</label>
                                <input
                                    type="number"
                                    required
                                    value={amount}
                                    onChange={e => setAmount(e.target.value)}
                                    className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
                                    placeholder="금액 입력"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1">은행명</label>
                                    <input
                                        type="text"
                                        required
                                        value={bankName}
                                        onChange={e => setBankName(e.target.value)}
                                        className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
                                        placeholder="예: 국민은행"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1">예금주</label>
                                    <input
                                        type="text"
                                        required
                                        value={accountHolder}
                                        onChange={e => setAccountHolder(e.target.value)}
                                        className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
                                        placeholder="실명 입력"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">계좌번호</label>
                                <input
                                    type="text"
                                    required
                                    value={accountNumber}
                                    onChange={e => setAccountNumber(e.target.value)}
                                    className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
                                    placeholder="- 없이 숫자만 입력"
                                />
                            </div>

                            {result && !result.success && (
                                <div className="text-red-500 text-sm font-medium">{result.message}</div>
                            )}

                            <button
                                type="submit"
                                disabled={isSubmitting || Number(amount) <= 0}
                                className="w-full bg-brand-600 text-white rounded py-3 font-bold hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed mt-4"
                            >
                                {isSubmitting ? '처리중...' : '정산 신청하기'}
                            </button>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
}
