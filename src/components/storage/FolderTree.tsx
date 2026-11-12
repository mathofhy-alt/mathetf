'use client';

import React, { useState } from 'react';
import { Folder, ChevronRight, ChevronDown, Database, Trash2, BookOpen } from 'lucide-react';
import { isNaesinFolder, isVirtualFolder, type Folder as FolderType } from '@/types/storage';

type DragData = { type: 'folder' | 'item', id: string };

interface FolderTreeProps {
    folders: FolderType[];
    currentFolderId: string | null; // null represents Root
    onFolderSelect: (folderId: string | null) => void;
    /** [11/12] 끌어 놓기 — 시험지·폴더를 폴더(또는 맨 바깥 null)로 옮긴다. 없으면 끌기·놓기를 끈다(저장 위치 고르기 창) */
    onDropMove?: (data: DragData, targetFolderId: string | null) => void;
    onDelete?: (type: 'folder', id: string) => void;
    onContextMenu?: (e: React.MouseEvent, type: 'folder' | 'background', id: string | null) => void;
}

const readDrag = (e: React.DragEvent): DragData | null => {
    try { return JSON.parse(e.dataTransfer.getData('application/json')); } catch { return null; }
};
const userFolder = (f: FolderType) => !isNaesinFolder(f.name) && !isVirtualFolder(f) && !f.id.startsWith('tmp-');

const FolderTreeItem = ({ folder, allFolders, currentFolderId, onSelect, onDropMove, onDelete, onContextMenu, depth = 0 }: any) => {
    // 지금 보는 폴더가 이 폴더 아래에 있으면 처음부터 펼쳐 둔다
    const containsCurrent = () => {
        let cur = allFolders.find((f: any) => f.id === currentFolderId);
        while (cur) { if (cur.parent_id === folder.id) return true; cur = allFolders.find((f: any) => f.id === cur.parent_id); }
        return false;
    };
    const [isOpen, setIsOpen] = useState(containsCurrent);
    const [over, setOver] = useState(false);
    const subFolders = allFolders.filter((f: any) => f.parent_id === folder.id)
        .sort((a: any, b: any) => (a.name || '').localeCompare(b.name || '', 'ko', { numeric: true }));
    const hasChildren = subFolders.length > 0;
    const isSelected = currentFolderId === folder.id;
    const editable = userFolder(folder);

    return (
        <div className="select-none">
            <div
                className={`group flex items-center gap-1 py-1 px-2 rounded cursor-pointer transition-colors ${over ? 'bg-[#BFE5E2] ring-2 ring-[#3AADA9]' : isSelected ? 'bg-[#D9F0EE] text-[#166B68] font-medium' : 'hover:bg-slate-100 text-slate-700'}`}
                style={{ paddingLeft: `${depth * 16 + 8}px` }}
                onClick={(e) => { e.stopPropagation(); onSelect(folder.id); }}
                onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); if (onContextMenu) onContextMenu(e, 'folder', folder.id); }}
                draggable={!!onDropMove && editable}
                onDragStart={(e) => { e.stopPropagation(); e.dataTransfer.setData('application/json', JSON.stringify({ type: 'folder', id: folder.id })); e.dataTransfer.effectAllowed = 'move'; }}
                onDragOver={(e) => { if (!onDropMove || !editable) return; e.preventDefault(); setOver(true); }}
                onDragLeave={() => setOver(false)}
                onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setOver(false); const d = readDrag(e); if (d && onDropMove && editable) { onDropMove(d, folder.id); setIsOpen(true); } }}
            >
                {hasChildren ? (
                    <button onClick={(e) => { e.stopPropagation(); setIsOpen(!isOpen); }} aria-label={isOpen ? '접기' : '펼치기'} className="p-0.5 hover:bg-slate-200 rounded text-slate-400">
                        {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>
                ) : (
                    <span className="w-4"></span>
                )}

                {(() => {
                    if (folder.id === 'mock-exam-root') return <BookOpen size={16} className={isSelected ? 'text-orange-600' : 'text-orange-400 group-hover:text-orange-500'} />;
                    if (isNaesinFolder(folder.name)) return <Database size={16} className={isSelected ? 'fill-[#BFE5E2] text-[#1B7E7A]' : 'text-[#6CC3BF] group-hover:text-[#3AADA9]'} />;
                    return <Folder size={16} className={isSelected ? 'fill-blue-200 text-[#1B7E7A]' : 'text-slate-400 group-hover:text-slate-500'} />;
                })()}
                <span className="text-sm truncate flex-1">{folder.name}</span>

                {/* 시스템 가상 폴더(모의고사·사관학교·경찰대)와 내신기출 폴더는 사용자가 만든 게 아니라 지울 수 없다. */}
                {onDelete && editable && (
                    <button onClick={(e) => { e.stopPropagation(); onDelete('folder', folder.id); }}
                        className="p-1 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity" title="폴더 삭제" aria-label={`${folder.name} 폴더 삭제`}>
                        <Trash2 size={12} />
                    </button>
                )}
            </div>

            {isOpen && hasChildren && (
                <div>
                    {subFolders.map((sub: any) => (
                        <FolderTreeItem key={sub.id} folder={sub} allFolders={allFolders} currentFolderId={currentFolderId} onSelect={onSelect}
                            onDropMove={onDropMove} onDelete={onDelete} onContextMenu={onContextMenu} depth={depth + 1} />
                    ))}
                </div>
            )}
        </div>
    );
};

