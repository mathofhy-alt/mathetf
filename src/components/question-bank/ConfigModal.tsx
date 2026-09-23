'use client';

import React, { useState } from 'react';
import { X, FileText, LayoutGrid } from 'lucide-react';

interface ConfigModalProps {
    onClose: () => void;
    onConfirm: (title: string, questionsPerColumn: number) => void;
    isGenerating: boolean;
    onDraftChange?: (title:string, questionsPerColumn:number) => void;
    initialTitle?: string;
    initialQuestionsPerColumn?: number;
}

export default function ConfigModal({ onClose, onConfirm, isGenerating, initialTitle = '', initialQuestionsPerColumn = 2, onDraftChange }: ConfigModalProps) {
    const [title, setTitle] = useState(initialTitle);
    const [questionsPerColumn, setQuestionsPerColumn] = useState(initialQuestionsPerColumn);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!title.trim()) return;
        onConfirm(title, questionsPerColumn);
    };

    return (
        <div role="dialog" aria-modal="true" aria-label="시험지 설정" className="product-modal fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
                <div className="p-4 border-b flex justify-between items-center bg-slate-50">
                    <h3 className="font-bold text-lg flex items-center gap-2 text-slate-800">
                        <FileText className="text-brand-600" size={20} />
                        시험지 설정
                    </h3>
                    <button
                        aria-label="시험지 설정 닫기" onClick={onClose}
                        disabled={isGenerating}
                        className="p-2 hover:bg-slate-200 rounded-full transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-6">
                    <div>
                        <label className="block text-sm font-bold text-slate-700 mb-2">
                            시험지 제목 <span className="text-red-500">*</span>
                        </label>
                        <input
                            aria-label="시험지 제목" type="text"
                            maxLength={100}
                            value={title}
                            onChange={(e) => {setTitle(e.target.value);onDraftChange?.(e.target.value,questionsPerColumn);}}
                            placeholder="예: 공통수학2 기말고사 대비"
                            className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-brand-500 outline-none text-slate-800 font-medium"
                            autoFocus
                        />
                        <p className="text-xs text-slate-500 mt-2">
                            * 한글에서 열어 편집하는 HML 파일로 저장합니다. PDF는 한글에서 변환할 수 있습니다.
                        </p>
                    </div>

                    <div>
                        <label className="block text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
                            <LayoutGrid size={16} className="text-brand-500" />
                            열당 문제 수
                        </label>
                        <div className="flex gap-2">
                            {[1, 2, 3].map((n) => (
                                <button
                                    key={n}
                                    type="button" aria-pressed={questionsPerColumn === n}
                                    onClick={() => {setQuestionsPerColumn(n);onDraftChange?.(title,n);}}
                                    className={`flex-1 py-3 px-4 rounded-xl font-bold text-sm border-2 transition-all ${
                                        questionsPerColumn === n
                                            ? 'border-brand-500 bg-brand-50 text-brand-700 shadow-sm'
                                            : 'border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-50'
                                    }`}
                                >
                                    {n}문제
                                </button>
                            ))}
                        </div>
                        <p className="text-xs text-slate-500 mt-2">
                            한 열(단)에 배치할 문제 수를 선택하세요.
                        </p>
                    </div>

                    <div className="flex gap-3 pt-2">
                        <button
                            type="button"
                            aria-label="시험지 설정 닫기" onClick={onClose}
                            disabled={isGenerating}
                            className="flex-1 py-3 px-4 border border-slate-300 rounded-xl font-bold text-slate-600 hover:bg-slate-50 transition-colors"
                        >
                            취소
                        </button>
                        <button
                            type="submit"
                            disabled={!title.trim() || isGenerating}
                            className="flex-1 py-3 px-4 bg-brand-600 text-white rounded-xl font-bold hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-all active:scale-[0.98]"
                        >
                            {isGenerating ? '생성 중...' : '시험지 생성하기'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
