
'use client';

import React from 'react';
import { X, BookOpen } from 'lucide-react';
import QuestionRenderer from '@/components/QuestionRenderer';

interface SolutionViewerModalProps {
    onClose: () => void;
    question: any;
}

export default function SolutionViewerModal({ onClose, question }: SolutionViewerModalProps) {
    if (!question) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white w-[800px] max-w-[95vw] max-h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
                {/* Header */}
                <div className="p-4 border-b flex justify-between items-center bg-green-50/50">
                    <div className="flex items-center gap-2">
                        <span className="bg-green-100 text-green-700 p-2 rounded-lg">
                            <BookOpen size={20} />
                        </span>
                        <div>
                            <h2 className="font-bold text-lg text-green-900">
                                해설 보기
                            </h2>
                            <p className="text-sm text-green-700/70">
                                {question.school} {question.exam_year} #{question.question_number || '?'}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-slate-200 rounded-full transition-colors"
                    >
                        <X size={24} className="text-slate-500" />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto bg-slate-50 p-6">
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 min-h-[400px]">
                        <QuestionRenderer
                            xmlContent="" // XML not needed for solution image mode
                            externalImages={question.question_images}
                            displayMode="solution"
                            showDownloadAction={false}
                            className="border-none shadow-none p-0"
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}
