'use client';

import React, { useState } from 'react';
import { X, FileText } from 'lucide-react';

interface ConfigModalProps {
    onClose: () => void;
    onConfirm: (title: string) => void;
    isGenerating: boolean;
}

export default function ConfigModal({ onClose, onConfirm, isGenerating }: ConfigModalProps) {
    const [title, setTitle] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!title.trim()) return;
        onConfirm(title);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
                <div className="p-4 border-b flex justify-between items-center bg-slate-50">
                    <h3 className="font-bold text-lg flex items-center gap-2 text-slate-800">
                        <FileText className="text-indigo-600" size={20} />
                        시험지 설정
                    </h3>
                    <button
                        onClick={onClose}
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
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="예: 2024년 1학기 중간고사 대비"
                            className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-slate-800 font-medium"
                            autoFocus
                        />
                        <p className="text-xs text-slate-500 mt-2">
                            * 설정한 제목은 파일명으로 사용됩니다.
                        </p>
                    </div>

                    <div className="flex gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={isGenerating}
                            className="flex-1 py-3 px-4 border border-slate-300 rounded-xl font-bold text-slate-600 hover:bg-slate-50 transition-colors"
                        >
                            취소
                        </button>
                        <button
                            type="submit"
                            disabled={!title.trim() || isGenerating}
                            className="flex-1 py-3 px-4 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-indigo-200 transition-all active:scale-[0.98]"
                        >
                            {isGenerating ? '생성 중...' : '시험지 생성하기'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
