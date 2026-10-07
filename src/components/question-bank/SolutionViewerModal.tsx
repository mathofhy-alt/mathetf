
'use client';

import React, { useEffect, useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import QuestionRenderer from '@/components/QuestionRenderer';

interface SolutionViewerModalProps {
    onClose: () => void;
    question: any;
}

export default function SolutionViewerModal({ onClose, question }: SolutionViewerModalProps) {
    // [2026-10-02] 해설 캡쳐는 로그인한 사람에게만 내려온다(lib/questions/imageAccess).
    // 비로그인 때 담아 둔 문항은 해설 없이 보관돼 있을 수 있으니, 열 때마다 이 문항 이미지를 새로 받는다.
    const [images, setImages] = useState<any[] | null>(null);
    useEffect(() => {
        if (!question?.id) return;
        let alive = true;
        setImages(null);
        fetch('/api/questions/images', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: [question.id] }) })
            .then(r => r.json())
            .then(j => { if (alive) setImages(j?.success ? (j.images?.[question.id] || []) : (question.question_images || [])); })
            .catch(() => { if (alive) setImages(question.question_images || []); });
        return () => { alive = false; };
    }, [question]);

    if (!question) return null;

    return (
        <div role="dialog" aria-modal="true" aria-label="문항 해설" className="rd rd-overlay" onWheel={(e) => e.stopPropagation()} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
            {/* [10/7] 문항 상세보기 창과 같은 너비(720)·같은 모양 */}
            <div className="rd-modal rd-modal-flush" style={{ maxWidth: 720 }}>
                <div className="rd-sheet-handle" />
                {/* Header */}
                <div className="rd-modal-band rd-modal-head">
                    <div style={{ minWidth: 0 }}>
                        <h2 className="rd-modal-title">해설 보기</h2>
                        <p className="rd-modal-sub">
                            {question.school} {question.year||question.exam_year} #{question.question_number || '?'}
                        </p>
                    </div>
                    <button
                        aria-label="해설 닫기" onClick={onClose}
                        className="rd-modal-x"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Body */}
                <div data-modal-scroll style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '0 20px 20px' }}>
                    <div className="rd-qview">
                        {images === null ? (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '40px 0', fontSize: 15, color: 'var(--rd-sub)' }}><Loader2 size={18} className="animate-spin" />해설을 불러오는 중</div>
                        ) : (
                            <QuestionRenderer
                                xmlContent=""
                                externalImages={images}
                                displayMode="solution"
                                showDownloadAction={false}
                                className="border-none shadow-none p-0"
                            />
                        )}
                    </div>
                </div>
            </div>
        </div>
    );

}

