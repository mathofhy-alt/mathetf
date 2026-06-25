'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Filter, ChevronDown, ChevronRight, Check } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import { CONCEPT_MAP } from '@/lib/concept-map';
import { SUBJECT_UNITS, CURRICULA } from '@/lib/curriculum';

export interface FilterState {
    units: string[];
    concepts: string[];
    difficulty: string[];
    // questionType removed
    subjects: string[]; // Keep for compatibility, though we prioritize units
    keywords: string[];
}

const SUBJECT_ORDER = [
    '공통수학1', '공통수학2', '대수', '미적분I', '미적분II', '확률과통계', '기하와벡터',
    '수학(상)', '수학(하)', '수학I', '수학II', '미적분'
];

// 단원 목록 = curriculum.ts 단일 소스 (DB 단원명과 일치). 하드코딩 옛 이름 제거.
const UNIT_PRESETS: Record<string, string[]> = SUBJECT_UNITS;

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

// 초기 트리 = curriculum.ts 단원 목록(단일 소스) + CONCEPT_MAP 개념태그(있으면)
const buildDefaultTree = (): TreeNode[] => {
    return SUBJECT_ORDER.filter(sub => (UNIT_PRESETS[sub] || []).length > 0).map(sub => {
        const unitNodes: UnitNode[] = (UNIT_PRESETS[sub] || []).map((uName) => ({
            name: uName,
            concepts: (CONCEPT_MAP[sub] as Record<string, string[]> | undefined)?.[uName] || [],
            isExpanded: false
        }));
        return { subject: sub, unitNodes, isExpanded: false };
    }).filter(node => node.unitNodes.length > 0);
};

