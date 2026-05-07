'use client';

import React, { useState, useEffect } from 'react';
import { Filter, ChevronDown, ChevronRight, Check } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import { CONCEPT_MAP } from '@/lib/concept-map';

export interface FilterState {
    units: string[];
    concepts: string[];
    difficulty: string[];
    // questionType removed
    subjects: string[]; // Keep for compatibility, though we prioritize units
    keywords: string[];
}

const SUBJECT_ORDER = [
    '공통수학1', '공통수학2', 
    '수학(상)', '수학(하)', '수학I', '수학II', 
    '대수', '미적분I', '미적분II', 
    '기하와벡터', '확률과통계'
];

const UNIT_PRESETS: Record<string, string[]> = {
    '공통수학1': ['다항식', '항등식', '복소수', '이차방정식', '이차함수', '여러가지방정식', '여러가지부등식', '순열조합', '행렬'],
    '공통수학2': ['평면좌표', '직선의방정식', '원의방정식', '도형의이동', '집합', '명제', '절대부등식', '함수', '합성함수와역함수', '유리함수', '무리함수'],
    '대수': ['지수', '로그', '지수로그함수', '지수로그함수활용', '삼각함수정의', '삼각함수그래프', '사인코사인법칙', '등차등비수열', '수열의합', '귀납법'],
    '미적분I': ['함수의극한', '함수의연속', '미분계수와도함수', '도함수의활용(1)', '도함수의활용(2)', '도함수의활용(3)', '부정적분', '정적분', '정적분의활용'],
    '미적분II': ['수열의극한', '급수', '지수함수와로그함수의미분', '삼각함수의미분', '여러가지미분법', '도함수의활용(1)', '도함수의활용(2)', '여러가지적분법', '정적분', '정적분의활용'],
    '기하와벡터': ['이차곡선-포물선', '이차곡선-타원', '이차곡선-쌍곡선', '평면벡터-벡터연산', '평면벡터-성분과내적', '공간도형', '공간좌표'],
    '확률과통계': ['순열과조합-여러가지순열', '순열과조합-중복조합', '순열과조합-이항정리', '확률의뜻과활용-확률의뜻', '확률의뜻과활용-확률의덧셈정리', '확률의뜻과활용-조건부확률', '확률의뜻과활용-독립종속', '확률분포-확률변수와확률분포', '확률분포-이산확률변수', '확률분포-이항분포', '확률분포-정규분포', '확률분포-모집단과표본', '확률분포-모평균추정']
};

interface UnitNode {
    name: string;
    concepts: string[];
    isExpanded: boolean;
}

interface TreeNode {
    subject: string;
    unitNodes: UnitNode[];
    isExpanded: boolean;
}

interface FilterSidebarProps {
    dbFilter?: any; // Legacy simple filter (optional)
    selectedDbIds?: string[]; // List of selected personal DBs
    purchasedDbs?: any[]; // Full DB objects to cross-reference IDs if needed
    onFilterChange: (filters: FilterState) => void;
}

// CONCEPT_MAP으로 초기 트리 즉시 생성 (로딩 없음)
const buildDefaultTree = (): TreeNode[] => {
    return SUBJECT_ORDER.filter(sub => CONCEPT_MAP[sub]).map(sub => {
        const unitMap = CONCEPT_MAP[sub] as Record<string, string[]>;
        const unitNodes: UnitNode[] = Object.entries(unitMap).map(([uName, tags]) => ({
            name: uName,
            concepts: tags,
            isExpanded: false
        }));
        return { subject: sub, unitNodes, isExpanded: false };
    }).filter(node => node.unitNodes.length > 0);
};

