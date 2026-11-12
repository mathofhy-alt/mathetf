'use client';

// [11/12 대표] 「다른 폴더로 이동」 창 — 휴대폰에선 끌기가 안 돼서 폴더 목록에서 골라 옮긴다(PC 에서도 같은 메뉴).
import React, { useMemo, useState } from 'react';
import { Folder as FolderIcon, FolderInput, FolderPlus, X, Check } from 'lucide-react';
import type { Folder } from '@/types/storage';

interface Props {
    folders: Folder[];                 // 사용자가 만든 폴더만
    title: string;
    disabledIds: Set<string>;          // 옮길 수 없는 곳(폴더 자신·그 하위)
    currentId: string | null;          // 지금 있는 곳 — 표시만
    onClose: () => void;
    onPick: (folderId: string | null) => void;
    onCreateFolder: (name: string, parentId: string | null) => Promise<void>;
}

export default function MoveToFolderModal({ folders, title, disabledIds, currentId, onClose, onPick, onCreateFolder }: Props) {
    const [picked, setPicked] = useState<string | null | undefined>(undefined);
    const [newName, setNewName] = useState<string | null>(null);

    // 나무를 들여쓰기 목록으로 펼친다
    const rows = useMemo(() => {
        const out: { f: Folder; depth: number }[] = [];
        const kids = (pid: string | null) => folders.filter(f => (f.parent_id ?? null) === pid).sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko', { numeric: true }));
        const walk = (pid: string | null, depth: number) => { for (const f of kids(pid)) { out.push({ f, depth }); walk(f.id, depth + 1); } };
        walk(null, 1);
        return out;
    }, [folders]);

    const Row = ({ id, name, depth }: { id: string | null; name: string; depth: number }) => {
        const off = id !== null && disabledIds.has(id);
        const on = picked === id;
        return (
            <button type="button" disabled={off} onClick={() => setPicked(id)} aria-pressed={on}
                className={`w-full flex items-center gap-2 rounded-lg py-2.5 pr-3 text-left text-sm ${off ? 'text-slate-300 cursor-not-allowed' : on ? 'bg-[#D9F0EE] text-[#166B68] font-bold' : 'text-slate-700 hover:bg-slate-50'}`}
                style={{ paddingLeft: depth * 16 + 8 }}>
                <FolderIcon size={16} className={on ? 'text-[#1B7E7A] fill-[#BFE5E2]' : 'text-slate-400'} />
                <span className="truncate flex-1">{name}</span>
                {id === currentId && <span className="text-[11px] text-slate-400 font-medium">지금 위치</span>}
                {on && <Check size={16} className="text-[#1B7E7A]" />}
            </button>
        );
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4" onClick={onClose}>
            <div role="dialog" aria-modal="true" aria-label={title} className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[80dvh]" onClick={(e) => e.stopPropagation()}>
                <div className="p-4 border-b flex justify-between items-center">
                    <h3 className="font-bold text-slate-800 flex items-center gap-2"><FolderInput size={18} className="text-[#1B7E7A]" /> {title}</h3>
                    <button onClick={onClose} aria-label="닫기" className="p-1.5 hover:bg-slate-100 rounded-full text-slate-400"><X size={18} /></button>
                </div>
                <div className="flex-1 overflow-y-auto p-2">
                    <Row id={null} name="내 보관함 (맨 바깥)" depth={0} />
                    {rows.map(({ f, depth }) => <Row key={f.id} id={f.id} name={f.name} depth={depth} />)}
                    {rows.length === 0 && <p className="px-3 py-4 text-sm text-slate-500">아직 만든 폴더가 없어요. 아래에서 새 폴더를 만들어 바로 옮길 수 있어요.</p>}
                </div>
                <div className="p-3 border-t space-y-2">
                    {newName === null ? (
                        <button type="button" onClick={() => setNewName('')} className="w-full flex items-center justify-center gap-2 rounded-xl border border-dashed border-[#BFE5E2] py-2.5 text-sm font-bold text-[#1B7E7A] hover:bg-[#E8F6F5]">
                            <FolderPlus size={16} /> {picked ? '고른 폴더 안에 새 폴더' : '새 폴더 만들기'}
                        </button>
                    ) : (
                        <form className="flex gap-2" onSubmit={async (e) => { e.preventDefault(); const n = newName.trim(); if (!n) return; setNewName(null); await onCreateFolder(n, picked ?? null); }}>
                            <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="새 폴더 이름" className="rd-input flex-1" style={{ minHeight: 44 }} />
                            <button type="submit" disabled={!newName.trim()} className="rd-btn rd-btn-tint">만들기</button>
                        </form>
                    )}
                    <div className="flex gap-2">
                        <button type="button" onClick={onClose} className="flex-1 rd-btn rd-btn-gray">취소</button>
                        <button type="button" disabled={picked === undefined || picked === currentId} onClick={() => onPick(picked ?? null)} className="flex-1 rd-btn rd-btn-primary">여기로 옮기기</button>
                    </div>
                </div>
            </div>
        </div>
    );
}
