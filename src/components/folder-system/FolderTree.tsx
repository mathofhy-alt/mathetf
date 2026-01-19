'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';

type Folder = {
    id: string;
    name: string;
    parent_id: string | null;
    children?: Folder[];
};

export default function FolderTree({
    onSelectFolder,
    user
}: {
    onSelectFolder: (folderId: string | null) => void,
    user: any
}) {
    const [folders, setFolders] = useState<Folder[]>([]);
    const [loading, setLoading] = useState(true);
    const [newFolderName, setNewFolderName] = useState('');
    const [selectedId, setSelectedId] = useState<string | null>(null);

    const supabase = createClient();

    useEffect(() => {
        fetchFolders();
    }, []);

    const fetchFolders = async () => {
        const { data } = await supabase
            .from('folders')
            .select('*')
            .order('created_at', { ascending: true });

        if (data) {
            setFolders(buildTree(data));
        }
        setLoading(false);
    };

    const buildTree = (data: any[]): Folder[] => {
        const map: Record<string, Folder> = {};
        const tree: Folder[] = [];

        data.forEach(item => {
            map[item.id] = { ...item, children: [] };
        });

        data.forEach(item => {
            if (item.parent_id && map[item.parent_id]) {
                map[item.parent_id].children?.push(map[item.id]);
            } else {
                tree.push(map[item.id]);
            }
        });

        return tree;
    };

    const createFolder = async (parentId: string | null = null) => {
        if (!newFolderName.trim()) return;

        // Only for prototype: assumes authentication handles user_id via context or simple insert
        // Ideally we pass user_id explicitly or let RLS handle it if we had auth set up perfectly in this context
        const { error } = await supabase.from('folders').insert({
            name: newFolderName,
            parent_id: parentId,
            user_id: user.id
        });

        if (!error) {
            setNewFolderName('');
            fetchFolders();
        } else {
            console.error(error);
            alert('폴더 생성 실패');
        }
    };

    // Simple recursive renderer
    const renderNode = (node: Folder, depth = 0) => {
        const isSelected = selectedId === node.id;
        return (
            <div key={node.id} className="select-none">
                <div
                    className={`flex items-center py-1 px-2 hover:bg-gray-100 cursor-pointer ${isSelected ? 'bg-indigo-50 text-indigo-700 font-semibold' : ''}`}
                    style={{ paddingLeft: `${depth * 15 + 8}px` }}
                    onClick={() => {
                        setSelectedId(node.id);
                        onSelectFolder(node.id);
                    }}
                >
                    <span className="mr-2">📁</span>
                    <span className="text-sm truncate">{node.name}</span>
                </div>
                {node.children && node.children.map(child => renderNode(child, depth + 1))}
            </div>
        );
    };

    return (
        <div className="border rounded bg-white h-full flex flex-col">
            <div className="p-2 border-b bg-gray-50 flex justify-between items-center text-xs font-semibold text-gray-600">
                <span>나의 시험지함</span>
                <button className="text-blue-600 hover:underline" onClick={() => setSelectedId(null)}>루트 선택</button>
            </div>

            <div className="flex-1 overflow-y-auto py-2">
                {loading ? (
                    <div className="p-4 text-xs text-gray-400">Loading...</div>
                ) : (
                    folders.map(f => renderNode(f))
                )}
            </div>

            <div className="p-2 border-t">
                <div className="flex gap-1">
                    <input
                        className="flex-1 text-xs border rounded p-1"
                        placeholder="새 폴더 이름"
                        value={newFolderName}
                        onChange={e => setNewFolderName(e.target.value)}
                    />
                    <button
                        onClick={() => createFolder(selectedId)}
                        className="bg-indigo-600 text-white text-xs px-2 rounded"
                    >
                        +
                    </button>
                </div>
                <div className="text-[10px] text-gray-400 mt-1">
                    {selectedId ? '선택된 폴더 안에 생성됨' : '최상위 경로에 생성됨'}
                </div>
            </div>
        </div>
    );
}
