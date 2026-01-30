'use client';

import React, { useState } from 'react';
import { Folder, ChevronRight, ChevronDown } from 'lucide-react';
import type { Folder as FolderType } from '@/types/storage';

interface FolderTreeProps {
    folders: FolderType[];
    currentFolderId: string | null; // null represents Root
    onFolderSelect: (folderId: string | null) => void;
    onMoveItem?: (itemId: string, targetFolderId: string | null) => void; // DnD Optional
}

const FolderTreeItem = ({ folder, allFolders, currentFolderId, onSelect, onMoveItem, depth = 0 }: any) => {
    const [isOpen, setIsOpen] = useState(false);
    const subFolders = allFolders.filter((f: any) => f.parent_id === folder.id);
    const hasChildren = subFolders.length > 0;
    const isSelected = currentFolderId === folder.id;

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
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
                className={`flex items-center gap-1 py-1 px-2 rounded cursor-pointer transition-colors ${isSelected ? 'bg-blue-100 text-blue-700 font-medium' : 'hover:bg-slate-100 text-slate-700'}`}
                style={{ paddingLeft: `${depth * 16 + 8}px` }}
                onClick={(e) => {
                    e.stopPropagation();
                    onSelect(folder.id);
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

                <Folder size={16} className={isSelected ? 'fill-blue-200 text-blue-600' : 'text-slate-400 group-hover:text-slate-500'} />
                <span className="text-sm truncate">{folder.name}</span>
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
                            depth={depth + 1}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

export default function FolderTree({ folders, currentFolderId, onFolderSelect, onMoveItem }: FolderTreeProps) {
    // Root level folders (parent_id is null)
    const rootFolders = folders.filter(f => f.parent_id === null);

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
        <div className="py-2">
            <div
                className={`flex items-center gap-2 py-1 px-2 rounded cursor-pointer mb-1 ${currentFolderId === null ? 'bg-blue-100 text-blue-700 font-medium' : 'hover:bg-slate-100 text-slate-700'}`}
                onClick={() => onFolderSelect(null)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDropOnRoot}
            >
                <Folder size={16} className={currentFolderId === null ? 'fill-blue-200 text-blue-600' : 'text-slate-400'} />
                <span className="text-sm">내 보관함 (Root)</span>
            </div>

            {rootFolders.map(folder => (
                <FolderTreeItem
                    key={folder.id}
                    folder={folder}
                    allFolders={folders}
                    currentFolderId={currentFolderId}
                    onSelect={onFolderSelect}
                    onMoveItem={onMoveItem}
                />
            ))}
        </div>
    );
}
