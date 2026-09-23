
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
    const [error,setError]=useState('');
    const [isInputModalOpen, setIsInputModalOpen] = useState(false);

    const loadFolders=async()=>{setLoading(true);setError('');try{const res=await fetch('/api/storage/folders?mode=all&folderType=exam');if(!res.ok)throw Error();const data=await res.json();setFolders(data.folders||[]);}catch{setError('폴더 목록을 불러오지 못했습니다. 다시 불러오거나 기본 보관함에 저장하세요.');}finally{setLoading(false);}};
    useEffect(()=>{void loadFolders();},[]);

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
                    parentId: currentFolderId === null ? 'root' : currentFolderId,
                    folderType: 'exam'
                })
            });

            if (!res.ok) throw new Error('폴더 생성 실패');
            if (res.ok) {
                // Refresh list
                const data = await fetch('/api/storage/folders?mode=all&folderType=exam').then(r => r.json());
                if (data.folders) setFolders(data.folders);
            }
        } catch (e) {
            setError('폴더를 만들지 못했습니다. 잠시 후 다시 시도해주세요.');
        }
    };

    const getCurrentFolderName = () => {
        if (currentFolderId === null) return '내 보관함 (최상위)';
        const f = folders.find(f => f.id === currentFolderId);
        return f ? f.name : '선택된 폴더';
    };

    return (
        <div role="dialog" aria-modal="true" aria-label="시험지 저장 위치" className="product-modal fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in">
            <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
                <div className="p-4 border-b flex justify-between items-center bg-slate-50">
                    <div className="min-w-0 flex-1">
                        {error&&<p role="alert" className="text-sm text-amber-800">{error}<button onClick={()=>void loadFolders()}>다시 불러오기</button></p>}<h3 className="font-bold text-lg text-slate-800">저장 위치 선택</h3>
                        <p className="text-xs text-slate-500 font-medium truncate max-w-[300px]">
                            파일: {title}.hml
                        </p>
                    </div>
                    <button
                        aria-label="저장 위치 닫기" onClick={onClose}
                        disabled={isSaving}
                        className="p-2 hover:bg-slate-200 rounded-full transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                <div className="flex-1 overflow-hidden flex flex-col p-4 space-y-4">
                    <div className="flex justify-between items-center">
                        <span className="text-sm font-bold text-slate-600">
                            현재 위치: <span className="text-brand-600">{getCurrentFolderName()}</span>
                        </span>
                        <button
                            onClick={handleCreateFolder}
                            className="text-xs flex items-center gap-1 px-2 py-1 bg-brand-50 text-brand-600 rounded hover:bg-brand-100 font-bold transition-colors"
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
                        aria-label="저장 위치 닫기" onClick={onClose}
                        disabled={isSaving}
                        className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-bold transition-colors"
                    >
                        취소
                    </button>
                    <button
                        onClick={() => onConfirm(currentFolderId)}
                        disabled={isSaving}
                        className="px-6 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg font-bold shadow-sm flex items-center gap-2 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
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
