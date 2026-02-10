'use client';

import React, { useEffect, useState } from 'react';
import { FolderPlus, RefreshCw, Loader2, DownloadCloud, CheckSquare, Trash2 } from 'lucide-react';
import FolderTree from './FolderTree';
import FileGrid from './FileGrid';
import StorageContextMenu from './StorageContextMenu';
import InputModal from '../common/InputModal';
import type { Folder, UserItem } from '@/types/storage';

interface FolderExplorerProps {
    onItemSelect: (item: UserItem) => void;
    onSelectAll?: (items: UserItem[]) => void;
    selectedIds?: string[];
    filterType?: 'all' | 'db' | 'exam';
    initialData?: any; // [V68] Pre-fetched content
}

export default function FolderExplorer({ onItemSelect, onSelectAll, selectedIds = [], filterType = 'all', initialData }: FolderExplorerProps) {
    const [allFolders, setAllFolders] = useState<Folder[]>(initialData?.folders || []);
    const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
    const [viewFolders, setViewFolders] = useState<Folder[]>(initialData?.folders ? initialData.folders.filter((f: Folder) => !f.parent_id) : []);
    const [viewItems, setViewItems] = useState<UserItem[]>(initialData?.items || []);
    const [loading, setLoading] = useState(false);
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    // [V67] Component Cache for Instant Navigation
    const [contentCache, setContentCache] = useState<Record<string, { folders: Folder[], items: UserItem[] }>>(() => {
        if (initialData?.isUnified) {
            const cacheKey = `root_${filterType}`;
            const rootFolders = initialData.folders.filter((f: Folder) => !f.parent_id);
            return { [cacheKey]: { folders: rootFolders, items: initialData.items } };
        }
        return {};
    });

    const [contextMenu, setContextMenu] = useState<{ x: number, y: number, type: 'folder' | 'item', id: string } | null>(null);
    const [inputModal, setInputModal] = useState<{
        isOpen: boolean;
        title: string;
        label: string;
        initialValue: string;
        icon: 'folder' | 'edit';
        onConfirm: (val: string) => void;
    }>({
        isOpen: false,
        title: '',
        label: '',
        initialValue: '',
        icon: 'edit',
        onConfirm: () => { }
    });

    // Unified Load: Fetch Everything in ONE shot on mount/refresh
    useEffect(() => {
        // If initialData is provided and this is a component mount (not a manual refresh), use it immediately
        if (initialData && refreshTrigger === 0 && allFolders.length === 0) {
            if (initialData.folders) {
                setAllFolders(initialData.folders);
                const rootFolders = initialData.folders.filter((f: Folder) => !f.parent_id);
                setViewFolders(rootFolders);
            }
            if (initialData.items) setViewItems(initialData.items);
            return;
        }

        setLoading(true);
        const typeParam = filterType === 'all' ? '' : `&folderType=${filterType}`;

        // mode=all now returns BOTH tree AND root items
        fetch(`/api/storage/folders?mode=all${typeParam}`)
            .then(res => res.json())
            .then(data => {
                if (data.folders) {
                    setAllFolders(data.folders);
                    // Filter view folders for root (where parent_id is null)
                    const rootFolders = data.folders.filter((f: Folder) => !f.parent_id);
                    setViewFolders(rootFolders);
                }

                if (data.items) {
                    setViewItems(data.items);
                }

                // Initialize Root Cache
                if (data.isUnified) {
                    const cacheKey = `root_${filterType}`;
                    const rootFolders = data.folders.filter((f: Folder) => !f.parent_id);
                    setContentCache(prev => ({
                        ...prev,
                        [cacheKey]: { folders: rootFolders, items: data.items }
                    }));
                } else {
                    setContentCache({});
                }

                setCurrentFolderId(null); // Reset to root on full refresh
                setLoading(false);
            })
            .catch(err => {
                console.error("Unified Load Error:", err);
                setLoading(false);
            });
    }, [refreshTrigger, filterType, initialData]);

    // Sub-Navigation Fetch: Only runs when currentFolderId changes to a NON-null value
    useEffect(() => {
        if (currentFolderId === null) return; // Root handled by Unified Load

        const pid = currentFolderId;
        const cacheKey = `${pid}_${filterType}`;

        if (contentCache[cacheKey]) {
            setViewFolders(contentCache[cacheKey].folders);
            setViewItems(contentCache[cacheKey].items);
            return;
        }

        setLoading(true);
        const typeParam = filterType === 'all' ? '' : `&folderType=${filterType}`;
        fetch(`/api/storage/folders?parentId=${pid}${typeParam}`)
            .then(res => res.json())
            .then(data => {
                const folders = data.folders || [];
                const items = data.items || [];
                setViewFolders(folders);
                setViewItems(items);
                setContentCache(prev => ({ ...prev, [cacheKey]: { folders, items } }));
                setLoading(false);
            })
            .catch(err => {
                console.error("Folder Navigation Error:", err);
                setLoading(false);
            });
    }, [currentFolderId]);

    const handleCreateFolder = () => {
        setInputModal({
            isOpen: true,
            title: '새 폴더 생성',
            label: '폴더 이름을 입력하세요',
            initialValue: '',
            icon: 'folder',
            onConfirm: async (name: string) => {
                await fetch('/api/storage/folders', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name,
                        parentId: currentFolderId === null ? 'root' : currentFolderId,
                        folderType: filterType === 'all' ? 'exam' : filterType
                    })
                });
                setRefreshTrigger(p => p + 1);
                setInputModal(prev => ({ ...prev, isOpen: false }));
            }
        });
    };

    const handleRename = () => {
        if (!contextMenu) return;
        const { type, id } = contextMenu;
        let currentName = type === 'folder'
            ? allFolders.find(f => f.id === id)?.name || ''
            : viewItems.find(i => i.id === id)?.name || '';

        setInputModal({
            isOpen: true,
            title: '이름 변경',
            label: '새 이름을 입력하세요',
            initialValue: currentName,
            icon: 'edit',
            onConfirm: async (newName: string) => {
                if (!newName || newName === currentName) {
                    setInputModal(prev => ({ ...prev, isOpen: false }));
                    return;
                }
                const endpoint = type === 'folder' ? '/api/storage/folders' : '/api/storage/items';
                await fetch(endpoint, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id, name: newName })
                });
                setRefreshTrigger(p => p + 1);
                setInputModal(prev => ({ ...prev, isOpen: false }));
            }
        });
    };

    const handleDelete = async (type: 'folder' | 'item', id: string) => {
        const endpoint = type === 'folder' ? `/api/storage/folders` : `/api/storage/items`;
        await fetch(`${endpoint}?id=${id}`, { method: 'DELETE' });
        setRefreshTrigger(p => p + 1);
    };

    const handleDeleteFromContext = () => {
        if (!contextMenu) return;
        if (confirm('정말 삭제하시겠습니까?')) handleDelete(contextMenu.type, contextMenu.id);
    };

    const handleDownload = () => {
        if (!contextMenu || contextMenu.type !== 'item') return;
        window.location.href = `/api/storage/download?id=${contextMenu.id}`;
    };

    const handleSync = async () => {
        if (!confirm('구매한 DB 목록을 보관함으로 가져오시겠습니까?')) return;
        setLoading(true);
        try {
            const res = await fetch('/api/storage/sync', { method: 'POST' });
            const data = await res.json();
            if (data.count >= 0) {
                alert(`${data.count}개의 새로운 DB를 보관함으로 가져왔습니다.`);
                setRefreshTrigger(p => p + 1);
            }
        } catch (e) { alert('동기화 실패'); }
        finally { setLoading(false); }
    };

    const handleSingleDownload = (type: 'folder' | 'item', id: string) => {
        if (type === 'item') window.location.href = `/api/storage/download?id=${id}`;
    };

    const handleBulkDownload = () => {
        if (selectedIds.length === 0) return;
        const itemsToDownload = viewItems.filter(i => selectedIds.includes(i.id) || (i.reference_id && selectedIds.includes(i.reference_id)));
        itemsToDownload.forEach((item, idx) => {
            if (item.type === 'saved_exam') {
                setTimeout(() => {
                    const link = document.createElement('a');
                    link.href = `/api/storage/download?id=${item.id}`;
                    link.style.display = 'none';
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                }, idx * 1000);
            }
        });
    };

    const handleBulkDelete = async () => {
        if (selectedIds.length === 0) return;
        if (!confirm(`선택한 ${selectedIds.length}개 항목을 삭제하시겠습니까?`)) return;
        setLoading(true);
        for (const selId of selectedIds) {
            const item = viewItems.find(i => i.id === selId || i.reference_id === selId);
            if (item) await fetch(`/api/storage/items?id=${item.id}`, { method: 'DELETE' });
        }
        setRefreshTrigger(p => p + 1);
        setLoading(false);
        if (onSelectAll) onSelectAll([]);
    };

    const handleMoveItem = async (itemId: string, targetFolderId: string | null) => {
        await fetch('/api/storage/items', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: itemId, folderId: targetFolderId === null ? 'root' : targetFolderId })
        });
        setRefreshTrigger(p => p + 1);
    };

    const getBreadcrumbs = () => {
        if (currentFolderId === null) return [{ id: null, name: '내 보관함' }];
        const path: { id: string | null, name: string }[] = [];
        let curr: Folder | undefined = allFolders.find(f => f.id === currentFolderId);
        while (curr) {
            path.unshift({ id: curr.id, name: curr.name });
            const pid = curr.parent_id;
            curr = pid ? allFolders.find(f => f.id === pid) : undefined;
        }
        path.unshift({ id: null, name: '내 보관함' });
        return path;
    };

    return (
        <div className="flex h-full border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm">
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
                        onDelete={handleDelete}
                    />
                </div>
            </div>
            <div className="flex-1 flex flex-col">
                <div className="h-12 border-b flex items-center px-4 justify-between bg-white">
                    <div className="flex items-center gap-1 text-sm text-slate-600">
                        {getBreadcrumbs().map((crumb, idx) => (
                            <React.Fragment key={crumb.id || 'root'}>
                                {idx > 0 && <span className="text-slate-300">/</span>}
                                <button className={`hover:text-blue-600 ${crumb.id === currentFolderId ? 'font-bold text-slate-900' : ''}`} onClick={() => setCurrentFolderId(crumb.id)}> {crumb.name} </button>
                            </React.Fragment>
                        ))}
                    </div>
                    <div className="flex items-center gap-2">
                        {selectedIds.length > 0 && (
                            <>
                                <button onClick={handleBulkDownload} className="flex items-center gap-1 px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 text-sm font-medium transition-colors"> <DownloadCloud size={16} /> 선택 다운로드 </button>
                                <button onClick={handleBulkDelete} className="flex items-center gap-1 px-3 py-1.5 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 text-sm font-medium transition-colors"> <Trash2 size={16} /> 선택 삭제 </button>
                                <div className="w-px h-4 bg-slate-300 mx-1"></div>
                            </>
                        )}
                        <button onClick={handleSync} className="flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 text-sm font-medium transition-colors"> <DownloadCloud size={16} /> 가져오기 </button>
                        <button onClick={handleCreateFolder} className="flex items-center gap-1 px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 text-sm font-medium transition-colors"> <FolderPlus size={16} /> 새 폴더 </button>
                        {onSelectAll && (
                            <button onClick={() => { const itemsToSelect = viewItems.filter(i => i.type === 'personal_db' || i.type === 'saved_exam'); if (itemsToSelect.length > 0) onSelectAll(itemsToSelect); }} className="flex items-center gap-1 px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 text-sm font-medium transition-colors"> <CheckSquare size={16} /> 전체 선택 </button>
                        )}
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto bg-slate-50/30 relative" onClick={() => setContextMenu(null)} onContextMenu={(e) => { e.preventDefault(); setContextMenu(null); }}>
                    {loading && <div className="absolute inset-0 bg-white/50 z-10 flex items-center justify-center"> <Loader2 className="animate-spin text-blue-600" /> </div>}
                    <FileGrid folders={viewFolders} items={viewItems} onFolderClick={(f) => setCurrentFolderId(f.id)} onItemClick={onItemSelect} onRename={() => { }} onDelete={handleDelete} onDownload={handleSingleDownload} onContextMenu={(e, type, id) => { setContextMenu({ x: e.clientX, y: e.clientY, type, id }); }} onMoveItem={handleMoveItem} selectedIds={selectedIds} />
                </div>
            </div>
            {contextMenu && <StorageContextMenu x={contextMenu.x} y={contextMenu.y} type={contextMenu.type} onClose={() => setContextMenu(null)} onRename={handleRename} onDelete={handleDeleteFromContext} onDownload={handleDownload} />}
            {inputModal.isOpen && <InputModal title={inputModal.title} label={inputModal.label} initialValue={inputModal.initialValue} icon={inputModal.icon} onClose={() => setInputModal(p => ({ ...p, isOpen: false }))} onConfirm={inputModal.onConfirm} />}
        </div>
    );
}