export default function FolderTree({ folders, currentFolderId, onFolderSelect, onDropMove, onDelete, onContextMenu }: FolderTreeProps) {
    // Root level folders (parent_id is null)
    const rootFolders = folders.filter(f => f.parent_id === null);

    // 순서 고정: 모의고사 → 사관학교·경찰대 → 내신기출 → 기타(이름순)
    const rank = (f: any) =>
        f.id === 'mock-exam-root' ? 0
        : (f.id === 'exam-school-root' || f.name === '사관학교·경찰대') ? 1
        : isNaesinFolder(f.name) ? 2 : 3;
    rootFolders.sort((a, b) => rank(a) - rank(b) || (a.name || '').localeCompare(b.name || '', 'ko', { numeric: true }));

    const [isRootOpen, setIsRootOpen] = useState(true);
    const [over, setOver] = useState(false);

    return (
        <div className="py-2 select-none min-h-full" onContextMenu={(e) => { e.preventDefault(); if (onContextMenu) onContextMenu(e, 'background', null); }}>
            <div
                className={`group flex items-center gap-1 py-1 px-2 rounded cursor-pointer transition-colors ${over ? 'bg-[#BFE5E2] ring-2 ring-[#3AADA9]' : currentFolderId === null ? 'bg-[#D9F0EE] text-[#166B68] font-medium' : 'hover:bg-slate-100 text-slate-700'}`}
                onClick={(e) => { e.stopPropagation(); onFolderSelect(null); }}
                onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); if (onContextMenu) onContextMenu(e, 'background', null); }}
                onDragOver={(e) => { if (!onDropMove) return; e.preventDefault(); setOver(true); }}
                onDragLeave={() => setOver(false)}
                onDrop={(e) => { e.preventDefault(); setOver(false); const d = readDrag(e); if (d && onDropMove) onDropMove(d, null); }}
            >
                <button onClick={(e) => { e.stopPropagation(); setIsRootOpen(!isRootOpen); }} aria-label={isRootOpen ? '접기' : '펼치기'} className="p-0.5 hover:bg-slate-200 text-slate-400 rounded transition-colors">
                    {isRootOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
                <Folder size={16} className={currentFolderId === null ? 'fill-blue-200 text-[#1B7E7A]' : 'text-slate-400'} />
                <span className="text-sm truncate flex-1">내 보관함</span>
            </div>

            {isRootOpen && (
                <div>
                    {rootFolders.map(folder => (
                        <FolderTreeItem key={folder.id} folder={folder} allFolders={folders} currentFolderId={currentFolderId} onSelect={onFolderSelect}
                            onDropMove={onDropMove} onDelete={onDelete} onContextMenu={onContextMenu} depth={1} />
                    ))}
                </div>
            )}
        </div>
    );
}
