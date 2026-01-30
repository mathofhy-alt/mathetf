'use client';

import React, { useEffect, useRef } from 'react';
import { Edit2, Trash2, FolderInput } from 'lucide-react';

interface ContextMenuProps {
    x: number;
    y: number;
    type: 'folder' | 'item';
    onClose: () => void;
    onRename: () => void;
    onDelete: () => void;
    onMove?: () => void; // Optional for future "Move To" dialog
}

export default function StorageContextMenu({ x, y, type, onClose, onRename, onDelete, onMove }: ContextMenuProps) {
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
            className="fixed z-50 bg-white border border-slate-200 rounded-lg shadow-xl py-1 w-48 text-sm"
            style={{ top: y, left: x }}
            onClick={(e) => e.stopPropagation()}
        >
            <button
                className="w-full text-left px-4 py-2 hover:bg-slate-50 flex items-center gap-2 text-slate-700"
                onClick={() => {
                    onRename();
                    onClose();
                }}
            >
                <Edit2 size={14} /> 이름 변경
            </button>
            <button
                className="w-full text-left px-4 py-2 hover:bg-red-50 flex items-center gap-2 text-red-600"
                onClick={() => {
                    onDelete();
                    onClose();
                }}
            >
                <Trash2 size={14} /> 삭제
            </button>
        </div>
    );
}
