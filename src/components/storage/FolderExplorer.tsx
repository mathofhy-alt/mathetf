'use client';

import React, { useEffect, useState } from 'react';
import { FolderPlus, RefreshCw, Loader2, Home, DownloadCloud, CheckSquare } from 'lucide-react';
import FolderTree from './FolderTree';
import FileGrid from './FileGrid';
import StorageContextMenu from './StorageContextMenu';
import type { Folder, UserItem } from '@/types/storage';

interface FolderExplorerProps {
    onItemSelect: (item: UserItem) => void;
    onSelectAll?: (items: UserItem[]) => void;
    selectedIds?: string[];
}

export default function FolderExplorer({ onItemSelect, onSelectAll, selectedIds = [] }: FolderExplorerProps) {
    const [allFolders, setAllFolders] = useState<Folder[]>([]);
    const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
    const [viewFolders, setViewFolders] = useState<Folder[]>([]);
    const [viewItems, setViewItems] = useState<UserItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    const [contextMenu, setContextMenu] = useState<{ x: number, y: number, type: 'folder' | 'item', id: string } | null>(null);

    // Initial Load: Fetch All Folders for Tree
    useEffect(() => {
        fetch('/api/storage/folders?mode=all')
            .then(res => res.json())
            .then(data => {
                if (data.folders) setAllFolders(data.folders);
            });
    }, [refreshTrigger]);

    // View Fetch: Fetch content for current folder
    useEffect(() => {
        setLoading(true);
        const pid = currentFolderId === null ? 'root' : currentFolderId;
        fetch(`/api/storage/folders?parentId=${pid}`)
            .then(res => res.json())
            .then(data => {
                if (data.folders) setViewFolders(data.folders);
                if (data.items) setViewItems(data.items);
                setLoading(false);
            });
    }, [currentFolderId, refreshTrigger]);

    const handleCreateFolder = async () => {
        const name = prompt('새 폴더 이름:');
        if (!name) return;

        await fetch('/api/storage/folders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, parentId: currentFolderId === null ? 'root' : currentFolderId })
        });
        setRefreshTrigger(p => p + 1);
    };

    const handleRename = async () => {
        if (!contextMenu) return;
        const { type, id } = contextMenu;

        // Find current name logic...
        let currentName = '';
        if (type === 'folder') currentName = allFolders.find(f => f.id === id)?.name || '';
        else currentName = viewItems.find(i => i.id === id)?.name || '';

        const newName = prompt('새 이름 입력:', currentName);
        if (!newName || newName === currentName) return;

        const endpoint = type === 'folder' ? '/api/storage/folders' : '/api/storage/items';
        await fetch(endpoint, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, name: newName })
        });
        setRefreshTrigger(p => p + 1);
    };

    const handleMoveItem = async (itemId: string, targetFolderId: string | null) => {
        await fetch('/api/storage/items', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: itemId, folderId: targetFolderId === null ? 'root' : targetFolderId })
        });
        setRefreshTrigger(p => p + 1);
    };

    const handleDelete = async (type: 'folder' | 'item', id: string) => {
        // Redefined to be context menu aware if needed, or keeping explicit args
        // If called from ContextMenu, usually we pass args.
        // Let's make a wrapper for ContextMenu to call this.
        let endpoint = type === 'folder' ? `/api/storage/folders` : `/api/storage/items`;
        // For items, use query param id? See API implementation.
        // items DELETE uses ?id=
        // folders DELETE uses ?id=
        await fetch(`${endpoint}?id=${id}`, { method: 'DELETE' });
        setRefreshTrigger(p => p + 1);
    };

    const handleDeleteFromContext = () => {
        if (!contextMenu) return;
        if (confirm('정말 삭제하시겠습니까?')) {
            handleDelete(contextMenu.type, contextMenu.id);
        }
    };

    const handleDownload = () => {
        if (!contextMenu || contextMenu.type !== 'item') return;
        // Trigger download via API
        window.location.href = `/api/storage/download?id=${contextMenu.id}`;
    };


    const handleSync = async () => {
        if (!confirm('구매한 DB 목록을 보관함으로 가져오시겠습니까? (새로 구매한 항목만 추가됩니다)')) return;
        setLoading(true);
        try {
            const res = await fetch('/api/storage/sync', { method: 'POST' });
            const data = await res.json();
            if (data.count >= 0) {
                alert(`${data.count}개의 새로운 DB를 보관함으로 가져왔습니다.`);
                setRefreshTrigger(p => p + 1);
            } else {
                alert('동기화 중 오류가 발생했습니다.');
            }
        } catch (e) {
            alert('동기화 실패');
        } finally {
            setLoading(false);
        }
    };

    // Breadcrumb helper
    const getBreadcrumbs = () => {
        if (currentFolderId === null) return [{ id: null, name: '내 보관함' }];
        const path: { id: string | null, name: string }[] = [];
        let curr: Folder | undefined = allFolders.find(f => f.id === currentFolderId);
        while (curr) {
            path.unshift({ id: curr.id, name: curr.name });
            if (!curr.parent_id) break; // Optimization
            // Need to capture parent_id because curr changes
            const pid = curr.parent_id;
            curr = allFolders.find(f => f.id === pid);
        }
        path.unshift({ id: null, name: '내 보관함' });
        return path;
    };

    return (
        <div className="flex h-full border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm">
            {/* Sidebar: Tree */}
            <div className="w-64 bg-slate-50 border-r border-slate-200 flex flex-col">
                <div className="p-3 border-b flex items-center justify-between bg-slate-100">
                    <span className="font-bold text-slate-700 text-sm">탐색기</span>
                    <button onClick={() => setRefreshTrigger(p => p + 1)} className="text-slate-400 hover:text-blue-600">
                        <RefreshCw size={14} />
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto p-2">
                    <FolderTree
                        folders={allFolders}
                        currentFolderId={currentFolderId}
                        onFolderSelect={setCurrentFolderId}
                        onMoveItem={handleMoveItem}
                    />
                </div>
            </div>

            {/* Main Content: Grid */}
            <div className="flex-1 flex flex-col">
                {/* Toolbar / Breadcrumb */}
                <div className="h-12 border-b flex items-center px-4 justify-between bg-white">
                    <div className="flex items-center gap-1 text-sm text-slate-600">
                        {getBreadcrumbs().map((crumb, idx) => (
                            <React.Fragment key={crumb.id || 'root'}>
                                {idx > 0 && <span className="text-slate-300">/</span>}
                                <button
                                    className={`hover:text-blue-600 ${crumb.id === currentFolderId ? 'font-bold text-slate-900' : ''}`}
                                    onClick={() => setCurrentFolderId(crumb.id)}
                                >
                                    {crumb.name}
                                </button>
                            </React.Fragment>
                        ))}
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleSync}
                            className="flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 text-sm font-medium transition-colors"
                            title="구매한 개인DB 불러오기"
                        >
                            <DownloadCloud size={16} /> 가져오기
                        </button>
                        <button
                            onClick={handleCreateFolder}
                            className="flex items-center gap-1 px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 text-sm font-medium transition-colors"
                        >
                            <FolderPlus size={16} /> 새 폴더
                        </button>
                        {onSelectAll && (
                            <button
                                onClick={() => {
                                    const dbItems = viewItems.filter(i => i.type === 'personal_db');
                                    if (dbItems.length > 0) onSelectAll(dbItems);
                                }}
                                className="flex items-center gap-1 px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 text-sm font-medium transition-colors"
                            >
                                <CheckSquare size={16} /> 전체 선택
                            </button>
                        )}
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto bg-slate-50/30 relative"
                    onClick={() => setContextMenu(null)}
                    onContextMenu={(e) => {
                        e.preventDefault();
                        setContextMenu(null);
                    }}
                >
                    {loading && (
                        <div className="absolute inset-0 bg-white/50 z-10 flex items-center justify-center">
                            <Loader2 className="animate-spin text-blue-600" />
                        </div>
                    )}
                    <FileGrid
                        folders={viewFolders}
                        items={viewItems}
                        onFolderClick={(f) => setCurrentFolderId(f.id)}
                        onItemClick={onItemSelect}
                        onRename={(t, i, n) => { /* unused */ }}
                        onDelete={handleDelete}
                        onContextMenu={(e, type, id) => {
                            setContextMenu({ x: e.clientX, y: e.clientY, type, id });
                        }}
                        onMoveItem={handleMoveItem}
                        selectedIds={selectedIds}
                    />
                </div>
            </div>

            {contextMenu && (
                <StorageContextMenu
                    x={contextMenu.x}
                    y={contextMenu.y}
                    type={contextMenu.type}
                    onClose={() => setContextMenu(null)}
                    onRename={handleRename}
                    onDelete={handleDeleteFromContext}
                    onDownload={handleDownload}
                />
            )}
        </div>
    );
}
