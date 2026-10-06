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

    const labelStyle: React.CSSProperties = { display: 'block', margin: '0 0 8px', fontSize: 14, fontWeight: 700, color: 'var(--rd-nav)' };
    const fieldStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', background: 'var(--rd-panel)', border: 0, borderRadius: 14, padding: '13px 14px', fontSize: 16, color: 'var(--rd-text)', fontFamily: 'inherit', outline: 'none' };

    return (
        <div className="rd rd-overlay">
            <div className="rd-modal rd-modal-sm" role="dialog" aria-modal="true" aria-labelledby="report-modal-title">
                <div className="rd-sheet-handle" />
                <div className="rd-modal-head">
                    <h2 id="report-modal-title" className="rd-modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <AlertTriangle size={20} style={{ color: 'var(--rd-ink)', flex: 'none' }} />
                        불편/오류 신고하기
                    </h2>
                    <button type="button" onClick={onClose} aria-label="닫기" className="rd-modal-x">
                        <X size={20} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                    <div className="rd-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                        <div>
                            <label style={labelStyle}>신고 대상 자료</label>
                            <div style={{ padding: '13px 14px', borderRadius: 14, background: 'var(--rd-zone)', fontSize: 15, fontWeight: 600, lineHeight: 1.5, color: 'var(--rd-text)' }}>
                                {examGroup.title}
                            </div>
                        </div>

                        <div>
                            <label style={labelStyle}>신고 유형</label>
                            <select
                                value={reportType}
                                onChange={(e) => setReportType(e.target.value)}
                                style={{ ...fieldStyle, cursor: 'pointer' }}
                            >
                                <option value="오타/오류">문제 오타 및 정답 오류</option>
                                <option value="화질불량">파일 화질 불량 / 깨짐 현상</option>
                                <option value="다운로드">다운로드 불가 / 빈 파일</option>
                                <option value="기타">기타 불편사항</option>
                            </select>
                        </div>

                        <div>
                            <label style={labelStyle}>상세 내용</label>
                            <textarea
                                value={content}
                                onChange={(e) => setContent(e.target.value)}
                                placeholder="어떤 파일(PDF, HWP, DB)의 몇 번 문제인지 등 상세한 정보를 적어주시면 빠른 확인에 도움이 됩니다."
                                style={{ ...fieldStyle, minHeight: 120, resize: 'none', lineHeight: 1.6 }}
                                required
                            />
                        </div>
                    </div>

                    <div className="rd-modal-actions" style={{ marginTop: 20 }}>
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="rd-btn rd-btn-primary rd-btn-block"
                        >
                            {isSubmitting ? '접수 중...' : '신고 접수하기'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
