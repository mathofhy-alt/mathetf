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

// 파일명에서 시험 종류(1학기 중간/기말, 입학시험, 모의고사, 수능 등) 추출
function parseExamType(name: string): string {
    // 사관학교·경찰대
    if (name.includes('입학시험')) return '입학시험';
    if (name.includes('수능')) return '수능';
    if (name.includes('모의')) {
        const mo = name.match(/(\d+)\s*월/);
        return mo ? `${mo[1]}월 모의고사` : '모의고사';
    }
    const semM = name.match(/(\d)\s*학기/);
    const sem = semM ? semM[1] : null;
    const isMid = name.includes('중간');
    const isFin = name.includes('기말');
    if (sem) {
        if (isMid) return `${sem}학기 중간`;
        if (isFin) return `${sem}학기 기말`;
        return `${sem}학기`;
    }
    if (isMid) return '중간';
    if (isFin) return '기말';
    return '기타';
}

// 시험 종류 표시 순서
const EXAM_TYPE_ORDER = ['1학기 중간', '1학기 기말', '2학기 중간', '2학기 기말'];
function examTypeRank(t: string): number {
    const i = EXAM_TYPE_ORDER.indexOf(t);
    return i === -1 ? 99 : i;
}

// 학년 → 년도 → 시험종류 → 항목
type GroupedItems = Record<string, Record<string, Record<string, UserItem[]>>>;

function groupByGradeYearType(items: UserItem[]): GroupedItems {
    const dbItems = items.filter(i => i.type === 'personal_db');
    const groups: GroupedItems = {};
    for (const item of dbItems) {
        const grade = parseGrade(item.name || '');
        const year  = parseYear(item.name || '');
        const etype = parseExamType(item.name || '');
        if (!groups[grade]) groups[grade] = {};
        if (!groups[grade][year]) groups[grade][year] = {};
        if (!groups[grade][year][etype]) groups[grade][year][etype] = [];
        groups[grade][year][etype].push(item);
    }
    // 학년 정렬 (고1 → 고2 → 고3)
    return Object.fromEntries(
        Object.entries(groups).sort(([a], [b]) => a.localeCompare(b))
    );
}

// 헬퍼: 특정 학년/년도 하위의 모든 항목을 평탄화
const flattenTypeMap = (typeMap: Record<string, UserItem[]>): UserItem[] =>
    Object.values(typeMap).flat();
const flattenYearMap = (yearMap: Record<string, Record<string, UserItem[]>>): UserItem[] =>
    Object.values(yearMap).flatMap(flattenTypeMap);

// ─────────────────────────────────────────────────────────────

