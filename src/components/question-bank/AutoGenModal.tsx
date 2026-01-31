'use client';

import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';

const SUBJECTS = ['공통수학1', '공통수학2', '대수', '미적분', '기하와벡터', '확률과통계'];

const UNIT_PRESETS: Record<string, string[]> = {
    '공통수학1': ['다항식', '항등식', '복소수', '이차방정식', '이차함수', '여러가지방정식', '여러가지부등식', '경우의수', '행렬'],
    '공통수학2': ['집합', '명제', '절대부등식', '함수', '역함수합성함수', '유리함수', '무리함수']
};

export default function AutoGenModal({
    onClose,
    onGenerate
}: {
    onClose: () => void,
    onGenerate: (criteria: any) => void
}) {
    const [subject, setSubject] = useState(SUBJECTS[0]);
    const [selectedUnits, setSelectedUnits] = useState<string[]>([]);
    const [count, setCount] = useState(20);
    const [minDiff, setMinDiff] = useState(1);
    const [maxDiff, setMaxDiff] = useState(5);
    const [generating, setGenerating] = useState(false);

    // Reset unit when subject changes
    useEffect(() => {
        setSelectedUnits([]);
    }, [subject]);

    const toggleUnit = (u: string) => {
        if (selectedUnits.includes(u)) {
            setSelectedUnits(prev => prev.filter(item => item !== u));
        } else {
            setSelectedUnits(prev => [...prev, u]);
        }
    };

    const handleSubmit = async () => {
        setGenerating(true);
        try {
            // Build criteria object
            const criteria = {
                subject,
                unit: selectedUnits.length > 0 ? selectedUnits : undefined,
                minDifficulty: minDiff,
                maxDifficulty: maxDiff,
                count
            };

            const res = await fetch('/api/pro/auto-generate', {
                method: 'POST',
                body: JSON.stringify(criteria),
            });
            const data = await res.json();

            if (data.questions && data.questions.length > 0) {
                onGenerate(data.questions);
                onClose();
            } else {
                alert('조건에 맞는 문제가 없습니다.');
            }
        } catch (e) {
            console.error(e);
            alert('생성 실패');
        } finally {
            setGenerating(false);
        }
    };

    const hasUnits = !!UNIT_PRESETS[subject];

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-2xl p-6 w-[400px]">
                <h3 className="font-bold text-xl mb-6 flex items-center gap-2 text-slate-800">
                    <span>⚡</span>
                    자동 시험지 생성
                </h3>

                <div className="space-y-5">
                    {/* Subject Selection */}
                    <div>
                        <label className="block text-sm font-bold text-slate-700 mb-2">과목</label>
                        <div className="grid grid-cols-2 gap-2">
                            {SUBJECTS.map(sub => (
                                <button
                                    key={sub}
                                    onClick={() => setSubject(sub)}
                                    className={`p-2 text-sm rounded-lg border transition-all font-medium ${subject === sub
                                        ? 'bg-purple-600 text-white border-purple-600 ring-2 ring-purple-200'
                                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                                        }`}
                                >
                                    {sub}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Conditional Unit Selection (Multi-select) */}
                    {hasUnits && (
                        <div className="animate-in slide-in-from-top-2 duration-200">
                            <label className="block text-sm font-bold text-slate-700 mb-2 flex justify-between items-center">
                                <span>단원 (중복 선택 가능)</span>
                                <span className="text-xs font-normal text-purple-600">
                                    {selectedUnits.length > 0 ? `${selectedUnits.length}개 선택됨` : '전체'}
                                </span>
                            </label>

                            <div className="flex flex-wrap gap-2 p-3 bg-slate-50 border border-slate-200 rounded-xl max-h-[120px] overflow-y-auto custom-scrollbar">
                                {UNIT_PRESETS[subject].map(u => {
                                    const isSelected = selectedUnits.includes(u);
                                    return (
                                        <button
                                            key={u}
                                            onClick={() => toggleUnit(u)}
                                            className={`px-3 py-1.5 text-xs rounded-full border transition-all font-bold ${isSelected
                                                ? 'bg-purple-100 text-purple-700 border-purple-300'
                                                : 'bg-white text-slate-500 border-slate-200 hover:border-purple-200 hover:text-purple-600'
                                                }`}
                                        >
                                            {u}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Difficulty Range (1-10) */}
                    <div>
                        <label className="block text-sm font-bold text-slate-700 mb-2">
                            난이도 범위 <span className="text-purple-600 font-normal ml-1">({minDiff} ~ {maxDiff})</span>
                        </label>
                        <div className="flex items-center gap-3">
                            <div className="flex-1">
                                <label className="text-xs text-slate-500 block mb-1">최소</label>
                                <select
                                    value={minDiff}
                                    onChange={(e) => {
                                        const val = Number(e.target.value);
                                        setMinDiff(val);
                                        if (val > maxDiff) setMaxDiff(val);
                                    }}
                                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-center font-bold focus:ring-2 focus:ring-purple-500 outline-none"
                                >
                                    {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
                                        <option key={n} value={n}>{n}</option>
                                    ))}
                                </select>
                            </div>
                            <span className="text-slate-300 mt-4">~</span>
                            <div className="flex-1">
                                <label className="text-xs text-slate-500 block mb-1">최대</label>
                                <select
                                    value={maxDiff}
                                    onChange={(e) => {
                                        const val = Number(e.target.value);
                                        setMaxDiff(val);
                                        if (val < minDiff) setMinDiff(val);
                                    }}
                                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-center font-bold focus:ring-2 focus:ring-purple-500 outline-none"
                                >
                                    {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
                                        <option key={n} value={n}>{n}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* Question Count */}
                    <div>
                        <label className="block text-sm font-bold text-slate-700 mb-2">
                            문항 수 <span className="text-slate-400 font-normal ml-1">(최대 50문제)</span>
                        </label>
                        <input
                            type="number"
                            min="1"
                            max="50"
                            className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold focus:ring-2 focus:ring-purple-500 outline-none"
                            value={count}
                            onChange={e => {
                                const val = Number(e.target.value);
                                if (val > 50) setCount(50);
                                else if (val < 0) setCount(0);
                                else setCount(val);
                            }}
                        />
                    </div>
                </div>

                {/* Actions */}
                <div className="mt-8 flex justify-end gap-3 pt-4 border-t border-slate-100">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg font-bold transition-colors"
                    >
                        취소
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={generating}
                        className="px-6 py-2 bg-purple-600 text-white font-bold rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-purple-200 transition-all flex items-center gap-2"
                    >
                        {generating && <Loader2 size={16} className="animate-spin" />}
                        {generating ? '생성 중...' : '생성하기'}
                    </button>
                </div>
            </div>
        </div>
    );
}
