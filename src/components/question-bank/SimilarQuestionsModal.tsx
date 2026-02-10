
'use client';

import React, { useEffect, useState } from 'react';
import { X, Loader2, Plus, Check } from 'lucide-react';
import QuestionRenderer from '@/components/QuestionRenderer';

interface SimilarQuestionsModalProps {
    onClose: () => void;
    baseQuestion: any; // The question we are finding similarities for
    cart: any[];
    onToggleCart: (question: any) => void;
    onReplace?: (oldQuestion: any, newQuestion: any) => void;
}

export default function SimilarQuestionsModal({ onClose, baseQuestion, cart, onToggleCart, onReplace }: SimilarQuestionsModalProps) {
    const [questions, setQuestions] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!baseQuestion?.id) return;

        const fetchSimilar = async () => {
            setLoading(true);
            setError(null);
            try {
                // Fetch hardcoded top 10 for now
                const res = await fetch(`/api/pro/similar-questions?id=${baseQuestion.id}&limit=10`);
                if (!res.ok) {
                    const errorData = await res.json();
                    throw new Error(errorData.error || 'Failed to fetch similar questions');
                }
                const data = await res.json();
                if (data.success) {
                    setQuestions(data.data);
                } else {
                    throw new Error(data.error);
                }
            } catch (e: any) {
                console.error(e);
                setError(e.message);
            } finally {
                setLoading(false);
            }
        };

        fetchSimilar();
    }, [baseQuestion]);

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white w-[95vw] h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
                {/* Header */}
                <div className="p-4 border-b flex justify-between items-center bg-indigo-50/50 shrink-0">
                    <div>
                        <h2 className="font-bold text-lg text-indigo-900 flex items-center gap-2">
                            <span>🔍 유사 문항 검색</span>
                            <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-1 rounded-full">
                                {baseQuestion.school} {baseQuestion.exam_year}
                            </span>
                        </h2>
                        <p className="text-sm text-slate-500">
                            선택한 문제와 개념/유형이 유사한 문제를 찾았습니다.
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-slate-200 rounded-full transition-colors"
                    >
                        <X size={24} className="text-slate-500" />
                    </button>
                </div>

                {/* Body - Split View */}
                <div className="flex-1 flex overflow-hidden">
                    {/* Left Panel - Fixed Original Question */}
                    <div className="w-[450px] border-r border-slate-200 bg-white flex flex-col shadow-[4px_0_24px_-12px_rgba(0,0,0,0.1)] z-10 shrink-0">
                        <div className="p-4 border-b bg-indigo-50/30">
                            <h3 className="font-bold text-indigo-900 flex items-center gap-2">
                                <span className="text-xl">🎯</span>
                                원본 문제
                            </h3>
                        </div>
                        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                            <div className="bg-white rounded-xl shadow-sm border border-indigo-100 p-1">
                                <QuestionRenderer
                                    xmlContent={baseQuestion.content_xml}
                                    externalImages={baseQuestion.question_images}
                                    showDownloadAction={false}
                                    className="border-none shadow-none p-0"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Right Panel - Scrollable Similar Questions */}
                    <div className="flex-1 overflow-y-auto bg-slate-50 p-6">
                        {loading ? (
                            <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-4">
                                <Loader2 size={40} className="animate-spin text-indigo-500" />
                                <p>유사한 문제를 분석하고 있습니다...</p>
                            </div>
                        ) : error ? (
                            <div className="flex flex-col items-center justify-center h-full text-red-400 gap-2">
                                <p className="font-bold">오류가 발생했습니다</p>
                                <p className="text-sm">{error}</p>
                            </div>
                        ) : questions.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-2">
                                <p>유사한 문제를 찾을 수 없습니다.</p>
                                <p className="text-sm">임베딩 데이터가 생성되지 않았거나, 유사도가 낮은 경우일 수 있습니다.</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {questions.map((q, idx) => {
                                    const inCart = !!cart.find(c => c.id === q.id);
                                    const similarity = q.similarity ? Math.round(q.similarity * 100) : null;

                                    return (
                                        <div key={q.id} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden group hover:shadow-md transition-shadow flex flex-col h-full">
                                            {/* Card Header for Similar Item */}
                                            <div className="flex justify-between items-center px-4 py-3 border-b bg-white">
                                                <div className="flex gap-2 items-center flex-wrap">
                                                    <span className="bg-slate-100 text-slate-600 text-xs font-bold px-2 py-1 rounded">
                                                        #{idx + 1}
                                                    </span>
                                                    {similarity && (
                                                        <span className="text-xs font-bold text-green-600 bg-green-50 px-2 py-1 rounded">
                                                            {similarity}%
                                                        </span>
                                                    )}
                                                    <span className="text-sm font-bold text-slate-700 truncate max-w-[120px]">
                                                        {q.school}
                                                    </span>
                                                </div>
                                                <div className="flex gap-2">
                                                    {onReplace && (
                                                        <button
                                                            onClick={() => onReplace(baseQuestion, q)}
                                                            className="px-3 py-1.5 rounded-lg text-sm font-bold bg-white border border-amber-200 text-amber-600 hover:bg-amber-50 transition-colors whitespace-nowrap flex items-center gap-1"
                                                        >
                                                            교체
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={() => onToggleCart(q)}
                                                        className={`px-3 py-1.5 rounded-lg text-sm font-bold flex items-center gap-1 transition-colors whitespace-nowrap
                                                            ${inCart
                                                                ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                                                                : 'bg-white border border-indigo-200 text-indigo-600 hover:bg-indigo-50'
                                                            }`}
                                                    >
                                                        {inCart ? (
                                                            <><Check size={14} /> 담김</>
                                                        ) : (
                                                            <><Plus size={14} /> 담기</>
                                                        )}
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Question Content */}
                                            <div className="p-4 bg-white flex-1 overflow-hidden">
                                                <QuestionRenderer
                                                    xmlContent={q.content_xml}
                                                    externalImages={q.question_images}
                                                    showDownloadAction={false}
                                                    className="border-none shadow-none p-0 !text-sm"
                                                />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
