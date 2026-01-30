'use client';

import React, { useState } from 'react';
import { Trash2, GripVertical, FileText, CheckSquare, Save } from 'lucide-react';

interface ExamCartProps {
    cart: any[];
    onRemove: (id: string) => void;
    onReorder: (newCart: any[]) => void;
    onSaveConfig: () => void;
    onGenerate: () => void;
    isGenerating: boolean;
    user: any;
}

export default function ExamCart({ cart, onRemove, onReorder, onSaveConfig, onGenerate, isGenerating, user }: ExamCartProps) {
    const [draggedItemIndex, setDraggedItemIndex] = useState<number | null>(null);

    // Calc Stats
    const stats = {
        objective: cart.filter(q => q.type === 'objective' || !q.type).length, // Default to objective if unknown
        subjective: cart.filter(q => q.type === 'subjective').length,
    };

    const handleDragStart = (e: React.DragEvent, index: number) => {
        setDraggedItemIndex(index);
        e.dataTransfer.effectAllowed = 'move';
        // e.dataTransfer.setDragImage(e.currentTarget as Element, 0, 0); // Optional custom image
    };

    const handleDragOver = (e: React.DragEvent, index: number) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';

        if (draggedItemIndex === null || draggedItemIndex === index) return;

        // Swap Logic
        const newCart = [...cart];
        const draggedItem = newCart[draggedItemIndex];
        newCart.splice(draggedItemIndex, 1);
        newCart.splice(index, 0, draggedItem);

        onReorder(newCart);
        setDraggedItemIndex(index);
    };

    const handleDragEnd = () => {
        setDraggedItemIndex(null);
    };

    return (
        <div className="w-80 bg-white border-l shadow-xl flex flex-col z-10 h-full">
            <div className="p-4 border-b bg-gray-50">
                <h2 className="font-bold text-lg text-slate-800 flex justify-between items-center">
                    시험지 구성
                    <span className="text-sm bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">
                        {cart.length}문항
                    </span>
                </h2>
                <div className="flex gap-2 text-xs text-slate-500 mt-2">
                    <span className="flex items-center gap-1"><CheckSquare size={12} /> 객관식 {stats.objective}</span>
                    <span className="flex items-center gap-1"><FileText size={12} /> 주관식 {stats.subjective}</span>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {cart.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-40 text-gray-400 text-sm">
                        <FileText size={40} className="mb-2 opacity-20" />
                        <p>문제를 선택하여 담아주세요.</p>
                    </div>
                )}

                {cart.map((q, idx) => (
                    <div
                        key={q.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, idx)}
                        onDragOver={(e) => handleDragOver(e, idx)}
                        onDragEnd={handleDragEnd}
                        className={`border rounded-lg p-3 text-sm flex gap-3 group bg-white hover:border-indigo-300 transition-colors cursor-grab active:cursor-grabbing ${draggedItemIndex === idx ? 'opacity-50 border-dashed border-indigo-400 bg-indigo-50' : ''
                            }`}
                    >
                        <div className="text-gray-400 mt-0.5 cursor-move">
                            <GripVertical size={16} />
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="flex justify-between items-start">
                                <span className="font-bold text-indigo-600 mr-2 min-w-[20px]">{idx + 1}.</span>
                                <button
                                    onClick={() => onRemove(q.id)}
                                    className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition"
                                >
                                    <Trash2 size={14} />
                                </button>
                            </div>
                            <div className="truncate font-medium text-slate-700">
                                {q.school} {q.exam_year}
                            </div>
                            <div className="text-xs text-slate-500 flex justify-between mt-1">
                                <span>{q.unit || '미분류'}</span>
                                <span className={q.difficulty === 'Hard' ? 'text-red-500' : 'text-green-600'}>
                                    {q.difficulty}
                                </span>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            <div className="p-4 border-t bg-gray-50 space-y-2">
                <button
                    onClick={onSaveConfig}
                    disabled={cart.length === 0}
                    className="w-full bg-white border border-gray-300 text-gray-700 py-3 rounded-lg font-bold hover:bg-gray-50 transition flex justify-center items-center gap-2"
                >
                    <Save size={16} />
                    보관함에 저장
                </button>
                <button
                    onClick={onGenerate}
                    disabled={cart.length === 0 || isGenerating}
                    className="w-full bg-indigo-600 text-white py-3 rounded-lg font-bold hover:bg-indigo-700 disabled:opacity-50 transition flex justify-center items-center shadow-md shadow-indigo-200"
                >
                    {isGenerating ? (
                        <>
                            <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            생성 중...
                        </>
                    ) : (
                        '시험지 생성 (다운로드)'
                    )}
                </button>
            </div>
        </div>
    );
}
