'use client';

import React, { useEffect, useRef } from 'react';
import { Edit2, Trash2, FolderInput, FolderPlus, ClipboardPaste, Scissors } from 'lucide-react';

interface ContextMenuProps {
    x: number;
    y: number;
    type: 'folder' | 'item' | 'background';
    clipboardHasData?: boolean;
    onClose: () => void;
    onRename?: () => void;
    onDelete?: () => void;
    onDownload?: () => void;
    onCreateFolder?: () => void;
    onCut?: () => void;
    onPaste?: () => void;
}

export default function StorageContextMenu({ x, y, type, clipboardHasData, onClose, onRename, onDelete, onCreateFolder, onCut, onPaste, onDownload }: ContextMenuProps) {
    const ref = useRef<HTMLDivElement>(null);

    // Click outside to close
    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                onClose();
            }
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [onClose]);

    return (
        <div
            ref={ref}
            className="fixed z-50 bg-white border border-slate-200 rounded-lg shadow-xl py-1.5 w-48 text-sm"
            style={{ top: y, left: x }}
            onClick={(e) => e.stopPropagation()}
        >
            {type === 'background' && (
                <>
                    <button
                        className="w-full text-left px-4 py-2 hover:bg-slate-50 flex items-center gap-3 text-slate-700 font-medium"
                        onClick={() => {
                            onCreateFolder?.();
                            onClose();
                        }}
                    >
                        <FolderPlus size={16} className="text-slate-400" /> 새 폴더 만들기
                    </button>
                    <div className="border-t my-1 border-slate-100"></div>
                    <button
                        className={`w-full text-left px-4 py-2 flex items-center gap-3 font-medium ${clipboardHasData ? 'hover:bg-slate-50 text-slate-700' : 'text-slate-300 cursor-not-allowed'}`}
                        disabled={!clipboardHasData}
                        onClick={() => {
                            if (clipboardHasData) onPaste?.();
                            onClose();
                        }}
                    >
                        <ClipboardPaste size={16} className={clipboardHasData ? "text-slate-400" : "text-slate-200"} /> 붙여넣기
                    </button>
                </>
            )}

            {(type === 'folder' || type === 'item') && (
                <>
                    {type === 'item' && (
                        <button
                            className="w-full text-left px-4 py-2 hover:bg-slate-50 flex items-center gap-3 text-slate-700 font-medium"
                            onClick={() => {
                                onDownload?.();
                                onClose();
                            }}
                        >
                            <FolderInput size={16} className="rotate-180 text-blue-500" /> 다운로드
                        </button>
                    )}
                    <button
                        className="w-full text-left px-4 py-2 hover:bg-slate-50 flex items-center gap-3 text-slate-700 font-medium"
                        onClick={() => {
                            onCut?.();
                            onClose();
                        }}
                    >
                        <Scissors size={16} className="text-slate-400" /> 잘라내기
                    </button>
                    <button
                        className="w-full text-left px-4 py-2 hover:bg-slate-50 flex items-center gap-3 text-slate-700 font-medium"
                        onClick={() => {
                            onRename?.();
                            onClose();
                        }}
                    >
                        <Edit2 size={16} className="text-slate-400" /> 이름 변경
                    </button>
                    <div className="border-t my-1 border-slate-100"></div>
                    <button
                        className="w-full text-left px-4 py-2 hover:bg-red-50 flex items-center gap-3 text-red-600 font-medium"
                        onClick={() => {
                            onDelete?.();
                            onClose();
                        }}
                    >
                        <Trash2 size={16} className="text-red-400" /> 삭제
                    </button>
                </>
            )}
        </div>
    );
}
