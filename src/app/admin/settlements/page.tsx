
"use client";

import React, { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useRouter } from 'next/navigation';
import { Check, X, CreditCard, User, AlertCircle, RefreshCw } from 'lucide-react';

export default function AdminSettlementsPage() {
    const [isLoading, setIsLoading] = useState(true);
    const [isAdmin, setIsAdmin] = useState(false);
    const [pendingRequests, setPendingRequests] = useState<any[]>([]);
    const [historyRequests, setHistoryRequests] = useState<any[]>([]);

    // Modal State
    const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
    const [selectedRequest, setSelectedRequest] = useState<any>(null);
    const [rejectMemo, setRejectMemo] = useState('');
    const [isProccessing, setIsProccessing] = useState(false);

    const router = useRouter();
    const supabase = createClient();

    useEffect(() => {
        const checkAdmin = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                router.push('/login');
                return;
            }

            const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
            if (!profile || profile.role !== 'admin') {
                alert('관리자 권한이 없습니다.');
                router.push('/');
                return;
            }

            setIsAdmin(true);
            fetchRequests();
        };

        checkAdmin();
    }, [router, supabase]);

    const fetchRequests = async () => {
        // Fetch Pending
        const { data: pending, error: pendingError } = await supabase
            .from('settlement_requests')
            .select(`
                *,
                user:profiles(id, display_name)
            `)
            .eq('status', 'pending')
            .order('created_at', { ascending: true });

        if (pending) setPendingRequests(pending);

        // Fetch History
        const { data: history, error: historyError } = await supabase
            .from('settlement_requests')
            .select(`
                *,
                user:profiles(id, display_name)
            `)
            .in('status', ['completed', 'rejected'])
            .order('processed_at', { ascending: false })
            .limit(50); // Limit last 50

        if (history) setHistoryRequests(history);

        setIsLoading(false);
    };

    const handleApprove = async (id: string) => {
        if (!confirm('정말 승인(입금 완료) 처리하시겠습니까?')) return;
        setIsProccessing(true);

        try {
            const res = await fetch('/api/settlements/process', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    requestId: id,
                    status: 'completed'
                })
            });
            const data = await res.json();
            if (data.success) {
                alert('처리되었습니다.');
                fetchRequests();
            } else {
                alert('오류: ' + data.message);
            }
        } catch (e) {
            alert('통신 오류');
        } finally {
            setIsProccessing(false);
        }
    };

    const openRejectModal = (req: any) => {
        setSelectedRequest(req);
        setRejectMemo('');
        setIsRejectModalOpen(true);
    };

    const handleReject = async () => {
        if (!rejectMemo.trim()) {
            alert('반려 사유를 입력해주세요.');
            return;
        }
        if (!confirm('정말 반려하시겠습니까? (포인트가 환불됩니다)')) return;

        setIsProccessing(true);
        try {
            const res = await fetch('/api/settlements/process', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    requestId: selectedRequest.id,
                    status: 'rejected',
                    memo: rejectMemo
                })
            });
            const data = await res.json();
            if (data.success) {
                alert('반려되었습니다.');
                setIsRejectModalOpen(false);
                fetchRequests();
            } else {
                alert('오류: ' + data.message);
            }
        } catch (e) {
            alert('통신 오류');
        } finally {
            setIsProccessing(false);
        }
    };

    if (isLoading) return <div className="p-10 text-center">로딩중...</div>;
    if (!isAdmin) return null;

    return (
        <div className="min-h-screen bg-slate-100 p-8">
            <div className="max-w-6xl mx-auto">
                <h1 className="text-2xl font-bold text-slate-800 mb-8 flex items-center gap-2">
                    <CreditCard /> 정산 관리 (관리자)
                </h1>

                {/* Pending List */}
                <div className="bg-white rounded-lg shadow-sm border border-slate-200 mb-8 overflow-hidden">
                    <div className="bg-brand-50 px-6 py-4 border-b border-brand-100 flex justify-between items-center">
                        <h2 className="font-bold text-brand-800 flex items-center gap-2">
                            <AlertCircle size={18} /> 정산 대기 목록 ({pendingRequests.length})
                        </h2>
                        <button onClick={fetchRequests} className="text-sm text-brand-600 hover:underline flex items-center gap-1">
                            <RefreshCw size={14} /> 새로고침
                        </button>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
                                <tr>
                                    <th className="px-6 py-3">신청일</th>
                                    <th className="px-6 py-3">사용자 (ID)</th>
                                    <th className="px-6 py-3">신청 금액</th>
                                    <th className="px-6 py-3">은행 정보</th>
                                    <th className="px-6 py-3 text-right">관리</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {pendingRequests.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="px-6 py-10 text-center text-slate-400">대기 중인 정산 요청이 없습니다.</td>
                                    </tr>
                                ) : (
                                    pendingRequests.map(req => (
                                        <tr key={req.id} className="hover:bg-slate-50 transition-colors">
                                            <td className="px-6 py-4 text-slate-600">
                                                {new Date(req.created_at).toLocaleString()}
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="font-bold text-slate-800">{req.user?.display_name || '이름 없음'}</div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className="font-bold text-brand-600 text-base">{req.amount.toLocaleString()} P</span>
                                            </td>
                                            <td className="px-6 py-4 text-slate-600">
                                                <div className="font-medium">{req.bank_name}</div>
                                                <div>{req.account_number}</div>
                                                <div className="text-xs text-slate-400 pt-1">예금주: {req.account_holder}</div>
                                            </td>
                                            <td className="px-6 py-4 text-right space-x-2">
                                                <button
                                                    onClick={() => handleApprove(req.id)}
                                                    disabled={isProccessing}
                                                    className="px-3 py-1.5 bg-blue-600 text-white rounded font-bold hover:bg-blue-700 disabled:opacity-50"
                                                >
                                                    승인 (입금완료)
                                                </button>
                                                <button
                                                    onClick={() => openRejectModal(req)}
                                                    disabled={isProccessing}
                                                    className="px-3 py-1.5 bg-red-100 text-red-600 rounded font-bold hover:bg-red-200 disabled:opacity-50"
                                                >
                                                    반려
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>


                {/* History List */}
                <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
                    <div className="bg-slate-50 px-6 py-4 border-b border-slate-200">
                        <h2 className="font-bold text-slate-700">최근 처리 내역</h2>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
                                <tr>
                                    <th className="px-6 py-3">처리일</th>
                                    <th className="px-6 py-3">사용자</th>
                                    <th className="px-6 py-3">금액</th>
                                    <th className="px-6 py-3">은행 정보</th>
                                    <th className="px-6 py-3">상태</th>
                                    <th className="px-6 py-3">메모</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {historyRequests.map(req => (
                                    <tr key={req.id} className="hover:bg-slate-50 text-slate-600">
                                        <td className="px-6 py-4">
                                            {req.processed_at ? new Date(req.processed_at).toLocaleString() : '-'}
                                        </td>
                                        <td className="px-6 py-4">
                                            {req.user?.display_name}
                                        </td>
                                        <td className="px-6 py-4 font-bold">
                                            {req.amount.toLocaleString()} P
                                        </td>
                                        <td className="px-6 py-4">
                                            {req.bank_name} {req.account_number} ({req.account_holder})
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`px-2 py-1 rounded text-xs font-bold ${req.status === 'completed' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'
                                                }`}>
                                                {req.status === 'completed' ? '완료' : '반려'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-xs text-slate-500 max-w-xs truncate">
                                            {req.admin_memo || '-'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Reject Modal */}
            {isRejectModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                    <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
                        <h3 className="text-lg font-bold text-slate-800 mb-4">반려 사유 입력</h3>
                        <p className="text-sm text-slate-500 mb-4">
                            반려 시 해당 포인트({selectedRequest?.amount.toLocaleString()} P)는 사용자에게 자동 환불됩니다.
                        </p>
                        <textarea
                            className="w-full border border-slate-300 rounded p-3 h-32 focus:border-red-500 focus:outline-none resize-none mb-4"
                            placeholder="반려 사유를 입력하세요 (예: 계좌번호 오류)"
                            value={rejectMemo}
                            onChange={e => setRejectMemo(e.target.value)}
                        ></textarea>
                        <div className="flex justify-end gap-2">
                            <button
                                onClick={() => setIsRejectModalOpen(false)}
                                className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded font-bold"
                            >
                                취소
                            </button>
                            <button
                                onClick={handleReject}
                                disabled={isProccessing}
                                className="px-4 py-2 bg-red-600 text-white hover:bg-red-700 rounded font-bold"
                            >
                                반려 확정
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
