'use client';

import React from 'react';
import { Folder as FolderIcon, FileText, Database, MoreVertical, Trash2, Edit2, CheckCircle2, DownloadCloud } from 'lucide-react';
import type { Folder as FolderType, UserItem } from '@/types/storage';
import { DbFileIcon } from '@/components/FileIcons';

interface FileGridProps {
    folders: FolderType[];
    items: UserItem[];
    onFolderClick: (folder: FolderType) => void;
    onItemClick: (item: UserItem) => void;
    onRename: (type: 'folder' | 'item', id: string, name: string) => void;
    onDelete: (type: 'folder' | 'item', id: string) => void;
    onDownload?: (type: 'folder' | 'item', id: string) => void;
    onContextMenu: (e: React.MouseEvent, type: 'folder' | 'item', id: string) => void;
    onMoveItem: (itemId: string, targetFolderId: string | null) => void; // DnD
    selectedIds?: string[];
}

const formatDate = (dateStr?: string) => {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '-';
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hours = d.getHours();
    const ampm = hours >= 12 ? '오후' : '오전';
    const h = hours % 12 || 12;
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd} ${ampm} ${h}:${min}`;
};

export default function FileGrid({ folders, items, onFolderClick, onItemClick, onDelete, onDownload, onContextMenu, onMoveItem, selectedIds = [] }: FileGridProps) {

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
        <div className="flex flex-col w-full bg-white select-none">
            {/* Table Header */}
            <div className="grid grid-cols-12 gap-4 px-4 py-2 border-b border-slate-200 text-xs font-bold text-slate-500 bg-slate-50 sticky top-0 z-10">
                <div className="col-span-7 sm:col-span-8">이름</div>
                <div className="col-span-3 sm:col-span-2 text-center text-slate-400 font-medium">수정한 날짜</div>
                <div className="col-span-2 text-center text-slate-400 font-medium">유형</div>
            </div>

            <div className="flex flex-col">
                {/* Render Folders */}
                {folders.map(folder => (
                    <div
                        key={folder.id}
                        className="group relative grid grid-cols-12 gap-4 px-4 py-1.5 items-center border-b border-slate-100 hover:bg-blue-50 cursor-pointer transition-colors"
                        onClick={() => onFolderClick(folder)}
                        onContextMenu={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onContextMenu(e, 'folder', folder.id);
                        }}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => handleDropOnFolder(e, folder.id)}
                    >
                        <div className="col-span-7 sm:col-span-8 flex items-center min-w-0 pr-2">
                            <FolderIcon size={18} className="text-yellow-400 fill-yellow-100 flex-shrink-0 mr-2" />
                            <span className="text-sm text-slate-700 truncate min-w-0 flex-1">
                                {folder.name}
                            </span>
                        </div>
                        <div className="col-span-3 sm:col-span-2 text-xs text-slate-500 text-center truncate font-mono tracking-tight">
                            {formatDate(folder.created_at)}
                        </div>
                        <div className="col-span-2 text-xs text-slate-500 text-center truncate">
                            파일 폴더
                        </div>
                    </div>
                ))}

                {/* Render Items */}
                {items.map(item => {
                    const isSelected = selectedIds.includes(item.id) || (item.reference_id && selectedIds.includes(item.reference_id));
                    return (
                        <div
                            key={item.id}
                            className={`group relative grid grid-cols-12 gap-4 px-4 py-1.5 items-center border-b border-slate-100 cursor-pointer transition-colors
                                ${isSelected ? 'bg-indigo-50 hover:bg-indigo-100' : 'bg-white hover:bg-slate-50'}
                            `}
                            onClick={() => onItemClick(item)}
                            onContextMenu={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                onContextMenu(e, 'item', item.id);
                            }}
                            draggable
                            onDragStart={(e) => handleDragStart(e, 'item', item.id)}
                        >
                            {isSelected && (
                                <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-indigo-500"></div>
                            )}
                            <div className="col-span-7 sm:col-span-8 flex items-center min-w-0 pr-2">
                                {item.type === 'personal_db' ? (
                                    <DbFileIcon size={18} className="drop-shadow-sm flex-shrink-0 mr-2" />
                                ) : (
                                    <FileText size={18} className="text-blue-500 flex-shrink-0 mr-2" />
                                )}
                                <span className={`text-sm truncate min-w-0 flex-1 ${isSelected ? 'font-semibold text-indigo-900' : 'text-slate-700'}`}>
                                    {item.name || '이름 없음'}
                                </span>

                                {isSelected && (
                                    <div className="ml-2 text-indigo-600">
                                        <CheckCircle2 size={16} className="fill-indigo-100 border-white rounded-full" />
                                    </div>
                                )}
                            </div>
                            
                            <div className="col-span-3 sm:col-span-2 text-xs text-slate-500 text-center truncate font-mono tracking-tight">
                                {formatDate(item.created_at)}
                            </div>
                            <div className="col-span-2 text-xs text-slate-500 text-center truncate">
                                {item.type === 'personal_db' ? '개인DB' : '시험지'}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
