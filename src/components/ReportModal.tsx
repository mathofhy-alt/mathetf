"use client";

import React, { useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { X, AlertTriangle } from 'lucide-react';

interface ReportModalProps {
    isOpen: boolean;
    onClose: () => void;
    user: any;
    examGroup: { key: string; title: string } | null;
}

export default function ReportModal({ isOpen, onClose, user, examGroup }: ReportModalProps) {
    const [reportType, setReportType] = useState('오타/오류');
    const [content, setContent] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const supabase = createClient();

    if (!isOpen || !examGroup) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) {
            alert('로그인이 필요합니다.');
            return;
        }

        if (!content.trim()) {
            alert('신고 내용을 입력해주세요.');
            return;
        }

        setIsSubmitting(true);
        try {
            const { error } = await supabase.from('exam_reports').insert({
                user_id: user.id,
                group_key: examGroup.key,
                title: examGroup.title,
                report_type: reportType,
                content: content
            });

            if (error) throw error;

            alert('신고가 접수되었습니다. 관리자 확인 후 순차적으로 수정됩니다.');
            setContent('');
            setReportType('오타/오류');
            onClose();
        } catch (error: any) {
            console.error('Report submission error:', error);
            alert('신고 접수 중 오류가 발생했습니다: ' + error.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-200">
                <div className="bg-red-50 p-4 border-b border-red-100 flex justify-between items-center">
                    <h3 className="font-bold text-red-700 flex items-center gap-2">
                        <AlertTriangle size={18} />
                        불편/오류 신고하기
                    </h3>
                    <button onClick={onClose} className="text-red-400 hover:bg-red-100 hover:text-red-600 p-1.5 rounded-lg transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-5 space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">신고 대상 자료</label>
                        <div className="p-3 bg-slate-50 rounded-lg text-sm text-slate-700 font-medium break-keep leading-snug">
                            {examGroup.title}
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">신고 유형</label>
                        <select
                            value={reportType}
                            onChange={(e) => setReportType(e.target.value)}
                            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:border-red-500 focus:outline-none"
                        >
                            <option value="오타/오류">문제 오타 및 정답 오류</option>
                            <option value="화질불량">파일 화질 불량 / 깨짐 현상</option>
                            <option value="다운로드">다운로드 불가 / 빈 파일</option>
                            <option value="기타">기타 불편사항</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">상세 내용</label>
                        <textarea
                            value={content}
                            onChange={(e) => setContent(e.target.value)}
                            placeholder="어떤 파일(PDF, HWP, DB)의 몇 번 문제인지 등 상세한 정보를 적어주시면 빠른 확인에 도움이 됩니다."
                            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:border-red-500 focus:outline-none min-h-[100px] resize-none"
                            required
                        />
                    </div>

                    <div className="pt-2">
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="w-full bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white font-bold py-3 rounded-xl transition-all shadow-sm active:scale-95"
                        >
                            {isSubmitting ? '접수 중...' : '신고 접수하기'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
