'use client';

import React, { useState } from 'react';
import { Folder, ChevronRight, ChevronDown, Database, Trash2, BookOpen } from 'lucide-react';
import type { Folder as FolderType } from '@/types/storage';

interface FolderTreeProps {
    folders: FolderType[];
    currentFolderId: string | null; // null represents Root
    onFolderSelect: (folderId: string | null) => void;
    onMoveItem?: (itemId: string, targetFolderId: string | null) => void;
    onDelete?: (type: 'folder', id: string) => void;
    onContextMenu?: (e: React.MouseEvent, type: 'folder' | 'background', id: string | null) => void;
}

const FolderTreeItem = ({ folder, allFolders, currentFolderId, onSelect, onMoveItem, onDelete, onContextMenu, depth = 0 }: any) => {
    const [isOpen, setIsOpen] = useState(false);
    const subFolders = allFolders.filter((f: any) => f.parent_id === folder.id);
    const hasChildren = subFolders.length > 0;
    const isSelected = currentFolderId === folder.id;

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (folder.id === 'mock-exam-root') return; // Cannot drop into global virtual folder
        try {
            const data = JSON.parse(e.dataTransfer.getData('application/json'));
            if (data.type === 'item' && onMoveItem) {
                onMoveItem(data.id, folder.id);
            }
        } catch (err) {
            console.error(err);
        }
    };

    return (
        <div className="select-none">
            <div
                className={`group flex items-center gap-1 py-1 px-2 rounded cursor-pointer transition-colors ${isSelected ? 'bg-blue-100 text-blue-700 font-medium' : 'hover:bg-slate-100 text-slate-700'}`}
                style={{ paddingLeft: `${depth * 16 + 8}px` }}
                onClick={(e) => {
                    e.stopPropagation();
                    onSelect(folder.id);
                }}
                onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (onContextMenu) onContextMenu(e, 'folder', folder.id);
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
            >
                {/* ... existing icon structure ... */}
                {hasChildren ? (
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            setIsOpen(!isOpen);
                        }}
                        className="p-0.5 hover:bg-slate-200 rounded text-slate-400"
                    >
                        {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>
                ) : (
                    <span className="w-4"></span> // Spacer
                )}

                {(() => {
                    if (folder.id === 'mock-exam-root') {
                        return <BookOpen size={16} className={isSelected ? 'text-orange-600' : 'text-orange-400 group-hover:text-orange-500'} />;
                    }
                    if (folder.name === '구매한 학교 기출') {
                        return <Database size={16} className={isSelected ? 'fill-indigo-200 text-indigo-600' : 'text-indigo-400 group-hover:text-indigo-500'} />;
                    }
                    return <Folder size={16} className={isSelected ? 'fill-blue-200 text-blue-600' : 'text-slate-400 group-hover:text-slate-500'} />;
                })()}
                <span className="text-sm truncate flex-1">{folder.name}</span>

                {onDelete && folder.name !== '구매한 학교 기출' && folder.id !== 'mock-exam-root' && (
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            // 확인창은 onDelete(handleDelete) 내부에서 시험지 포함 여부에 따라 띄움
                            onDelete('folder', folder.id);
                        }}
                        className="p-1 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                        title="폴더 삭제"
                    >
                        <Trash2 size={12} />
                    </button>
                )}
            </div>

            {isOpen && hasChildren && (
                <div>
                    {subFolders.map((sub: any) => (
                        <FolderTreeItem
                            key={sub.id}
                            folder={sub}
                            allFolders={allFolders}
                            currentFolderId={currentFolderId}
                            onSelect={onSelect}
                            onMoveItem={onMoveItem}
                            onDelete={onDelete}
                            onContextMenu={onContextMenu}
                            depth={depth + 1}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

export default function FolderTree({ folders, currentFolderId, onFolderSelect, onMoveItem, onDelete, onContextMenu }: FolderTreeProps) {
    // Root level folders (parent_id is null)
    let rootFolders = folders.filter(f => f.parent_id === null);

    // 순서 고정: 모의고사 → 사관학교·경찰대 → 구매한 학교 기출 → 기타(이름순)
    const rank = (f: any) =>
        f.id === 'mock-exam-root' ? 0
        : (f.id === 'exam-school-root' || f.name === '사관학교·경찰대') ? 1
        : f.name === '구매한 학교 기출' ? 2 : 3;
    rootFolders.sort((a, b) => rank(a) - rank(b) || (a.name || '').localeCompare(b.name || ''));

    const [isRootOpen, setIsRootOpen] = useState(true);

    const handleDropOnRoot = (e: React.DragEvent) => {
        e.preventDefault();
        try {
            const data = JSON.parse(e.dataTransfer.getData('application/json'));
            if (data.type === 'item' && onMoveItem) {
                onMoveItem(data.id, null); // Move to root
            }
        } catch (err) { }
    };

    return (
        <div 
            className="py-2 select-none min-h-full"
            onContextMenu={(e) => {
                e.preventDefault();
                if (onContextMenu) onContextMenu(e, 'background', null);
            }}
        >
            <div
                className={`group flex items-center gap-1 py-1 px-2 rounded cursor-pointer transition-colors ${currentFolderId === null ? 'bg-blue-100 text-blue-700 font-medium' : 'hover:bg-slate-100 text-slate-700'}`}
                onClick={(e) => {
                    e.stopPropagation();
                    onFolderSelect(null);
                }}
                onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    // Root context menu behaves like background since its id is null
                    if (onContextMenu) onContextMenu(e, 'background', null);
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDropOnRoot}
            >
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        setIsRootOpen(!isRootOpen);
                    }}
                    className="p-0.5 hover:bg-slate-200 text-slate-400 rounded transition-colors"
                >
                    {isRootOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
                <Folder size={16} className={currentFolderId === null ? 'fill-blue-200 text-blue-600' : 'text-slate-400'} />
                <span className="text-sm truncate flex-1">내 보관함 (Root)</span>
            </div>

            {isRootOpen && (
                <div>
                    {rootFolders.map(folder => (
                        <FolderTreeItem
                            key={folder.id}
                            folder={folder}
                            allFolders={folders}
                            currentFolderId={currentFolderId}
                            onSelect={onFolderSelect}
                            onMoveItem={onMoveItem}
                            onDelete={onDelete}
                            depth={1}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