interface FileGridProps {
    selectionOnly?: boolean;
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


export default function FileGrid({ selectionOnly = false, folders, items, onFolderClick, onItemClick, onDelete, onDownload, onContextMenu, onMoveItem, selectedIds = [], onGroupSelect }: FileGridProps) {

    // 학년 아코디언 상태 (기본값: 접힘)
    const [openGrades, setOpenGrades] = useState<Record<string, boolean>>({});
    // 년도 아코디언 상태 (기본값: 접힘)
    const [openYears, setOpenYears] = useState<Record<string, boolean>>({});
    // 시험종류 아코디언 상태 (기본값: 접힘)
    const [openTypes, setOpenTypes] = useState<Record<string, boolean>>({});

    const toggleGrade = (grade: string) => setOpenGrades(p => ({ ...p, [grade]: p[grade] ? false : true }));
    const toggleYear = (key: string) => setOpenYears(p => ({ ...p, [key]: p[key] ? false : true }));
    const toggleType = (key: string) => setOpenTypes(p => ({ ...p, [key]: p[key] ? false : true }));

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
    const grouped = hasDbItems ? groupByGradeYearType(items) : {};

    // 모의고사·사관학교·경찰대(입학시험)는 시험종류 단계 없이 연도 밑에 바로 펼침 (클릭 1번 절약).
    // 내신(구매 학교 기출)은 학기·중간/기말 구분이 필요하므로 3단계 유지.
    const isFreeExamName = (n?: string) => {
        const e = parseExamType(n || '');
        return e.includes('모의') || e === '수능' || e === '입학시험';
    };
    const dbItemsAll = items.filter(i => i.type === 'personal_db');
    const flattenTypes = dbItemsAll.length > 0 && dbItemsAll.every(i => isFreeExamName(i.name || ''));

    const renderItem = (item: UserItem) => {
        const isSelected = selectedIds.includes(item.id) || (item.reference_id && selectedIds.includes(item.reference_id));
        return (
            <div
                key={item.id}
                className={`group relative grid grid-cols-12 gap-1 sm:gap-4 px-2 sm:px-4 py-1.5 items-center border-b border-slate-100 cursor-pointer transition-colors
                    ${isSelected ? 'bg-[#E8F6F5] hover:bg-[#D9F0EE]' : 'bg-white hover:bg-slate-50'}
                `}
                onClick={() => onItemClick(item)}
                onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onContextMenu(e, 'item', item.id);
                }}
                role={selectionOnly ? 'checkbox' : undefined}
                aria-checked={selectionOnly ? !!isSelected : undefined}
                aria-label={selectionOnly ? item.name || '자료 선택' : undefined}
                tabIndex={selectionOnly ? 0 : undefined}
                onKeyDown={selectionOnly ? (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); onItemClick(item); } } : undefined}
                draggable={!selectionOnly}
                onDragStart={(e) => handleDragStart(e, 'item', item.id)}
            >
                {isSelected && (
                    <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-[#3AADA9]"></div>
                )}
                {/* 이름: 모바일=전체너비, 데스크탑=10칸 */}
                <div className="col-span-12 sm:col-span-10 flex items-center min-w-0 pr-2 pl-6 sm:pl-10">
                    {item.type === 'personal_db' ? (
                        <DbFileIcon size={18} className="drop-shadow-sm flex-shrink-0 mr-2" />
                    ) : (
                        <FileText size={18} className="text-[#1B7E7A] flex-shrink-0 mr-2" />
                    )}
                    <span className={`text-sm truncate min-w-0 flex-1 ${isSelected ? 'font-semibold text-[#17202C]' : 'text-slate-700'}`}>
                        {shortenName(item.name || '이름 없음', item.type)}
                    </span>
                    {isSelected && (
                        <div className="ml-2 text-[#1B7E7A] flex-shrink-0">
                            <CheckCircle2 size={16} className="fill-[#E8F6F5] border-white rounded-full" />
                        </div>
                    )}
                </div>
                {/* 날짜: 모바일에서 숨김 */}
                <div className="hidden sm:block col-span-2 text-xs text-slate-400 text-center truncate">
                    {formatDate(item.created_at)}
                </div>
            </div>
        );
    };

    return (
        <div className="flex flex-col w-full bg-white select-none">
            {/* Table Header */}
            <div className="grid grid-cols-12 gap-1 sm:gap-4 px-2 sm:px-4 py-2 border-b border-[#ECEFF2] text-xs font-bold text-[#5F6B78] bg-[#F7F8FA] sticky top-0 z-10">
                <div className="col-span-12 sm:col-span-10">이름</div>
                <div className="hidden sm:block col-span-2 text-center text-slate-400 font-medium">날짜</div>
            </div>

            <div className="flex flex-col">
                {/* 폴더 */}
                {folders.map(folder => (
                    <div
                        key={folder.id}
                        className="group relative grid grid-cols-12 gap-1 sm:gap-4 px-2 sm:px-4 py-1.5 items-center border-b border-slate-100 hover:bg-[#E8F6F5] cursor-pointer transition-colors"
                        onClick={() => onFolderClick(folder)}
                        onContextMenu={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onContextMenu(e, 'folder', folder.id);
                        }}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => handleDropOnFolder(e, folder.id)}
                    >
                        <div className="col-span-12 sm:col-span-10 flex items-center min-w-0 pr-2">
                            <FolderIcon size={18} className="text-[#1B7E7A] fill-[#E8F6F5] flex-shrink-0 mr-2" />
                            <span className="text-sm text-slate-700 truncate min-w-0 flex-1">
                                {folder.name}
                            </span>
                        </div>
                        <div className="hidden sm:block col-span-2 text-xs text-slate-400 text-center truncate">
                            {formatDate(folder.created_at)}
                        </div>
                    </div>
                ))}

                {/* 개인DB: 학년 → 년도 아코디언 */}
                {hasDbItems && Object.entries(grouped).map(([grade, yearMap]) => {
                    const gradeOpen = openGrades[grade] === true; // 기본 접힘
                    const totalCount = flattenYearMap(yearMap).length;
                    return (
                        <div key={grade}>
                            {/* 학년 헤더 */}
                            <div role="button" tabIndex={0}
                                className={`w-full flex items-center gap-2 px-4 py-2 border-b transition-colors text-left ${
                                    flattenYearMap(yearMap).some(item =>
                                        selectedIds.includes(item.id) || (item.reference_id && selectedIds.includes(item.reference_id))
                                    )
                                        ? 'bg-[#E8F6F5] hover:bg-[#D9F0EE] border-[#BFE5E2]'
                                        : 'bg-[#F2F4F6] hover:bg-[#E7EAEE] border-[#ECEFF2]'
                                }`}
                                onClick={() => toggleGrade(grade)}
                                onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); toggleGrade(grade); } }}
                            >
                                {gradeOpen
                                    ? <ChevronDown size={15} className="text-slate-500 flex-shrink-0" />
                                    : <ChevronRight size={15} className="text-slate-500 flex-shrink-0" />
                                }
                                <span className="w-1.5 h-4 rounded-full bg-[#1B7E7A] flex-shrink-0" /><span className="text-sm font-bold text-slate-700">{grade}</span>
                                <span className="ml-auto flex items-center gap-2">
                                    {(() => {
                                        const allInGrade = flattenYearMap(yearMap);
                                        const selCount = allInGrade.filter(item =>
                                            selectedIds.includes(item.id) || (item.reference_id && selectedIds.includes(item.reference_id))
                                        ).length;
                                        const gradeAllSel = selCount === allInGrade.length && allInGrade.length > 0;
                                        return (
                                            <>
                                                {selCount > 0 ? (
                                                    <span className="bg-[#1B7E7A] text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
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
                                                                ? 'bg-[#1B7E7A] text-white border-[#1B7E7A]'
                                                                : 'bg-white text-[#1B7E7A] border-[#BFE5E2] hover:bg-[#E8F6F5]'
                                                        }`}
                                                    >
                                                        {gradeAllSel ? '전체 해제' : '전체 선택'}
                                                    </button>
                                                )}
                                            </>
                                        );
                                    })()}
                                </span>
                            </div>

                            {gradeOpen && Object.entries(yearMap)
                                .sort(([a], [b]) => b.localeCompare(a)) // 최신년도 위로
                                .map(([year, typeMap]) => {
                                    const yearKey = `${grade}_${year}`;
                                    const yearOpen = openYears[yearKey] === true; // 기본 접힘
                                    const allInYear = flattenTypeMap(typeMap);
                                    return (
                                        <div key={year}>
                                            {/* 년도 서브헤더 */}
                                            <div role="button" tabIndex={0}
                                                className={`w-full flex items-center gap-2 pl-8 pr-4 py-1.5 border-b transition-colors text-left ${
                                                    allInYear.some(item =>
                                                        selectedIds.includes(item.id) || (item.reference_id && selectedIds.includes(item.reference_id))
                                                    )
                                                        ? 'bg-[#E8F6F5] hover:bg-[#D9F0EE] border-[#BFE5E2]'
                                                        : 'bg-slate-50 hover:bg-[#E8F6F5] border-slate-100'
                                                }`}
                                                onClick={() => toggleYear(yearKey)}
                                                onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); toggleYear(yearKey); } }}
                                            >
                                                {yearOpen
                                                    ? <ChevronDown size={13} className="text-slate-400 flex-shrink-0" />
                                                    : <ChevronRight size={13} className="text-slate-400 flex-shrink-0" />
                                                }
                                                <span className="w-1.5 h-3.5 rounded-full bg-[#3AADA9] flex-shrink-0" /><span className="text-xs font-semibold text-slate-600">{year}년</span>
                                                <span className="ml-auto flex items-center gap-2">
                                                    {(() => {
                                                        const selCount = allInYear.filter(item =>
                                                            selectedIds.includes(item.id) || (item.reference_id && selectedIds.includes(item.reference_id))
                                                        ).length;
                                                        const yearAllSel = selCount === allInYear.length && allInYear.length > 0;
                                                        return (
                                                            <>
                                                                {selCount > 0 ? (
                                                                    <span className="bg-[#3AADA9] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                                                                        {selCount}/{allInYear.length}
                                                                    </span>
                                                                ) : (
                                                                    <span className="text-xs text-slate-400 font-normal">{allInYear.length}개</span>
                                                                )}
                                                                {onGroupSelect && (
                                                                    <button
                                                                        onClick={(e) => { e.stopPropagation(); onGroupSelect(allInYear, !yearAllSel); }}
                                                                        className={`text-[10px] font-bold px-2 py-0.5 rounded border transition-colors ${
                                                                            yearAllSel
                                                                                ? 'bg-[#3AADA9] text-white border-[#166B68]'
                                                                                : 'bg-white text-[#166B68] border-[#3AADA9]/50 hover:bg-[#E8F6F5]'
                                                                        }`}
                                                                    >
                                                                        {yearAllSel ? '해제' : '전체'}
                                                                    </button>
                                                                )}
                                                            </>
                                                        );
                                                    })()}
                                                </span>
                                            </div>

                                            {/* 평탄화(모의고사/사관학교/경찰대): 연도 밑에 항목 바로 */}
                                            {yearOpen && flattenTypes &&
                                                [...allInYear].sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { numeric: true })).map(item => renderItem(item))
                                            }

                                            {/* 시험종류 서브헤더 (내신: 1학기 중간/기말, 2학기 중간/기말) */}
                                            {yearOpen && !flattenTypes && Object.entries(typeMap)
                                                .sort(([a], [b]) => examTypeRank(a) - examTypeRank(b))
                                                .map(([etype, typeItems]) => {
                                                    const typeKey = `${grade}_${year}_${etype}`;
                                                    const typeOpen = openTypes[typeKey] === true; // 기본 접힘
                                                    return (
                                                        <div key={etype}>
                                                            <div role="button" tabIndex={0}
                                                                className={`w-full flex items-center gap-2 pl-12 pr-4 py-1.5 border-b transition-colors text-left ${
                                                                    typeItems.some(item =>
                                                                        selectedIds.includes(item.id) || (item.reference_id && selectedIds.includes(item.reference_id))
                                                                    )
                                                                        ? 'bg-[#E8F6F5] hover:bg-[#D9F0EE] border-[#BFE5E2]'
                                                                        : 'bg-slate-50/60 hover:bg-violet-50 border-slate-100'
                                                                }`}
                                                                onClick={() => toggleType(typeKey)}
                                                                onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); toggleType(typeKey); } }}
                                                            >
                                                                {typeOpen
                                                                    ? <ChevronDown size={12} className="text-slate-400 flex-shrink-0" />
                                                                    : <ChevronRight size={12} className="text-slate-400 flex-shrink-0" />
                                                                }
                                                                <span className="w-1.5 h-3 rounded-full bg-[#6CC3BF] flex-shrink-0" /><span className="text-xs font-semibold text-slate-600">{etype}</span>
                                                                <span className="ml-auto flex items-center gap-2">
                                                                    {(() => {
                                                                        const selCount = typeItems.filter(item =>
                                                                            selectedIds.includes(item.id) || (item.reference_id && selectedIds.includes(item.reference_id))
                                                                        ).length;
                                                                        const typeAllSel = selCount === typeItems.length && typeItems.length > 0;
                                                                        return (
                                                                            <>
                                                                                {selCount > 0 ? (
                                                                                    <span className="bg-[#6CC3BF] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                                                                                        {selCount}/{typeItems.length}
                                                                                    </span>
                                                                                ) : (
                                                                                    <span className="text-xs text-slate-400 font-normal">{typeItems.length}개</span>
                                                                                )}
                                                                                {onGroupSelect && (
                                                                                    <button
                                                                                        onClick={(e) => { e.stopPropagation(); onGroupSelect(typeItems, !typeAllSel); }}
                                                                                        className={`text-[10px] font-bold px-2 py-0.5 rounded border transition-colors ${
                                                                                            typeAllSel
                                                                                                ? 'bg-[#6CC3BF] text-white border-[#1B7E7A]'
                                                                                                : 'bg-white text-[#6CC3BF] border-[#BFE5E2] hover:bg-[#E8F6F5]'
                                                                                        }`}
                                                                                    >
                                                                                        {typeAllSel ? '해제' : '전체'}
                                                                                    </button>
                                                                                )}
                                                                            </>
                                                                        );
                                                                    })()}
                                                                </span>
                                                            </div>

                                                            {typeOpen && [...typeItems].sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { numeric: true })).map(item => renderItem(item))}
                                                        </div>
                                                    );
                                                })
                                            }
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
