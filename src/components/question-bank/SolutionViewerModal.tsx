
'use client';

import React, { useEffect, useState } from 'react';
import { X, BookOpen, Loader2 } from 'lucide-react';
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
        <div role="dialog" aria-modal="true" aria-label="문항 해설" className="product-modal fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200" onWheel={(e) => e.stopPropagation()}>
            <div className="bg-white w-full max-w-md max-h-[90vh] rounded-2xl shadow-2xl flex flex-col">
                {/* Header */}
                <div className="p-4 border-b flex justify-between items-center bg-brand-50/50 flex-shrink-0">
                    <div className="flex items-center gap-2">
                        <span className="bg-brand-100 text-brand-700 p-2 rounded-lg">
                            <BookOpen size={20} />
                        </span>
                        <div>
                            <h2 className="font-bold text-lg text-brand-900">
                                해설 보기
                            </h2>
                            <p className="text-sm text-brand-700/70">
                                {question.school} {question.year||question.exam_year} #{question.question_number || '?'}
                            </p>
                        </div>
                    </div>
                    <button
                        aria-label="해설 닫기" onClick={onClose}
                        className="p-2 hover:bg-slate-200 rounded-full transition-colors"
                    >
                        <X size={24} className="text-slate-500" />
                    </button>
                </div>

                {/* Body */}
                <div data-modal-scroll className="flex-1 overflow-y-auto overflow-x-auto bg-slate-50 p-4">
                    <div className="bg-white p-3 rounded-xl shadow-sm border border-slate-200 min-w-0">
                        {images === null ? (
                            <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500"><Loader2 size={16} className="animate-spin" />해설을 불러오는 중</div>
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
