'use client';

import { useState } from 'react';

export default function AutoGenModal({
    onClose,
    onGenerate
}: {
    onClose: () => void,
    onGenerate: (criteria: any) => void
}) {
    const [subject, setSubject] = useState('Math');
    const [count, setCount] = useState(10);
    const [difficulty, setDifficulty] = useState('Medium');
    const [generating, setGenerating] = useState(false);

    const handleSubmit = async () => {
        setGenerating(true);
        try {
            const res = await fetch('/api/pro/auto-generate', {
                method: 'POST',
                body: JSON.stringify({ subject, difficulty, count }),
            });
            const data = await res.json();
            onGenerate(data.questions);
            onClose();
        } catch (e) {
            alert('생성 실패');
        } finally {
            setGenerating(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
            <div className="bg-white rounded-lg shadow-xl p-6 w-96">
                <h3 className="font-bold text-lg mb-4">⚡ 자동 시험지 생성</h3>

                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-semibold mb-1">과목</label>
                        <select className="w-full border p-2 rounded" value={subject} onChange={e => setSubject(e.target.value)}>
                            <option value="Math">수학</option>
                            <option value="English">영어</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-semibold mb-1">난이도</label>
                        <select className="w-full border p-2 rounded" value={difficulty} onChange={e => setDifficulty(e.target.value)}>
                            <option value="Easy">하</option>
                            <option value="Medium">중</option>
                            <option value="Hard">상</option>
                            <option value="Killer">최상(킬러)</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-semibold mb-1">문항 수: {count}문제</label>
                        <input
                            type="range" min="5" max="30" step="5"
                            className="w-full"
                            value={count}
                            onChange={e => setCount(Number(e.target.value))}
                        />
                    </div>
                </div>

                <div className="mt-6 flex justify-end gap-2">
                    <button onClick={onClose} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded">취소</button>
                    <button
                        onClick={handleSubmit}
                        disabled={generating}
                        className="px-4 py-2 bg-purple-600 text-white font-bold rounded hover:bg-purple-700 disabled:opacity-50"
                    >
                        {generating ? '생성 중...' : '자동 생성 시작'}
                    </button>
                </div>
            </div>
        </div>
    );
}
