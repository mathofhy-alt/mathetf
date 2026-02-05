
'use client';

import React, { useEffect, useState } from 'react';
import { Folder, FolderPlus, X, Check, Loader2 } from 'lucide-react';
import FolderTree from './FolderTree';
import InputModal from '../common/InputModal';
import type { Folder as FolderType } from '@/types/storage';

interface SaveLocationModalProps {
    onClose: () => void;
    onConfirm: (folderId: string | null) => void;
    title: string;
    isSaving: boolean;
}

export default function SaveLocationModal({ onClose, onConfirm, title, isSaving }: SaveLocationModalProps) {
    const [folders, setFolders] = useState<FolderType[]>([]);
    const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [isInputModalOpen, setIsInputModalOpen] = useState(false);

    useEffect(() => {
        // Fetch all folders for the tree
        fetch('/api/storage/folders?mode=all')
            .then(res => res.json())
            .then(data => {
                if (data.folders) setFolders(data.folders);
                setLoading(false);
            })
            .catch(err => {
                console.error(err);
                setLoading(false);
            });
    }, []);

    const handleCreateFolder = () => {
        setIsInputModalOpen(true);
    };

    const onConfirmCreateFolder = async (name: string) => {
        setIsInputModalOpen(false);
        try {
            const res = await fetch('/api/storage/folders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name,
                    parentId: currentFolderId === null ? 'root' : currentFolderId
                })
            });

            if (res.ok) {
                // Refresh list
                const data = await fetch('/api/storage/folders?mode=all').then(r => r.json());
                if (data.folders) setFolders(data.folders);
            }
        } catch (e) {
            alert('폴더 생성 실패');
        }
    };

    const getCurrentFolderName = () => {
        if (currentFolderId === null) return '내 보관함 (최상위)';
        const f = folders.find(f => f.id === currentFolderId);
        return f ? f.name : '선택된 폴더';
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in">
            <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
                <div className="p-4 border-b flex justify-between items-center bg-slate-50">
                    <div>
                        <h3 className="font-bold text-lg text-slate-800">저장 위치 선택</h3>
                        <p className="text-xs text-slate-500 font-medium truncate max-w-[300px]">
                            파일: {title}.hml
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        disabled={isSaving}
                        className="p-2 hover:bg-slate-200 rounded-full transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                <div className="flex-1 overflow-hidden flex flex-col p-4 space-y-4">
                    <div className="flex justify-between items-center">
                        <span className="text-sm font-bold text-slate-600">
                            현재 위치: <span className="text-indigo-600">{getCurrentFolderName()}</span>
                        </span>
                        <button
                            onClick={handleCreateFolder}
                            className="text-xs flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-600 rounded hover:bg-blue-100 font-bold transition-colors"
                        >
                            <FolderPlus size={14} /> 새 폴더
                        </button>
                    </div>

                    <div className="flex-1 border rounded-lg overflow-y-auto p-2 bg-slate-50">
                        {loading ? (
                            <div className="flex justify-center items-center h-full text-slate-400">
                                <Loader2 className="animate-spin" />
                            </div>
                        ) : (
                            <FolderTree
                                folders={folders}
                                currentFolderId={currentFolderId}
                                onFolderSelect={setCurrentFolderId}
                            />
                        )}
                    </div>
                </div>

                <div className="p-4 border-t bg-white flex justify-end gap-2">
                    <button
                        onClick={onClose}
                        disabled={isSaving}
                        className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-bold transition-colors"
                    >
                        취소
                    </button>
                    <button
                        onClick={() => onConfirm(currentFolderId)}
                        disabled={isSaving}
                        className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold shadow-lg shadow-indigo-200 flex items-center gap-2 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isSaving ? (
                            <>
                                <Loader2 size={16} className="animate-spin" /> 저장 중...
                            </>
                        ) : (
                            <>
                                <Check size={16} /> 여기에 저장
                            </>
                        )}
                    </button>
                </div>
            </div>
            {isInputModalOpen && (
                <InputModal
                    title="새 폴더 생성"
                    label="폴더 이름을 입력하세요"
                    icon="folder"
                    onClose={() => setIsInputModalOpen(false)}
                    onConfirm={onConfirmCreateFolder}
                />
            )}
        </div>
    );
}
