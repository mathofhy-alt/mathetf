'use client';

import React, { useState } from 'react';
import { Folder as FolderIcon, FileText, CheckCircle2, DownloadCloud, ChevronDown, ChevronRight } from 'lucide-react';
import type { Folder as FolderType, UserItem } from '@/types/storage';
import { DbFileIcon } from '@/components/FileIcons';

// ─── 그룹핑 헬퍼 ────────────────────────────────────────────
function parseGrade(name: string): string {
    const m = name.match(/고(\d)학년|고(\d)/);
    if (m) return `고${m[1] || m[2]}학년`;
    if (name.includes('수능') || name.includes('수시')) return '수능/수시';
    return '기타';
}

function parseYear(name: string): string {
    const m = name.match(/(\d{4})/);
    return m ? m[1] : '연도미상';
}

type GroupedItems = Record<string, Record<string, UserItem[]>>;

function groupByGradeYear(items: UserItem[]): GroupedItems {
    const dbItems = items.filter(i => i.type === 'personal_db');
    const groups: GroupedItems = {};
    for (const item of dbItems) {
        const grade = parseGrade(item.name || '');
        const year  = parseYear(item.name || '');
        if (!groups[grade]) groups[grade] = {};
        if (!groups[grade][year]) groups[grade][year] = [];
        groups[grade][year].push(item);
    }
    // 학년 정렬 (고1 → 고2 → 고3)
    return Object.fromEntries(
        Object.entries(groups).sort(([a], [b]) => a.localeCompare(b))
    );
}

// ─────────────────────────────────────────────────────────────

interface FileGridProps {
    folders: FolderType[];
    items: UserItem[];
    onFolderClick: (folder: FolderType) => void;
    onItemClick: (item: UserItem) => void;
    onRename: (type: 'folder' | 'item', id: string, name: string) => void;
    onDelete: (type: 'folder' | 'item', id: string) => void;
    onDownload?: (type: 'folder' | 'item', id: string) => void;
    onContextMenu: (e: React.MouseEvent, type: 'folder' | 'item', id: string) => void;
    onMoveItem: (itemId: string, targetFolderId: string | null) => void;
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

    // 학년 아코디언 상태 (기본값: 펼침)
    const [openGrades, setOpenGrades] = useState<Record<string, boolean>>({});
    // 년도 아코디언 상태 (기본값: 펼침)
    const [openYears, setOpenYears] = useState<Record<string, boolean>>({});

    const toggleGrade = (grade: string) => setOpenGrades(p => ({ ...p, [grade]: p[grade] === false ? true : false }));
    const toggleYear = (key: string) => setOpenYears(p => ({ ...p, [key]: p[key] === false ? true : false }));

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

    const hasDbItems = items.some(i => i.type === 'personal_db');
    const nonDbItems = items.filter(i => i.type !== 'personal_db');
    const grouped = hasDbItems ? groupByGradeYear(items) : {};

    const renderItem = (item: UserItem) => {
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
                <div className="col-span-7 sm:col-span-8 flex items-center min-w-0 pr-2 pl-10">
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
    };

    return (
        <div className="flex flex-col w-full bg-white select-none">
            {/* Table Header */}
            <div className="grid grid-cols-12 gap-4 px-4 py-2 border-b border-slate-200 text-xs font-bold text-slate-500 bg-slate-50 sticky top-0 z-10">
                <div className="col-span-7 sm:col-span-8">이름</div>
                <div className="col-span-3 sm:col-span-2 text-center text-slate-400 font-medium">수정한 날짜</div>
                <div className="col-span-2 text-center text-slate-400 font-medium">유형</div>
            </div>

            <div className="flex flex-col">
                {/* 폴더 */}
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
                        <div className="col-span-2 text-xs text-slate-500 text-center truncate">파일 폴더</div>
                    </div>
                ))}

                {/* 개인DB: 학년 → 년도 아코디언 */}
                {hasDbItems && Object.entries(grouped).map(([grade, yearMap]) => {
                    const gradeOpen = openGrades[grade] !== false; // 기본 펼침
                    const totalCount = Object.values(yearMap).flat().length;
                    return (
                        <div key={grade}>
                            {/* 학년 헤더 */}
                            <button
                                className="w-full flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 border-b border-slate-200 transition-colors text-left"
                                onClick={() => toggleGrade(grade)}
                            >
                                {gradeOpen
                                    ? <ChevronDown size={15} className="text-slate-500 flex-shrink-0" />
                                    : <ChevronRight size={15} className="text-slate-500 flex-shrink-0" />
                                }
                                <span className="text-sm font-bold text-slate-700">📚 {grade}</span>
                                <span className="ml-auto text-xs text-slate-400 font-normal">{totalCount}개</span>
                            </button>

                            {gradeOpen && Object.entries(yearMap)
                                .sort(([a], [b]) => b.localeCompare(a)) // 최신년도 위로
                                .map(([year, yearItems]) => {
                                    const yearKey = `${grade}_${year}`;
                                    const yearOpen = openYears[yearKey] !== false; // 기본 펼침
                                    return (
                                        <div key={year}>
                                            {/* 년도 서브헤더 */}
                                            <button
                                                className="w-full flex items-center gap-2 pl-8 pr-4 py-1.5 bg-slate-50 hover:bg-blue-50 border-b border-slate-100 transition-colors text-left"
                                                onClick={() => toggleYear(yearKey)}
                                            >
                                                {yearOpen
                                                    ? <ChevronDown size={13} className="text-slate-400 flex-shrink-0" />
                                                    : <ChevronRight size={13} className="text-slate-400 flex-shrink-0" />
                                                }
                                                <span className="text-xs font-semibold text-slate-600">📅 {year}년</span>
                                                <span className="ml-auto text-xs text-slate-400 font-normal">{yearItems.length}개</span>
                                            </button>

                                            {yearOpen && yearItems.map(item => renderItem(item))}
                                        </div>
                                    );
                                })
                            }
                        </div>
                    );
                })}

                {/* 비-DB 아이템 (시험지 등) flat 렌더링 */}
                {nonDbItems.map(item => renderItem(item))}
            </div>
        </div>
    );
}
