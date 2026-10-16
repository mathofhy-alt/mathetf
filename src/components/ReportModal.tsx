"use client";

import React, { useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { X, AlertTriangle } from 'lucide-react';

interface ReportModalProps {
    isOpen: boolean;
    onClose: () => void;
    user: any;
    examGroup: { key: string; title: string } | null;
    /** [10/16] 'question' = 시험지 만들기 문항 하나(group_key 'question:<문항 id>'). 회원 메일 "오류·오타 어떻게 제보하냐" — 홈 목록의 작은 '신고'만 있었고 3월 이후 0건 */
    kind?: 'exam' | 'question';
}

const EXAM_TYPES: [string, string][] = [['오타/오류', '문제 오타 및 정답 오류'], ['화질불량', '파일 화질 불량 / 깨짐 현상'], ['다운로드', '다운로드 불가 / 빈 파일'], ['기타', '기타 불편사항']];
const QUESTION_TYPES: [string, string][] = [['문제 오타', '문제 오타'], ['정답 오류', '정답이 틀림'], ['해설 오류', '해설 오류·오타'], ['그림·수식 깨짐', '그림·수식이 깨짐'], ['기타', '기타']];

export default function ReportModal({ isOpen, onClose, user, examGroup, kind = 'exam' }: ReportModalProps) {
    const types = kind === 'question' ? QUESTION_TYPES : EXAM_TYPES;
    const [reportType, setReportType] = useState(types[0][0]);
    const [content, setContent] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [done, setDone] = useState(false);
    const supabase = createClient();

    if (!isOpen || !examGroup) return null;
    const close = () => { setDone(false); setContent(''); setReportType(types[0][0]); onClose(); };

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

            setDone(true);   // [10/16] 경고창 대신 창 안에서 접수 완료를 알린다
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
        <div className="rd rd-overlay" style={{ zIndex: 330 }} onClick={e => { if (e.target === e.currentTarget && !isSubmitting) close(); }}>
            <div className="rd-modal rd-modal-sm" role="dialog" aria-modal="true" aria-labelledby="report-modal-title">
                <div className="rd-sheet-handle" />
                <div className="rd-modal-head">
                    <h2 id="report-modal-title" className="rd-modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <AlertTriangle size={20} style={{ color: 'var(--rd-ink)', flex: 'none' }} />
                        {kind === 'question' ? '오류 제보하기' : '불편/오류 신고하기'}
                    </h2>
                    <button type="button" onClick={close} aria-label="닫기" className="rd-modal-x">
                        <X size={20} />
                    </button>
                </div>

                {done ? (
                    <div style={{ padding: '8px 0 4px' }}>
                        <p className="rd-modal-text">제보해 주셔서 고맙습니다. 확인한 뒤 바로 고쳐 두겠습니다.</p>
                        <div className="rd-modal-actions"><button type="button" onClick={close} className="rd-btn rd-btn-primary rd-btn-block">확인</button></div>
                    </div>
                ) : (
                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                    <div className="rd-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                        <div>
                            <label style={labelStyle}>{kind === 'question' ? '제보할 문항' : '신고 대상 자료'}</label>
                            <div style={{ padding: '13px 14px', borderRadius: 14, background: 'var(--rd-zone)', fontSize: 15, fontWeight: 600, lineHeight: 1.5, color: 'var(--rd-text)' }}>
                                {examGroup.title}
                            </div>
                        </div>

                        <div>
                            <label style={labelStyle}>{kind === 'question' ? '어떤 오류인가요?' : '신고 유형'}</label>
                            <select
                                value={reportType}
                                onChange={(e) => setReportType(e.target.value)}
                                style={{ ...fieldStyle, cursor: 'pointer' }}
                            >
                                {types.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                            </select>
                        </div>

                        <div>
                            <label style={labelStyle}>상세 내용</label>
                            <textarea
                                value={content}
                                onChange={(e) => setContent(e.target.value)}
                                placeholder={kind === 'question' ? '어느 부분이 어떻게 틀렸는지 적어 주세요. 예: ③번 보기의 부호가 반대예요' : '어떤 파일(PDF, HWP, DB)의 몇 번 문제인지 등 상세한 정보를 적어주시면 빠른 확인에 도움이 됩니다.'}
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
                            {isSubmitting ? '접수 중...' : kind === 'question' ? '제보하기' : '신고 접수하기'}
                        </button>
                    </div>
                </form>
                )}
            </div>
        </div>
    );
}
