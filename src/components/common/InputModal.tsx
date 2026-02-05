'use client';

import React, { useState, useEffect } from 'react';
import { X, Edit2, FolderPlus } from 'lucide-react';

interface InputModalProps {
    title: string;
    label: string;
    description?: string;
    initialValue?: string;
    placeholder?: string;
    confirmLabel?: string;
    onClose: () => void;
    onConfirm: (value: string) => void;
    icon?: 'folder' | 'edit';
}

export default function InputModal({
    title,
    label,
    description,
    initialValue = '',
    placeholder = '',
    confirmLabel = '확인',
    onClose,
    onConfirm,
    icon = 'edit'
}: InputModalProps) {
    const [value, setValue] = useState(initialValue);

    useEffect(() => {
        setValue(initialValue);
    }, [initialValue]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!value.trim()) return;
        onConfirm(value.trim());
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in duration-200">
                <div className="p-4 border-b flex justify-between items-center bg-slate-50">
                    <h3 className="font-bold text-slate-800 flex items-center gap-2">
                        {icon === 'folder' ? <FolderPlus size={18} className="text-indigo-600" /> : <Edit2 size={18} className="text-indigo-600" />}
                        {title}
                    </h3>
                    <button onClick={onClose} className="p-1.5 hover:bg-slate-200 rounded-full transition-colors text-slate-400">
                        <X size={18} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    <div>
                        <label className="block text-sm font-bold text-slate-700 mb-2">
                            {label}
                        </label>
                        <input
                            type="text"
                            value={value}
                            onChange={(e) => setValue(e.target.value)}
                            placeholder={placeholder}
                            className="w-full p-3 border rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-slate-800 font-medium bg-slate-50"
                            autoFocus
                        />
                        {description && (
                            <p className="text-xs text-slate-500 mt-2">
                                {description}
                            </p>
                        )}
                    </div>

                    <div className="flex gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 py-3 px-4 border border-slate-300 rounded-xl font-bold text-slate-600 hover:bg-slate-50 transition-colors"
                        >
                            취소
                        </button>
                        <button
                            type="submit"
                            disabled={!value.trim()}
                            className="flex-1 py-3 px-4 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-indigo-100 transition-all active:scale-[0.98]"
                        >
                            {confirmLabel}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
