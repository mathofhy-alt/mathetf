'use client';

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Edit2, Trash2, FolderInput, FolderPlus, ClipboardPaste, Scissors, Download } from 'lucide-react';

interface ContextMenuProps {
    x: number;
    y: number;
    type: 'folder' | 'item' | 'background';
    clipboardHasData?: boolean;
    /** 이름 바꾸기·옮기기·삭제를 보여 줄지(가상·내신기출 폴더는 false) */
    canEdit?: boolean;
    canDownload?: boolean;
    onClose: () => void;
    onRename?: () => void;
    onDelete?: () => void;
    onDownload?: () => void;
    onCreateFolder?: () => void;
    onMove?: () => void;
    onCut?: () => void;
    onPaste?: () => void;
}

const Row = ({ icon, label, onClick, danger, disabled }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean; disabled?: boolean }) => (
    <button role="menuitem" disabled={disabled} onClick={onClick}
        className={`w-full text-left px-4 py-2.5 sm:py-2 flex items-center gap-3 font-medium ${disabled ? 'text-slate-300 cursor-not-allowed' : danger ? 'text-red-600 hover:bg-red-50' : 'text-slate-700 hover:bg-slate-50'}`}>
        {icon} {label}
    </button>
);

export default function StorageContextMenu({ x, y, type, clipboardHasData, canEdit = true, canDownload = true, onClose, onRename, onDelete, onCreateFolder, onMove, onCut, onPaste, onDownload }: ContextMenuProps) {
    const ref = useRef<HTMLDivElement>(null);
    const [pos, setPos] = useState({ top: y, left: x });

    // 화면 밖으로 나가지 않게(휴대폰에서 「⋯」가 오른쪽 끝에 있어 메뉴가 잘렸다)
    useLayoutEffect(() => {
        const el = ref.current; if (!el) return;
        const r = el.getBoundingClientRect();
        setPos({ left: Math.max(8, Math.min(x - (x + r.width > window.innerWidth - 8 ? r.width : 0), window.innerWidth - r.width - 8)),
            top: Math.max(8, Math.min(y, window.innerHeight - r.height - 8)) });
    }, [x, y]);

    useEffect(() => {
        const handleClick = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
        const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
        document.addEventListener('mousedown', handleClick);
        document.addEventListener('keydown', handleKey, true);
        return () => { document.removeEventListener('mousedown', handleClick); document.removeEventListener('keydown', handleKey, true); };
    }, [onClose]);

    const run = (fn?: () => void) => () => { fn?.(); onClose(); };
    const hasEdit = type !== 'background' && canEdit;
    if (type !== 'background' && !hasEdit && !(type === 'item' && canDownload)) return null;

    return (
        <div ref={ref} role="menu" className="fixed z-[60] bg-white border border-slate-200 rounded-xl shadow-xl py-1.5 w-52 text-sm" style={pos} onClick={(e) => e.stopPropagation()}>
            {type === 'background' && canEdit && (
                <>
                    <Row icon={<FolderPlus size={16} className="text-slate-400" />} label="새 폴더 만들기" onClick={run(onCreateFolder)} />
                    <div className="border-t my-1 border-slate-100"></div>
                    <Row icon={<ClipboardPaste size={16} className={clipboardHasData ? 'text-slate-400' : 'text-slate-200'} />} label="여기에 붙여넣기" disabled={!clipboardHasData} onClick={run(clipboardHasData ? onPaste : undefined)} />
                </>
            )}

            {type !== 'background' && (
                <>
                    {type === 'item' && canDownload && <Row icon={<Download size={16} className="text-slate-400" />} label="다운로드" onClick={run(onDownload)} />}
                    {hasEdit && (
                        <>
                            <Row icon={<FolderInput size={16} className="text-slate-400" />} label="다른 폴더로 이동…" onClick={run(onMove)} />
                            <Row icon={<Scissors size={16} className="text-slate-400" />} label="잘라내기" onClick={run(onCut)} />
                            <Row icon={<Edit2 size={16} className="text-slate-400" />} label="이름 바꾸기" onClick={run(onRename)} />
                            <div className="border-t my-1 border-slate-100"></div>
                            <Row icon={<Trash2 size={16} className="text-red-400" />} label="삭제" danger onClick={run(onDelete)} />
                        </>
                    )}
                </>
            )}
        </div>
    );
}
