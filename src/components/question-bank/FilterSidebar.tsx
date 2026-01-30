'use client';

import React, { useState, useEffect } from 'react';
import { Filter, ChevronDown, ChevronRight, Check } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';

export interface FilterState {
    units: string[];
    difficulty: string[];
    questionType: string[];
}

interface FilterSidebarProps {
    dbFilter: any; // Context of selected DB (school, grade, etc.)
    onFilterChange: (filters: FilterState) => void;
}

export default function FilterSidebar({ dbFilter, onFilterChange }: FilterSidebarProps) {
    const [units, setUnits] = useState<string[]>([]);
    const [loadingUnits, setLoadingUnits] = useState(false);

    // Filter States
    const [selectedUnits, setSelectedUnits] = useState<string[]>([]);
    const [selectedDifficulty, setSelectedDifficulty] = useState<string[]>([]); // Strings "1".."10"
    const [selectedTypes, setSelectedTypes] = useState<string[]>([]);

    const supabase = createClient();

    // Fetch Units when DB changes
    useEffect(() => {
        if (!dbFilter) {
            setUnits([]);
            return;
        }

        const fetchUnits = async () => {
            setLoadingUnits(true);
            // Fetch distinct units based on DB context (School, Grade, Semester, Subject)
            let query = supabase
                .from('questions')
                .select('unit')
                .eq('work_status', 'sorted');

            if (dbFilter.school) query = query.eq('school', dbFilter.school);
            if (dbFilter.grade) query = query.eq('grade', dbFilter.grade);
            if (dbFilter.subject) query = query.ilike('subject', `%${dbFilter.subject}%`);
            // Add year/semester logic matches parent page

            const { data, error } = await query;

            if (data) {
                // Unique units
                const uniqueUnits = Array.from(new Set(data.map(q => q.unit).filter(Boolean)));
                setUnits(uniqueUnits.sort());
            }
            setLoadingUnits(false);
        };

        fetchUnits();
    }, [dbFilter]);

    // Emit changes
    useEffect(() => {
        onFilterChange({
            units: selectedUnits,
            difficulty: selectedDifficulty,
            questionType: selectedTypes
        });
    }, [selectedUnits, selectedDifficulty, selectedTypes]);

    const toggleSelection = (list: string[], item: string, setList: (L: string[]) => void) => {
        if (list.includes(item)) {
            setList(list.filter(i => i !== item));
        } else {
            setList([...list, item]);
        }
    };

    const TYPES = ['객관식', '주관식'];

    return (
        <div className="w-64 bg-white border-r flex flex-col h-full">
            <div className="p-4 border-b">
                <h2 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                    <Filter size={18} /> 상세 필터
                </h2>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-6">

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

                {/* 2. Type */}
                <div>
                    <h3 className="text-xs font-bold text-slate-500 uppercase mb-2">문제 유형</h3>
                    <div className="space-y-2">
                        {TYPES.map(type => (
                            <label key={type} className="flex items-center gap-2 cursor-pointer group">
                                <div className={`w-4 h-4 border rounded flex items-center justify-center transition-colors ${selectedTypes.includes(type) ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300 group-hover:border-indigo-400'
                                    }`}>
                                    {selectedTypes.includes(type) && <Check size={12} className="text-white" />}
                                </div>
                                <input
                                    type="checkbox"
                                    className="hidden"
                                    checked={selectedTypes.includes(type)}
                                    onChange={() => toggleSelection(selectedTypes, type, setSelectedTypes)}
                                />
                                <span className={`text-sm ${selectedTypes.includes(type) ? 'text-indigo-700 font-medium' : 'text-slate-600'}`}>
                                    {type}
                                </span>
                            </label>
                        ))}
                    </div>
                </div>

                {/* 3. Units */}
                <div>
                    <h3 className="text-xs font-bold text-slate-500 uppercase mb-2">단원</h3>
                    {loadingUnits ? (
                        <div className="text-xs text-slate-400">단원 정보 로딩중...</div>
                    ) : units.length === 0 ? (
                        <div className="text-xs text-slate-400">선택된 DB에서 단원 정보를 찾을 수 없습니다.</div>
                    ) : (
                        <div className="space-y-1">
                            {units.map(unit => (
                                <label key={unit} className="flex items-start gap-2 cursor-pointer group p-1 hover:bg-slate-50 rounded">
                                    <div className={`mt-0.5 w-4 h-4 border rounded flex items-center justify-center flex-shrink-0 transition-colors ${selectedUnits.includes(unit) ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300 group-hover:border-indigo-400'
                                        }`}>
                                        {selectedUnits.includes(unit) && <Check size={12} className="text-white" />}
                                    </div>
                                    <input
                                        type="checkbox"
                                        className="hidden"
                                        checked={selectedUnits.includes(unit)}
                                        onChange={() => toggleSelection(selectedUnits, unit, setSelectedUnits)}
                                    />
                                    <span className={`text-sm leading-tight ${selectedUnits.includes(unit) ? 'text-indigo-700 font-medium' : 'text-slate-600'}`}>
                                        {unit}
                                    </span>
                                </label>
                            ))}
                        </div>
                    )}
                </div>

            </div>
        </div>
    );
}
