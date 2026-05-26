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
    onGroupSelect?: (items: UserItem[], select: boolean) => void;
}

const formatDate = (dateStr?: string) => {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '-';
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
};

// 파일명에서 "전국연합", 4자리 연도 제거 — 핵심 정보(월·학년·형)만 표시
const shortenName = (name: string, type: string): string => {
    if (type !== 'personal_db') return name;
    return name
        .replace(/전국연합\s*/g, '')   // "전국연합" 제거
        .replace(/\d{4}(년)?\s*/g, '') // 4자리 연도(+년) 제거
        .trim()
        || name; // 빈 문자열이 되면 원본 유지
};


export default function FileGrid({ folders, items, onFolderClick, onItemClick, onDelete, onDownload, onContextMenu, onMoveItem, selectedIds = [], onGroupSelect }: FileGridProps) {

    // 학년 아코디언 상태 (기본값: 접힘)
    const [openGrades, setOpenGrades] = useState<Record<string, boolean>>({});
    // 년도 아코디언 상태 (기본값: 접힘)
    const [openYears, setOpenYears] = useState<Record<string, boolean>>({});

    const toggleGrade = (grade: string) => setOpenGrades(p => ({ ...p, [grade]: p[grade] ? false : true }));
    const toggleYear = (key: string) => setOpenYears(p => ({ ...p, [key]: p[key] ? false : true }));

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
                className={`group relative grid grid-cols-12 gap-1 sm:gap-4 px-2 sm:px-4 py-1.5 items-center border-b border-slate-100 cursor-pointer transition-colors
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
                {/* 이름: 모바일=전체너비, 데스크탑=8칸 */}
                <div className="col-span-12 sm:col-span-8 flex items-center min-w-0 pr-2 pl-6 sm:pl-10">
                    {item.type === 'personal_db' ? (
                        <DbFileIcon size={18} className="drop-shadow-sm flex-shrink-0 mr-2" />
                    ) : (
                        <FileText size={18} className="text-blue-500 flex-shrink-0 mr-2" />
                    )}
                    <span className={`text-sm truncate min-w-0 flex-1 ${isSelected ? 'font-semibold text-indigo-900' : 'text-slate-700'}`}>
                        {shortenName(item.name || '이름 없음', item.type)}
                    </span>
                    {isSelected && (
                        <div className="ml-2 text-indigo-600 flex-shrink-0">
                            <CheckCircle2 size={16} className="fill-indigo-100 border-white rounded-full" />
                        </div>
                    )}
                </div>
                {/* 날짜·유형: 모바일에서 숨김 */}
                <div className="hidden sm:block col-span-2 text-xs text-slate-500 text-center truncate font-mono tracking-tight">
                    {formatDate(item.created_at)}
                </div>
                <div className="hidden sm:block col-span-2 text-xs text-slate-500 text-center truncate">
                    {item.type === 'personal_db' ? '개인DB' : '시험지'}
                </div>
            </div>
        );
    };

    return (
        <div className="flex flex-col w-full bg-white select-none">
            {/* Table Header */}
            <div className="grid grid-cols-12 gap-1 sm:gap-4 px-2 sm:px-4 py-2 border-b border-slate-200 text-xs font-bold text-slate-500 bg-slate-50 sticky top-0 z-10">
                <div className="col-span-12 sm:col-span-8">이름</div>
                <div className="hidden sm:block col-span-2 text-center text-slate-400 font-medium">수정한 날짜</div>
                <div className="hidden sm:block col-span-2 text-center text-slate-400 font-medium">유형</div>
            </div>

            <div className="flex flex-col">
                {/* 폴더 */}
                {folders.map(folder => (
                    <div
                        key={folder.id}
                        className="group relative grid grid-cols-12 gap-1 sm:gap-4 px-2 sm:px-4 py-1.5 items-center border-b border-slate-100 hover:bg-blue-50 cursor-pointer transition-colors"
                        onClick={() => onFolderClick(folder)}
                        onContextMenu={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onContextMenu(e, 'folder', folder.id);
                        }}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => handleDropOnFolder(e, folder.id)}
                    >
                        <div className="col-span-12 sm:col-span-8 flex items-center min-w-0 pr-2">
                            <FolderIcon size={18} className="text-yellow-400 fill-yellow-100 flex-shrink-0 mr-2" />
                            <span className="text-sm text-slate-700 truncate min-w-0 flex-1">
                                {folder.name}
                            </span>
                        </div>
                        <div className="hidden sm:block col-span-2 text-xs text-slate-500 text-center truncate font-mono tracking-tight">
                            {formatDate(folder.created_at)}
                        </div>
                        <div className="hidden sm:block col-span-2 text-xs text-slate-500 text-center truncate">파일 폴더</div>
                    </div>
                ))}

                {/* 개인DB: 학년 → 년도 아코디언 */}
                {hasDbItems && Object.entries(grouped).map(([grade, yearMap]) => {
                    const gradeOpen = openGrades[grade] === true; // 기본 접힘
                    const totalCount = Object.values(yearMap).flat().length;
                    return (
                        <div key={grade}>
                            {/* 학년 헤더 */}
                            <button
                                className={`w-full flex items-center gap-2 px-4 py-2 border-b transition-colors text-left ${
                                    Object.values(yearMap).flat().some(item =>
                                        selectedIds.includes(item.id) || (item.reference_id && selectedIds.includes(item.reference_id))
                                    )
                                        ? 'bg-[#E8F0FB] hover:bg-[#D4E4F7] border-[#B7D1EA]'
                                        : 'bg-slate-100 hover:bg-slate-200 border-slate-200'
                                }`}
                                onClick={() => toggleGrade(grade)}
                            >
                                {gradeOpen
                                    ? <ChevronDown size={15} className="text-slate-500 flex-shrink-0" />
                                    : <ChevronRight size={15} className="text-slate-500 flex-shrink-0" />
                                }
                                <span className="text-sm font-bold text-slate-700">📚 {grade}</span>
                                <span className="ml-auto flex items-center gap-2">
                                    {(() => {
                                        const allInGrade = Object.values(yearMap).flat();
                                        const selCount = allInGrade.filter(item =>
                                            selectedIds.includes(item.id) || (item.reference_id && selectedIds.includes(item.reference_id))
                                        ).length;
                                        const gradeAllSel = selCount === allInGrade.length && allInGrade.length > 0;
                                        return (
                                            <>
                                                {selCount > 0 ? (
                                                    <span className="bg-[#497AB7] text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                                                        {selCount}/{allInGrade.length} 선택
                                                    </span>
                                                ) : (
                                                    <span className="text-xs text-slate-400 font-normal">{totalCount}개</span>
                                                )}
                                                {onGroupSelect && (
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); onGroupSelect(allInGrade, !gradeAllSel); }}
                                                        className={`text-[10px] font-bold px-2 py-0.5 rounded border transition-colors ${
                                                            gradeAllSel
                                                                ? 'bg-[#497AB7] text-white border-[#3A6BA0]'
                                                                : 'bg-white text-[#497AB7] border-[#B7D1EA] hover:bg-[#E8F0FB]'
                                                        }`}
                                                    >
                                                        {gradeAllSel ? '전체 해제' : '전체 선택'}
                                                    </button>
                                                )}
                                            </>
                                        );
                                    })()}
                                </span>
                            </button>

                            {gradeOpen && Object.entries(yearMap)
                                .sort(([a], [b]) => b.localeCompare(a)) // 최신년도 위로
                                .map(([year, yearItems]) => {
                                    const yearKey = `${grade}_${year}`;
                                    const yearOpen = openYears[yearKey] === true; // 기본 접힘
                                    return (
                                        <div key={year}>
                                            {/* 년도 서브헤더 */}
                                            <button
                                                className={`w-full flex items-center gap-2 pl-8 pr-4 py-1.5 border-b transition-colors text-left ${
                                                    yearItems.some(item =>
                                                        selectedIds.includes(item.id) || (item.reference_id && selectedIds.includes(item.reference_id))
                                                    )
                                                        ? 'bg-[#EEF4FD] hover:bg-[#E0ECFB] border-[#C5D9F0]'
                                                        : 'bg-slate-50 hover:bg-blue-50 border-slate-100'
                                                }`}
                                                onClick={() => toggleYear(yearKey)}
                                            >
                                                {yearOpen
                                                    ? <ChevronDown size={13} className="text-slate-400 flex-shrink-0" />
                                                    : <ChevronRight size={13} className="text-slate-400 flex-shrink-0" />
                                                }
                                                <span className="text-xs font-semibold text-slate-600">📅 {year}년</span>
                                                <span className="ml-auto flex items-center gap-2">
                                                    {(() => {
                                                        const selCount = yearItems.filter(item =>
                                                            selectedIds.includes(item.id) || (item.reference_id && selectedIds.includes(item.reference_id))
                                                        ).length;
                                                        const yearAllSel = selCount === yearItems.length && yearItems.length > 0;
                                                        return (
                                                            <>
                                                                {selCount > 0 ? (
                                                                    <span className="bg-[#5CC6C3] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                                                                        {selCount}/{yearItems.length}
                                                                    </span>
                                                                ) : (
                                                                    <span className="text-xs text-slate-400 font-normal">{yearItems.length}개</span>
                                                                )}
                                                                {onGroupSelect && (
                                                                    <button
                                                                        onClick={(e) => { e.stopPropagation(); onGroupSelect(yearItems, !yearAllSel); }}
                                                                        className={`text-[10px] font-bold px-2 py-0.5 rounded border transition-colors ${
                                                                            yearAllSel
                                                                                ? 'bg-[#5CC6C3] text-white border-[#3AADA9]'
                                                                                : 'bg-white text-[#3AADA9] border-[#5CC6C3]/50 hover:bg-[#EEF4FD]'
                                                                        }`}
                                                                    >
                                                                        {yearAllSel ? '해제' : '전체'}
                                                                    </button>
                                                                )}
                                                            </>
                                                        );
                                                    })()}
                                                </span>
                                            </button>

                                            {yearOpen && [...yearItems].sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { numeric: true })).map(item => renderItem(item))}
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
