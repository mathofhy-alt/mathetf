'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { CheckCircle, Clock } from 'lucide-react';

export default function AdminReportsClient() {
    const [reports, setReports] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const supabase = createClient();

    useEffect(() => {
        fetchReports();
    }, []);

    const fetchReports = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('exam_reports')
                .select(`*`)
                .order('created_at', { ascending: false });

            if (error) throw error;
            setReports(data || []);
        } catch (error) {
            console.error('Error fetching reports:', error);
        } finally {
            setLoading(false);
        }
    };

    const updateStatus = async (id: string, newStatus: string) => {
        try {
            const { error } = await supabase
                .from('exam_reports')
                .update({ status: newStatus })
                .eq('id', id);

            if (error) throw error;
            setReports(reports.map(r => r.id === id ? { ...r, status: newStatus } : r));
        } catch (error) {
            console.error('Error updating status:', error);
            alert('상태 업데이트 실패');
        }
    };

    if (loading) {
        return <div className="p-8 text-center text-gray-500">신고 내역을 불러오는 중...</div>;
    }

    return (
        <div className="p-6">
            <div className="mb-6 flex justify-between items-center">
                <h1 className="text-2xl font-bold text-gray-900">신고 관리 ({reports.length}건)</h1>
                <button onClick={fetchReports} className="text-sm text-blue-600 hover:text-blue-800 font-medium">
                    새로고침
                </button>
            </div>

            <div className="bg-white shadow rounded-lg overflow-hidden border border-gray-200">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[10%]">상태</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[15%]">신고일 / 신고자</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[25%]">신고 대상 (시험지)</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[10%]">유형</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[30%]">상세 내용</th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-[10%]">관리</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {reports.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                                        신고 내역이 없습니다.
                                    </td>
                                </tr>
                            ) : (
                                reports.map((report) => (
                                    <tr key={report.id} className="hover:bg-gray-50">
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            {report.status === 'resolved' ? (
                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                                    <CheckCircle size={14} /> 처리완료
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                                                    <Clock size={14} /> 대기중
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="text-sm text-gray-900">{new Date(report.created_at).toLocaleDateString()}</div>
                                            {/* auth.users(email) 조인을 위해선 RLS 세팅 필요 (현재 안 보일 수 있음) */}
                                            <div className="text-xs text-gray-500 truncate max-w-[150px]" title={report.user_id}>
                                                ID: {report.user_id.substring(0, 8)}...
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="text-sm font-medium text-gray-900 break-keep line-clamp-2" title={report.title}>
                                                {report.title}
                                            </div>
                                            <div className="text-xs text-gray-400 mt-1 truncate max-w-[250px]" title={report.group_key}>
                                                {report.group_key}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <span className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-md bg-gray-100 text-gray-800">
                                                {report.report_type}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="text-sm text-gray-900 whitespace-pre-wrap">
                                                {report.content}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                            {report.status === 'pending' ? (
                                                <button
                                                    onClick={() => updateStatus(report.id, 'resolved')}
                                                    className="text-green-600 hover:text-green-900 bg-green-50 px-3 py-1.5 rounded-md transition-colors"
                                                >
                                                    완료 처리
                                                </button>
                                            ) : (
                                                <button
                                                    onClick={() => updateStatus(report.id, 'pending')}
                                                    className="text-gray-500 hover:text-gray-900 bg-gray-100 px-3 py-1.5 rounded-md transition-colors"
                                                >
                                                    대기 전환
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
