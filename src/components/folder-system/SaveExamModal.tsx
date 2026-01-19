'use client';

import { useState } from 'react';
import FolderTree from './FolderTree';
import { createClient } from '@/utils/supabase/client';

export default function SaveExamModal({
    user,
    cart,
    onClose,
    onSave
}: {
    user: any,
    cart: any[],
    onClose: () => void,
    onSave: () => void
}) {
    const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
    const [title, setTitle] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const supabase = createClient();

    const handleSave = async () => {
        if (!title) return alert('시험지 제목을 입력해주세요.');
        setIsSaving(true);

        const { error } = await supabase.from('exam_papers').insert({
            user_id: user.id,
            folder_id: selectedFolderId,
            title: title,
            question_ids: JSON.stringify(cart.map(q => q.id))
        });

        if (error) {
            console.error(error);
            alert('저장 실패: ' + error.message);
            setIsSaving(false);
        } else {
            alert('저장되었습니다.');
            onSave();
            onClose();
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
            <div className="bg-white rounded-lg shadow-xl w-[500px] h-[600px] flex flex-col overflow-hidden">
                <div className="p-4 border-b flex justify-between items-center">
                    <h3 className="font-bold text-lg">시험지 저장하기</h3>
                    <button onClick={onClose} className="text-gray-500 hover:text-black">✕</button>
                </div>

                <div className="flex-1 p-4 flex flex-col gap-4 overflow-hidden">
                    <div>
                        <label className="block text-sm font-semibold mb-1">시험지 제목</label>
                        <input
                            className="w-full border p-2 rounded"
                            placeholder="예: 2025 중간고사 대비 1"
                            value={title}
                            onChange={e => setTitle(e.target.value)}
                            autoFocus
                        />
                    </div>

                    <div className="flex-1 flex flex-col min-h-0">
                        <label className="block text-sm font-semibold mb-1">저장할 폴더 선택</label>
                        <div className="flex-1 border rounded min-h-0">
                            <FolderTree
                                user={user}
                                onSelectFolder={(id) => setSelectedFolderId(id)}
                            />
                        </div>
                    </div>

                    <div className="text-sm text-gray-500 text-right">
                        총 {cart.length}문항
                    </div>
                </div>

                <div className="p-4 border-t bg-gray-50 flex justify-end gap-2">
                    <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-200 rounded">취소</button>
                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="px-6 py-2 text-sm bg-indigo-600 text-white font-bold rounded hover:bg-indigo-700 disabled:opacity-50"
                    >
                        {isSaving ? '저장 중...' : '저장하기'}
                    </button>
                    <button
                        onClick={async () => {
                            try {
                                const res = await fetch('/api/pro/download/hml', {
                                    method: 'POST',
                                    body: JSON.stringify({
                                        ids: cart.map(q => q.id), // Use IDs to ensure server fetches full data
                                        // questions: cart // fallback removed to enforce ID usage
                                    }),
                                });
                                if (!res.ok) throw new Error('Download failed');

                                const blob = await res.blob();
                                const url = window.URL.createObjectURL(blob);
                                const a = document.createElement('a');
                                a.href = url;
                                a.download = `exam_${new Date().toISOString().slice(0, 10)}.hml`;
                                document.body.appendChild(a);
                                a.click();
                                window.URL.revokeObjectURL(url);
                                document.body.removeChild(a);
                            } catch (e) {
                                alert('다운로드 실패');
                                console.error(e);
                            }
                        }}
                        className="px-6 py-2 text-sm bg-green-600 text-white font-bold rounded hover:bg-green-700 ml-2"
                    >
                        HML 다운로드
                    </button>
                </div>
            </div>
        </div>
    );
}
