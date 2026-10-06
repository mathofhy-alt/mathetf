
'use client';

import React, { useEffect, useState } from 'react';
import { FolderPlus, X, Check, Loader2 } from 'lucide-react';
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
        <div role="dialog" aria-modal="true" aria-label="시험지 저장 위치" className="rd rd-overlay">
            <div className="rd-modal" style={{ height: 'min(620px, calc(100dvh - 32px))' }}>
                <div className="rd-sheet-handle" />
                <div className="rd-modal-head">
                    <div style={{ minWidth: 0, flex: 1 }}>
                        <h3 className="rd-modal-title">저장 위치 선택</h3>
                        <p className="rd-modal-sub" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            파일: {title}.hml
                        </p>
                    </div>
                    <button
                        aria-label="저장 위치 닫기" onClick={onClose}
                        disabled={isSaving}
                        className="rd-modal-x"
                    >
                        <X size={20} />
                    </button>
                </div>
                {error&&<p role="alert" className="rd-alert" style={{ marginTop: 14 }}>{error}<button onClick={()=>void loadFolders()}>다시 불러오기</button></p>}

                <div style={{ marginTop: 18, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--rd-sub)', minWidth: 0 }}>
                            현재 위치 <b style={{ color: 'var(--rd-text)', fontWeight: 700, marginLeft: 4 }}>{getCurrentFolderName()}</b>
                        </span>
                        <button
                            onClick={handleCreateFolder}
                            className="rd-btn rd-btn-tint rd-btn-sm"
                        >
                            <FolderPlus size={16} /> 새 폴더
                        </button>
                    </div>

                    <div className="rd-well" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 8 }}>
                        {loading ? (
                            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', color: 'var(--rd-icon)' }}>
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

                <div className="rd-modal-foot">
                    <button
                        aria-label="저장 위치 닫기" onClick={onClose}
                        disabled={isSaving}
                        className="rd-btn rd-btn-gray"
                    >
                        취소
                    </button>
                    <button
                        onClick={() => onConfirm(currentFolderId)}
                        disabled={isSaving}
                        className="rd-btn rd-btn-primary"
                    >
                        {isSaving ? (
                            <>
                                <Loader2 size={18} className="animate-spin" /> 저장 중...
                            </>
                        ) : (
                            <>
                                <Check size={18} /> 여기에 저장
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