export default function FilterSidebar({ dbFilter, selectedDbIds, purchasedDbs, onFilterChange }: FilterSidebarProps) {
    const [treeData, setTreeData] = useState<TreeNode[]>(() => buildDefaultTree());
    const [loadingUnits, setLoadingUnits] = useState(false);


    // Filter States
    const [selectedUnits, setSelectedUnits] = useState<string[]>([]);
    const [selectedConcepts, setSelectedConcepts] = useState<string[]>([]);
    const [selectedDifficulty, setSelectedDifficulty] = useState<string[]>([]); // Strings "1".."10"
    const [keywordInput, setKeywordInput] = useState('');
    const [activeKeywords, setActiveKeywords] = useState<string[]>([]);
    // selectedTypes removed

    const supabase = createClient();

    // Fetch Tree Data - DB 선택 시에만 필터링, 미선택 시 CONCEPT_MAP 기본 트리 사용
    useEffect(() => {
        // DB 미선택 → 즉시 기본 트리로 복원 (로딩 없음)
        if (!selectedDbIds || selectedDbIds.length === 0) {
            setTreeData(buildDefaultTree());
            return;
        }

        const fetchTree = async () => {
            setLoadingUnits(true);

            const skeleton: Record<string, Record<string, Set<string>>> = {};
            SUBJECT_ORDER.forEach(sub => {
                skeleton[sub] = {};
                (UNIT_PRESETS[sub] || []).forEach(u => {
                    skeleton[sub][u] = new Set<string>();
                });
            });

            if (purchasedDbs) {
                const selectedDbs = purchasedDbs.filter(d => selectedDbIds.includes(d.id));

                if (selectedDbs.length > 0) {
                    let query = supabase.from('questions').select('subject, unit, key_concepts').eq('work_status', 'sorted');

                    const orConditions = selectedDbs.map(db => {
                        let gradeVal = db.grade;
                        if (['1', '2', '3'].includes(String(db.grade))) {
                            gradeVal = `고${db.grade}`;
                        } else if (typeof db.grade === 'string' && !db.grade.startsWith('고') && !isNaN(Number(db.grade))) {
                            gradeVal = `고${db.grade}`;
                        }

                        const titleYear = db.title?.match(/20\d{2}/)?.[0];
                        let yearVal = titleYear ? titleYear : (db.exam_year || db.year);

                        let parts = [`school.eq.${db.school}`];
                        if (gradeVal) parts.push(`grade.eq.${gradeVal}`);
                        if (yearVal) parts.push(`year.eq.${yearVal}`);

                        if (db.semester && db.exam_type) {
                            const semNum = String(db.semester).replace('학기', '');
                            const typeShort = db.exam_type.includes('중간') ? '중간' : (db.exam_type.includes('기말') ? '기말' : '');
                            if (typeShort) {
                                parts.push(`semester.eq.${semNum}학기${typeShort}`);
                            }
                        } else if (db.semester) {
                            const semNum = String(db.semester).replace('학기', '');
                            parts.push(`semester.ilike.${semNum}학기%`);
                        }

                        if (db.subject && db.subject !== '전과정') {
                            // 모의고사/수능 선택과목 DB: 공통(대수+미적분I) + 선택과목 함께 조회
                            const MOCK_SELECT_SUBJECTS = ['기하와벡터', '미적분II', '확률과통계', '확률과 통계'];
                            const isMockSelect = (db.exam_type === '모의고사' || db.exam_type === '수능')
                                && MOCK_SELECT_SUBJECTS.includes(db.subject);
                            if (isMockSelect) {
                                parts.push(`subject.in.("대수","미적분I","${db.subject}")`);
                            } else {
                                parts.push(`subject.eq.${db.subject}`);
                            }
                        }

                        return `and(${parts.join(',')})` ;
                    });

                    if (orConditions.length > 0) {
                        query = query.or(orConditions.join(','));
                    }

                    const { data } = await query;
                    if (data) {
                        data.forEach((q: any) => {
                            if (q.subject && q.unit) {
                                if (!skeleton[q.subject]) skeleton[q.subject] = {};
                                if (!skeleton[q.subject][q.unit]) skeleton[q.subject][q.unit] = new Set<string>();
                                const presetTags = CONCEPT_MAP[q.subject]?.[q.unit] || [];
                                presetTags.forEach((tag: string) => skeleton[q.subject][q.unit].add(tag));
                            }
                        });
                    }
                }
            }

            // Flatten to Array
            const newTree: TreeNode[] = SUBJECT_ORDER.map(sub => {
                const unitMap = skeleton[sub] || {};
                const unitNames = Object.keys(unitMap);
                const presetList = UNIT_PRESETS[sub] || [];

                unitNames.sort((a, b) => {
                    const idxA = presetList.indexOf(a);
                    const idxB = presetList.indexOf(b);
                    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
                    if (idxA !== -1) return -1;
                    if (idxB !== -1) return 1;
                    return a.localeCompare(b);
                });

                const unitNodes: UnitNode[] = unitNames.map(uName => ({
                    name: uName,
                    concepts: Array.from(unitMap[uName]).sort(),
                    isExpanded: false
                }));

                return {
                    subject: sub,
                    unitNodes,
                    isExpanded: false
                };
            }).filter(node => node.unitNodes.length > 0);

            setTreeData(newTree);
            setLoadingUnits(false);
        };

        fetchTree();
    }, [selectedDbIds, dbFilter, purchasedDbs]);


    // Emit changes
    useEffect(() => {
        onFilterChange({
            units: selectedUnits,
            concepts: selectedConcepts.map(c => c.startsWith('#') ? c : `#${c}`), // DB는 #태그 형식으로 저장
            difficulty: selectedDifficulty,
            subjects: [],
            keywords: activeKeywords
        });
    }, [selectedUnits, selectedConcepts, selectedDifficulty, activeKeywords]);

    const toggleSelection = (list: string[], item: string, setList: (L: string[]) => void) => {
        if (list.includes(item)) {
            setList(list.filter(i => i !== item));
        } else {
            setList([...list, item]);
        }
    };

    return (
        <div className="w-full md:w-64 bg-white md:border-r flex flex-col md:h-full">
            <div className="hidden md:block p-4 border-b">
                <h2 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                    <Filter size={18} /> 상세 필터
                </h2>
            </div>

            <div className="flex-1 md:overflow-y-auto p-3 md:p-4 space-y-5 md:space-y-6">

                {/* 0. Subject / Unit Tree */}
                <div>
                    <h3 className="text-xs font-bold text-slate-500 uppercase mb-2">과목 및 단원</h3>
                    <div className="space-y-4">
                        {loadingUnits && <div className="text-xs text-slate-400">로딩중...</div>}
                        {!loadingUnits && treeData.length === 0 && (
                            <div className="text-xs text-slate-400">표시할 과목이 없습니다.</div>
                        )}
                        {treeData.map((node) => {
                            // Subject selection logic
                            const allUnitsInNode = node.unitNodes.map(un => un.name);
                            const allUnitsSelected = allUnitsInNode.length > 0 && allUnitsInNode.every(u => selectedUnits.includes(u));
                            const someUnitsSelected = allUnitsInNode.some(u => selectedUnits.includes(u));

                            return (
                                <div key={node.subject} className="space-y-1">
                                    {/* Level 1: Subject Header */}
                                    <div className="flex items-center justify-between group">
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (allUnitsSelected) {
                                                        setSelectedUnits(prev => prev.filter(u => !allUnitsInNode.includes(u)));
                                                    } else {
                                                        const newUnits = new Set(selectedUnits);
                                                        allUnitsInNode.forEach(u => newUnits.add(u));
                                                        setSelectedUnits(Array.from(newUnits));
                                                    }
                                                }}
                                                className={`w-4 h-4 border rounded flex items-center justify-center transition-colors ${allUnitsSelected ? 'bg-indigo-600 border-indigo-600' :
                                                    someUnitsSelected ? 'bg-indigo-50 border-indigo-400' : 'border-slate-300'
                                                    }`}
                                            >
                                                {allUnitsSelected && <Check size={12} className="text-white" />}
                                                {!allUnitsSelected && someUnitsSelected && <div className="w-2 h-2 bg-indigo-500 rounded-sm" />}
                                            </button>

                                            <button
                                                onClick={() => {
                                                    setTreeData(prev => prev.map(n => n.subject === node.subject ? { ...n, isExpanded: !n.isExpanded } : n));
                                                }}
                                                className="text-sm font-bold text-slate-800 hover:text-indigo-600 transition-colors"
                                            >
                                                {node.subject}
                                            </button>
                                        </div>

                                        <button
                                            onClick={() => {
                                                setTreeData(prev => prev.map(n => n.subject === node.subject ? { ...n, isExpanded: !n.isExpanded } : n));
                                            }}
                                            className="text-slate-400 hover:text-indigo-500"
                                        >
                                            {node.isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                                        </button>
                                    </div>

                                    {/* Level 2: Units List */}
                                    {node.isExpanded && (
                                        <div className="pl-4 space-y-1 border-l border-slate-100 ml-2 mt-1">
                                            {node.unitNodes.map(uNode => {
                                                const isUnitSelected = selectedUnits.includes(uNode.name);
                                                const allConceptsSelected = uNode.concepts.length > 0 && uNode.concepts.every(c => selectedConcepts.includes(c));
                                                const someConceptsSelected = uNode.concepts.some(c => selectedConcepts.includes(c));

                                                return (
                                                    <div key={uNode.name} className="space-y-1">
                                                        <div className="flex items-center justify-between group py-0.5">
                                                            <div className="flex items-center gap-2">
                                                                <button
                                                                    onClick={() => {
                                                                        toggleSelection(selectedUnits, uNode.name, setSelectedUnits);
                                                                    }}
                                                                    className={`w-3.5 h-3.5 border rounded flex items-center justify-center transition-colors ${isUnitSelected ? 'bg-indigo-500 border-indigo-500' : 'border-slate-300'}`}
                                                                >
                                                                    {isUnitSelected && <Check size={10} className="text-white" />}
                                                                </button>
                                                                <button
                                                                    onClick={() => {
                                                                        setTreeData(prev => prev.map(n => n.subject === node.subject ? {
                                                                            ...n,
                                                                            unitNodes: n.unitNodes.map(un => un.name === uNode.name ? { ...un, isExpanded: !un.isExpanded } : un)
                                                                        } : n));
                                                                    }}
                                                                    className={`text-xs flex-1 text-left ${isUnitSelected ? 'text-indigo-700 font-bold' : 'text-slate-600'} hover:text-indigo-500 transition-colors`}
                                                                >
                                                                    {uNode.name}
                                                                </button>
                                                            </div>
                                                            {uNode.concepts.length > 0 && (
                                                                <button
                                                                    onClick={() => {
                                                                        setTreeData(prev => prev.map(n => n.subject === node.subject ? {
                                                                            ...n,
                                                                            unitNodes: n.unitNodes.map(un => un.name === uNode.name ? { ...un, isExpanded: !un.isExpanded } : un)
                                                                        } : n));
                                                                    }}
                                                                    className="text-slate-300 hover:text-indigo-400"
                                                                >
                                                                    {uNode.isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                                                </button>
                                                            )}
                                                        </div>

                                                        {/* Level 3: Tags List */}
                                                        {uNode.isExpanded && uNode.concepts.length > 0 && (
                                                            <div className="pl-5 space-y-1 border-l border-slate-50 ml-1.5 mb-2">
                                                                {uNode.concepts.map(concept => (
                                                                    <label key={concept} className="flex items-center gap-2 cursor-pointer group py-0.5">
                                                                        <div className={`w-3 h-3 border rounded flex items-center justify-center transition-colors ${selectedConcepts.includes(concept) ? 'bg-blue-500 border-blue-500' : 'border-slate-200 group-hover:border-blue-400'}`}>
                                                                            {selectedConcepts.includes(concept) && <Check size={8} className="text-white" />}
                                                                        </div>
                                                                        <input
                                                                            type="checkbox"
                                                                            className="hidden"
                                                                            checked={selectedConcepts.includes(concept)}
                                                                            onChange={() => toggleSelection(selectedConcepts, concept, setSelectedConcepts)}
                                                                        />
                                                                        <span className={`text-[11px] ${selectedConcepts.includes(concept) ? 'text-blue-600 font-medium' : 'text-slate-500'}`}>
                                                                            #{concept}
                                                                        </span>
                                                                    </label>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
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
