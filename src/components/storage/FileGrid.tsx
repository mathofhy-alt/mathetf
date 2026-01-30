'use client';

import React from 'react';
import { Folder as FolderIcon, FileText, Database, MoreVertical, Trash2, Edit2 } from 'lucide-react';
import type { Folder as FolderType, UserItem } from '@/types/storage';
import { DbFileIcon } from '@/components/FileIcons';

interface FileGridProps {
    folders: FolderType[];
    items: UserItem[];
    onFolderClick: (folder: FolderType) => void;
    onItemClick: (item: UserItem) => void;
    onRename: (type: 'folder' | 'item', id: string, name: string) => void;
    onDelete: (type: 'folder' | 'item', id: string) => void;
    onContextMenu: (e: React.MouseEvent, type: 'folder' | 'item', id: string) => void;
    onMoveItem: (itemId: string, targetFolderId: string | null) => void; // DnD
}

export default function FileGrid({ folders, items, onFolderClick, onItemClick, onDelete, onContextMenu, onMoveItem }: FileGridProps) {

    const handleDragStart = (e: React.DragEvent, type: 'folder' | 'item', id: string) => {
        e.dataTransfer.setData('application/json', JSON.stringify({ type, id }));
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDropOnFolder = (e: React.DragEvent, targetFolderId: string) => {
        e.preventDefault();
        try {
            const data = JSON.parse(e.dataTransfer.getData('application/json'));
            if (data.type === 'item') {
                onMoveItem(data.id, targetFolderId);
            }
            // Optional: Move folder into folder (nested) - Not implemented in API yet for Items only? API supports folders too.
            // For safety, let's only allow moving Items for now as requested.
        } catch (err) {
            console.error(err);
        }
    };


    if (folders.length === 0 && items.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-64 text-slate-400">
                <FolderIcon size={48} className="mb-4 opacity-20" />
                <p>폴더가 비어있습니다.</p>
            </div>
        );
    }

    return (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4 p-4">
            {/* Render Folders */}
            {folders.map(folder => (
                <div
                    key={folder.id}
                    className="group relative flex flex-col items-center p-4 bg-white border border-slate-200 rounded-xl hover:bg-blue-50 hover:border-blue-200 cursor-pointer transition-all shadow-sm hover:shadow-md"
                    onClick={() => onFolderClick(folder)}
                    onContextMenu={(e) => {
                        e.preventDefault();
                        onContextMenu(e, 'folder', folder.id);
                    }}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => handleDropOnFolder(e, folder.id)}
                >
                    <FolderIcon size={48} className="text-yellow-400 fill-yellow-100 mb-2 group-hover:scale-110 transition-transform" />
                    <span className="text-xs text-center font-medium text-slate-700 truncate w-full px-2 select-none">
                        {folder.name}
                    </span>
                    {/* Hover Actions deleted (moved to context menu) or keep for quick access? Keep for now but Context is primary */}
                </div>
            ))}

            {/* Render Items */}
            {items.map(item => (
                <div
                    key={item.id}
                    className="group relative flex flex-col items-center p-4 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 hover:border-brand-200 cursor-pointer transition-all shadow-sm hover:shadow-md"
                    onClick={() => onItemClick(item)}
                    onContextMenu={(e) => {
                        e.preventDefault();
                        onContextMenu(e, 'item', item.id);
                    }}
                    draggable
                    onDragStart={(e) => handleDragStart(e, 'item', item.id)}
                >
                    <div className="mb-2 group-hover:scale-110 transition-transform">
                        {item.type === 'personal_db' ? (
                            <DbFileIcon size={40} className="drop-shadow-sm" />
                        ) : (
                            <FileText size={40} className="text-slate-400" />
                        )}
                    </div>

                    <span className="text-xs text-center font-medium text-slate-700 line-clamp-2 w-full px-1 break-keep min-h-[2.5em] flex items-center justify-center">
                        {item.name || '이름 없음'}
                    </span>
                </div>
            ))}
        </div>
    );
}
