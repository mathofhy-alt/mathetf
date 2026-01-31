'use client';

import React, { useState, useEffect } from 'react';
import { Filter, ChevronDown, ChevronRight, Check } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';

export interface FilterState {
    units: string[];
    difficulty: string[];
    // questionType removed
    subjects: string[]; // Keep for compatibility, though we prioritize units
    keywords: string[];
}

const SUBJECT_ORDER = ['공통수학1', '공통수학2', '대수', '미적분', '기하와벡터', '확률과통계'];

const UNIT_PRESETS: Record<string, string[]> = {
    '공통수학1': ['다항식', '항등식', '복소수', '이차방정식', '이차함수', '여러가지방정식', '여러가지부등식', '경우의수', '행렬'],
    '공통수학2': ['집합', '명제', '절대부등식', '함수', '역함수합성함수', '유리함수', '무리함수']
};

interface TreeNode {
    subject: string;
    units: string[];
    isExpanded: boolean;
}

interface FilterSidebarProps {
    dbFilter?: any; // Legacy simple filter (optional)
    selectedDbIds?: string[]; // List of selected personal DBs
    purchasedDbs?: any[]; // Full DB objects to cross-reference IDs if needed
    onFilterChange: (filters: FilterState) => void;
}

export default function FilterSidebar({ dbFilter, selectedDbIds, purchasedDbs, onFilterChange }: FilterSidebarProps) {
    const [treeData, setTreeData] = useState<TreeNode[]>([]);
    const [loadingUnits, setLoadingUnits] = useState(false);

    // Filter States
    const [selectedUnits, setSelectedUnits] = useState<string[]>([]);
    const [selectedDifficulty, setSelectedDifficulty] = useState<string[]>([]); // Strings "1".."10"
    const [keywordInput, setKeywordInput] = useState('');
    const [activeKeywords, setActiveKeywords] = useState<string[]>([]);
    // selectedTypes removed

    const supabase = createClient();

    // Fetch Tree Data
    useEffect(() => {
        const fetchTree = async () => {
            setLoadingUnits(true);

            // 1. Initialize Tree with Presets (Skeleton)
            const skeleton: Record<string, Set<string>> = {};
            SUBJECT_ORDER.forEach(sub => {
                skeleton[sub] = new Set(UNIT_PRESETS[sub] || []);
            });

            // 2. Fetch distinct Subject/Unit from DB if DBs are selected
            if (selectedDbIds && selectedDbIds.length > 0 && purchasedDbs) {
                const selectedDbs = purchasedDbs.filter(d => selectedDbIds.includes(d.id));

                if (selectedDbs.length > 0) {
                    let query = supabase.from('questions').select('subject, unit').eq('work_status', 'sorted');

                    const orConditions = selectedDbs.map(db => {
                        let gradeVal = db.grade;
                        if (['1', '2', '3'].includes(String(db.grade))) {
                            gradeVal = `고${db.grade}`;
                        } else if (typeof db.grade === 'string' && !db.grade.startsWith('고') && !isNaN(Number(db.grade))) {
                            gradeVal = `고${db.grade}`;
                        }

                        let yearVal = db.exam_year || db.year;
                        if (!yearVal && db.title) {
                            const match = db.title.match(/20[0-9]{2}/);
                            if (match) yearVal = match[0];
                        }

                        let parts = [`school.eq.${db.school}`];
                        if (gradeVal) parts.push(`grade.eq.${gradeVal}`);
                        if (yearVal) parts.push(`year.eq.${yearVal}`);
                        if (db.subject) parts.push(`subject.eq.${db.subject}`);

                        return `and(${parts.join(',')})`;
                    });

                    if (orConditions.length > 0) {
                        query = query.or(orConditions.join(','));
                    }

                    const { data } = await query;
                    if (data) {
                        data.forEach((q: any) => {
                            if (q.subject && q.unit) {
                                // Normalize subject if slightly different? Assume exact match to ORDER or add to '기타'?
                                // If subject is not in ORDER, we skip it or add to a 'Others'?
                                // For now, simple match.
                                if (skeleton[q.subject]) {
                                    skeleton[q.subject].add(q.unit);
                                }
                            }
                        });
                    }
                }
            } else if (dbFilter) {
                // Global mode logic (optional, rarely used now)
            }

            // 3. Flatten to Array
            const newTree: TreeNode[] = SUBJECT_ORDER.map(sub => {
                const units = Array.from(skeleton[sub] || []);
                const presetList = UNIT_PRESETS[sub] || [];
                units.sort((a, b) => {
                    const idxA = presetList.indexOf(a);
                    const idxB = presetList.indexOf(b);
                    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
                    if (idxA !== -1) return -1;
                    if (idxB !== -1) return 1;
                    return a.localeCompare(b);
                });

                return {
                    subject: sub,
                    units,
                    isExpanded: false // Start collapsed
                };
            }).filter(node => node.units.length > 0);

            setTreeData(newTree);
            setLoadingUnits(false);
        };

        fetchTree();
    }, [selectedDbIds, dbFilter, purchasedDbs]);

    // Emit changes
    useEffect(() => {
        onFilterChange({
            units: selectedUnits,
            difficulty: selectedDifficulty,
            subjects: [], // Empty subjects implies we rely on units for granularity
            keywords: activeKeywords
        });
    }, [selectedUnits, selectedDifficulty, activeKeywords]);

    const toggleSelection = (list: string[], item: string, setList: (L: string[]) => void) => {
        if (list.includes(item)) {
            setList(list.filter(i => i !== item));
        } else {
            setList([...list, item]);
        }
    };

    return (
        <div className="w-64 bg-white border-r flex flex-col h-full">
            <div className="p-4 border-b">
                <h2 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                    <Filter size={18} /> 상세 필터
                </h2>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-6">

                {/* 0. Subject / Unit Tree */}
                <div>
                    <h3 className="text-xs font-bold text-slate-500 uppercase mb-2">과목 및 단원</h3>
                    <div className="space-y-4">
                        {loadingUnits && <div className="text-xs text-slate-400">로딩중...</div>}
                        {!loadingUnits && treeData.length === 0 && (
                            <div className="text-xs text-slate-400">표시할 과목이 없습니다.</div>
                        )}
                        {treeData.map((node) => {
                            // Check if all units are selected
                            const allSelected = node.units.length > 0 && node.units.every(u => selectedUnits.includes(u));
                            const someSelected = node.units.some(u => selectedUnits.includes(u));

                            return (
                                <div key={node.subject} className="space-y-1">
                                    {/* Subject Header */}
                                    <div className="flex items-center justify-between group">
                                        <div className="flex items-center gap-2">
                                            {/* Checkbox: Selection Only */}
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    // Toggle All Units for this subject
                                                    if (allSelected) {
                                                        // Deselect all
                                                        setSelectedUnits(prev => prev.filter(u => !node.units.includes(u)));
                                                    } else {
                                                        // Select all
                                                        const newUnits = new Set(selectedUnits);
                                                        node.units.forEach(u => newUnits.add(u));
                                                        setSelectedUnits(Array.from(newUnits));
                                                    }
                                                }}
                                                className={`w-4 h-4 border rounded flex items-center justify-center transition-colors ${allSelected ? 'bg-indigo-600 border-indigo-600' :
                                                    someSelected ? 'bg-indigo-50 border-indigo-400' : 'border-slate-300'
                                                    }`}
                                            >
                                                {allSelected && <Check size={12} className="text-white" />}
                                                {!allSelected && someSelected && <div className="w-2 h-2 bg-indigo-500 rounded-sm" />}
                                            </button>

                                            {/* Subject Text: Expansion Only */}
                                            <button
                                                onClick={() => {
                                                    setTreeData(prev => prev.map(n => n.subject === node.subject ? { ...n, isExpanded: !n.isExpanded } : n));
                                                }}
                                                className="text-sm font-bold text-slate-800 hover:text-indigo-600 transition-colors"
                                            >
                                                {node.subject}
                                            </button>
                                        </div>

                                        {/* Chevron: Expansion Only */}
                                        <button
                                            onClick={() => {
                                                setTreeData(prev => prev.map(n => n.subject === node.subject ? { ...n, isExpanded: !n.isExpanded } : n));
                                            }}
                                            className="text-slate-400 hover:text-indigo-500"
                                        >
                                            {node.isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                                        </button>
                                    </div>

                                    {/* Units List */}
                                    {node.isExpanded && (
                                        <div className="pl-6 space-y-1 border-l-2 border-slate-100 ml-2 mt-1">
                                            {node.units.map(unit => (
                                                <label key={unit} className="flex items-start gap-2 cursor-pointer group py-1 hover:bg-slate-50 rounded px-1 -ml-1">
                                                    <div className={`mt-0.5 w-3.5 h-3.5 border rounded flex items-center justify-center flex-shrink-0 transition-colors ${selectedUnits.includes(unit) ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300 group-hover:border-indigo-400'
                                                        }`}>
                                                        {selectedUnits.includes(unit) && <Check size={10} className="text-white" />}
                                                    </div>
                                                    <input
                                                        type="checkbox"
                                                        className="hidden"
                                                        checked={selectedUnits.includes(unit)}
                                                        onChange={() => toggleSelection(selectedUnits, unit, setSelectedUnits)}
                                                    />
                                                    <span className={`text-xs ${selectedUnits.includes(unit) ? 'text-indigo-700 font-medium' : 'text-slate-600'}`}>
                                                        {unit}
                                                    </span>
                                                </label>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* 1. Difficulty (1-10) */}
                <div>
                    <h3 className="text-xs font-bold text-slate-500 uppercase mb-4 flex justify-between">
                        <span>난이도</span>
                        <span className="text-indigo-600 font-normal">
                            {selectedDifficulty.length > 0 ? (
                                selectedDifficulty.length === 10 ? '전체' :
                                    `${Math.min(...selectedDifficulty.map(Number))} ~ ${Math.max(...selectedDifficulty.map(Number))}`
                            ) : '선택 안함'}
                        </span>
                    </h3>
                    <div className="grid grid-cols-5 gap-2 px-1">
                        {Array.from({ length: 10 }, (_, i) => i + 1).map(num => {
                            const strNum = num.toString();
                            const isSelected = selectedDifficulty.includes(strNum);
                            return (
                                <button
                                    key={num}
                                    onClick={() => toggleSelection(selectedDifficulty, strNum, setSelectedDifficulty)}
                                    className={`h-8 text-xs rounded border transition-all font-bold ${isSelected
                                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                                        : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'
                                        }`}
                                >
                                    {num}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* 2. Keyword Search */}
                <div>
                    <h3 className="text-xs font-bold text-slate-500 uppercase mb-2">키워드 검색</h3>
                    <div className="space-y-2">
                        <input
                            type="text"
                            value={keywordInput}
                            onChange={(e) => setKeywordInput(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    e.preventDefault();
                                    const val = keywordInput.trim();
                                    if (val && !activeKeywords.includes(val)) {
                                        setActiveKeywords([...activeKeywords, val]);
                                        setKeywordInput('');
                                    }
                                }
                            }}
                            placeholder="단어 입력 후 Enter..."
                            className="w-full text-sm p-2 border border-slate-200 rounded focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                        />

                        {activeKeywords.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                                {activeKeywords.map(keyword => (
                                    <span
                                        key={keyword}
                                        onClick={() => setActiveKeywords(activeKeywords.filter(k => k !== keyword))}
                                        className="bg-indigo-50 text-indigo-700 text-xs px-2 py-1 rounded border border-indigo-100 cursor-pointer hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors flex items-center gap-1"
                                    >
                                        #{keyword}
                                        <Check size={10} className="opacity-50" />
                                    </span>
                                ))}
                            </div>
                        )}
                        <p className="text-[10px] text-slate-400">
                            * 입력한 모든 단어가 포함된 문제만 검색됩니다.
                        </p>
                    </div>
                </div>

            </div>
        </div>
    );
}