export default function FilterSidebar({ dbFilter, selectedDbIds, purchasedDbs, onFilterChange }: FilterSidebarProps) {
    const [treeData, setTreeData] = useState<TreeNode[]>(() => buildDefaultTree());
    const [loadingUnits, setLoadingUnits] = useState(false);
    // 캐시 맵: 같은 DB 조합은 두 번째부터 즉시 반환 (DB 조회 0회)
    const treeCache = useRef<Record<string, TreeNode[]>>({});

    // Filter States
    const [selectedUnits, setSelectedUnits] = useState<string[]>([]);
    const [selectedConcepts, setSelectedConcepts] = useState<string[]>([]);
    const [selectedDifficulty, setSelectedDifficulty] = useState<string[]>([]); // Strings "1".."10"
    const [keywordInput, setKeywordInput] = useState('');
    const [activeKeywords, setActiveKeywords] = useState<string[]>([]);
    // selectedTypes removed
    // 교육과정 선택 (기본: 현 교육과정 2022). 선택한 과정 과목만 표시.
    const [curriculum, setCurriculum] = useState<string>('2022');
    const curSubjects = (CURRICULA.find(c => c.id === curriculum)?.subjects || []) as readonly string[];

    const supabase = createClient();

    // Fetch Tree Data - DB 선택 시에만 필터링, 미선택 시 CONCEPT_MAP 기본 트리 사용
    useEffect(() => {
        // DB 미선택 → 즉시 기본 트리로 복원 (로딩 없음)
        if (!selectedDbIds || selectedDbIds.length === 0) {
            setTreeData(buildDefaultTree());
            return;
        }

        const fetchTree = async () => {
            // DB목록(purchasedDbs) 로드 전이면 대기 — 빈 트리 캐시 오염 방지 (로드되면 deps로 재호출)
            if (!purchasedDbs || purchasedDbs.length === 0) return;
            // 캐시 키: 선택된 DB ID 조합 (안정적 문자열)
            const cacheKey = [...selectedDbIds].sort().join(',');

            // 쮨시 히트 → DB 조회 없이 즉시 반환
            if (treeCache.current[cacheKey]) {
                setTreeData(treeCache.current[cacheKey]);
                return;
            }

            setLoadingUnits(true);

            const skeleton: Record<string, Record<string, Set<string>>> = {};
            const unitTotal: Record<string, Record<string, number>> = {};        // 단원별 문항수
            const conceptCount: Record<string, Record<string, Record<string, number>>> = {}; // 단원별 개념 등장횟수
            SUBJECT_ORDER.forEach(sub => {
                skeleton[sub] = {}; unitTotal[sub] = {}; conceptCount[sub] = {};
                (UNIT_PRESETS[sub] || []).forEach(u => {
                    skeleton[sub][u] = new Set<string>();
                    unitTotal[sub][u] = 0; conceptCount[sub][u] = {};
                });
            });

            if (purchasedDbs) {
                const selectedDbs = purchasedDbs.filter(d => selectedDbIds.includes(d.id));

                if (selectedDbs.length > 0) {
                    // 필터 옵션(과목/단원/개념)은 서버(/api/questions/facets)에서 조회. (아래 fetch)
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    const _unusedOrConditions = selectedDbs.map(db => {
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
                            const MOCK_SELECT_SUBJECTS = ['기하와벡터', '미적분II', '확률과통계', '확률과 통계'];
                            const isMockSelect = (db.exam_type === '모의고사' || db.exam_type === '수능')
                                && MOCK_SELECT_SUBJECTS.includes(db.subject);
                            if (isMockSelect) {
                                parts.push(`subject.in.("\ub300\uc218","\ubbf8\uc801\ubd84I","${db.subject}")`);
                            } else {
                                parts.push(`subject.eq.${db.subject}`);
                            }
                        }

                        return `and(${parts.join(',')})` ;
                    });

                    const facetRes = await fetch('/api/questions/facets', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ selectedDbs, purchasedDbsCount: purchasedDbs?.length || 0 }),
                    });
                    const facetJson = await facetRes.json().catch(() => ({ data: [] }));
                    const data = facetJson?.data;
                    if (data) {
                        data.forEach((q: any) => {
                            if (q.subject && q.unit) {
                                if (!skeleton[q.subject]) { skeleton[q.subject] = {}; unitTotal[q.subject] = {}; conceptCount[q.subject] = {}; }
                                if (!skeleton[q.subject][q.unit]) { skeleton[q.subject][q.unit] = new Set<string>(); unitTotal[q.subject][q.unit] = 0; conceptCount[q.subject][q.unit] = {}; }
                                unitTotal[q.subject][q.unit] += 1;
                                // 개념태그는 DB 실제 key_concepts 기준 + 등장횟수 집계 (빈도 필터로 교차개념 제거)
                                if (Array.isArray(q.key_concepts)) {
                                    q.key_concepts.forEach((tag: string) => {
                                        if (tag) {
                                            skeleton[q.subject][q.unit].add(tag);
                                            conceptCount[q.subject][q.unit][tag] = (conceptCount[q.subject][q.unit][tag] || 0) + 1;
                                        }
                                    });
                                }
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

                const unitNodes: UnitNode[] = unitNames.map(uName => {
                    const total = unitTotal[sub]?.[uName] || 0;
                    const counts = conceptCount[sub]?.[uName] || {};
                    // 그 단원에서 충분히(≥5%, 최소 2회) 나오는 개념만 → 융합문제의 교차개념 노이즈 제거
                    const threshold = Math.max(2, Math.ceil(total * 0.05));
                    const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
                    let concepts = entries.filter(([, n]) => n >= threshold).map(([c]) => c);
                    // 임계 넘는 게 없으면(소수 문항 단원) 빈도 상위 일부라도 노출
                    if (concepts.length === 0 && entries.length > 0) concepts = entries.slice(0, 8).map(([c]) => c);
                    return { name: uName, concepts, isExpanded: false };
                });

                return {
                    subject: sub,
                    unitNodes,
                    isExpanded: false
                };
            }).filter(node => node.unitNodes.length > 0);

            // 쮨시 저장 → 다음번 같은 DB 조합 선택 시 즉시 반환
            treeCache.current[cacheKey] = newTree;
            setTreeData(newTree);
            setLoadingUnits(false);
        };

        fetchTree();
        // purchasedDbs?.length 도 의존: DB목록이 늦게 로드돼도 facets 재호출(경쟁조건 수정)
    }, [selectedDbIds?.join(','), purchasedDbs?.length]);


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
                    {/* 교육과정 선택 — 선택한 과정의 과목만 표시 (기본: 현 교육과정 2022) */}
                    <div className="flex gap-1 mb-3 bg-slate-100 p-0.5 rounded-lg">
                        {CURRICULA.map((c) => (
                            <button
                                key={c.id}
                                onClick={() => setCurriculum(c.id)}
                                className={`flex-1 text-[11px] font-bold py-1.5 rounded-md transition-colors ${curriculum === c.id ? 'bg-white text-[#497AB7] shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                {c.label.replace(' 교육과정', '')}
                            </button>
                        ))}
                    </div>
                    <div className="space-y-4">
                        {loadingUnits && <div className="text-xs text-slate-400">로딩중...</div>}
                        {!loadingUnits && treeData.filter((n) => curSubjects.includes(n.subject)).length === 0 && (
                            <div className="text-xs text-slate-400">표시할 과목이 없습니다.</div>
                        )}
                        {curSubjects.map((subj) => treeData.find((n) => n.subject === subj)).filter((node): node is TreeNode => !!node).map((node) => {
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
