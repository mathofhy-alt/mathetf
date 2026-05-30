'use client';

import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';

const SUBJECTS = ['공통수학1', '공통수학2', '대수', '미적분I', '미적분II', '기하와벡터', '확률과통계'];

const UNIT_PRESETS: Record<string, string[]> = {
    '공통수학1': ['다항식', '항등식', '복소수', '이차방정식', '이차함수', '여러가지방정식', '여러가지부등식', '순열조합', '행렬'],
    '공통수학2': ['평면좌표', '직선의방정식', '원의방정식', '도형의이동', '집합', '명제', '절대부등식', '함수', '합성함수와역함수', '유리함수', '무리함수']
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

            // 미로그인 → 회원가입 페이지로 이동
            if (res.status === 401) {
                onClose();
                if (confirm('자동 시험지 생성은 회원만 이용할 수 있습니다.\n회원가입 페이지로 이동하시겠습니까?')) {
                    window.location.href = '/signup';
                }
                return;
            }

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
        <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center animate-in fade-in duration-200"
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div className="bg-white w-full sm:w-[440px] sm:rounded-2xl rounded-t-2xl shadow-2xl flex flex-col max-h-[90dvh] sm:max-h-[90vh]">
                {/* 모바일 드래그 핸들 */}
                <div className="sm:hidden flex justify-center pt-3 pb-1 flex-shrink-0">
                    <div className="w-10 h-1 rounded-full bg-slate-300" />
                </div>

                {/* 헤더 */}
                <div className="flex items-center justify-between px-6 pt-4 pb-2 flex-shrink-0">
                    <h3 className="font-bold text-xl flex items-center gap-2 text-slate-800">
                        <span>⚡</span>
                        자동 시험지 생성
                    </h3>
                    <button
                        onClick={onClose}
                        className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors text-xl font-bold"
                    >
                        ×
                    </button>
                </div>

                {/* 스크롤 가능한 본문 */}
                <div className="overflow-y-auto flex-1 px-6 pb-2">
                    <div className="space-y-5 pt-2 pb-4">
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
                </div>

                {/* 하단 버튼 - 항상 고정 */}
                <div className="flex gap-3 px-6 py-4 border-t border-slate-100 flex-shrink-0" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
                    <button
                        onClick={onClose}
                        className="flex-1 py-3 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl font-bold transition-colors border border-slate-200"
                    >
                        취소
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={generating}
                        className="flex-1 py-3 bg-purple-600 text-white font-bold rounded-xl hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg transition-all flex items-center justify-center gap-2"
                    >
                        {generating && <Loader2 size={16} className="animate-spin" />}
                        {generating ? '생성 중...' : '생성하기'}
                    </button>
                </div>
            </div>
        </div>
    );
}
