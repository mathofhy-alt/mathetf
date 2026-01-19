'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import QuestionRenderer from '@/components/QuestionRenderer';

export default function AdminQuestionsPage() {
    const [questions, setQuestions] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [total, setTotal] = useState(0);

    // Filters
    const [search, setSearch] = useState('');
    const [school, setSchool] = useState('');
    const [subject, setSubject] = useState('');
    // ... filters
    const [page, setPage] = useState(1);

    // Detail & Edit Modal
    const [selectedQuestion, setSelectedQuestion] = useState<any | null>(null);
    const [previewTab, setPreviewTab] = useState<'preview' | 'xml' | 'text'>('preview');
    const [isEditMode, setIsEditMode] = useState(true);

    // Bulk Update State
    const [bulkUpdate, setBulkUpdate] = useState({
        grade: '',
        unit: '',
        difficulty: ''
    });

    // Cart / Selection
    const [selectedIds, setSelectedIds] = useState<Set<any>>(new Set());

    const toggleSelect = (id: any) => {
        const newSet = new Set(selectedIds);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setSelectedIds(newSet);
    };

    const toggleAll = () => {
        if (selectedIds.size === questions.length && questions.length > 0) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(questions.map(q => q.id)));
        }
    };

    const handleDeleteSelected = async () => {
        if (selectedIds.size === 0) return;
        if (!confirm(`${selectedIds.size}개의 문제를 정말 삭제하시겠습니까?`)) return;

        try {
            const res = await fetch('/api/admin/questions', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids: Array.from(selectedIds) })
            });

            if (res.ok) {
                alert('선택한 문제가 삭제되었습니다.');
                fetchQuestions();
            } else {
                const err = await res.json();
                alert('삭제 실패: ' + err.error);
            }
        } catch (e) {
            console.error(e);
            alert('삭제 중 오류가 발생했습니다.');
        }
    };

    const handleDeleteAll = async () => {
        const input = prompt("경고: 데이터베이스의 모든 문제를 삭제합니다!\n진행하려면 '삭제'라고 입력해주세요.");
        if (input !== '삭제') return;

        try {
            const res = await fetch('/api/admin/questions', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ deleteAll: true })
            });

            if (res.ok) {
                alert('모든 문제가 삭제되었습니다.');
                fetchQuestions();
            } else {
                const err = await res.json();
                alert('전체 삭제 실패: ' + err.error);
            }
        } catch (e) {
            console.error(e);
            alert('삭제 중 오류가 발생했습니다.');
        }
    };

    const handleDownload = async () => {
        const selectedIdsArray = Array.from(selectedIds);
        console.log("[UI_SELECTED_IDS]", selectedIdsArray);
        if (new Set(selectedIdsArray).size !== selectedIdsArray.length) {
            alert("중복 선택 감지: 리스트 확인");
            return;
        }

        try {
            // Use HML V2 Download API
            const res = await fetch('/api/admin/download-hml', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ids: selectedIdsArray
                })
            });

            // Check for HML content type
            const contentType = res.headers.get("content-type") || "";
            if (res.ok && (contentType.includes("x-hwp") || contentType.includes("octet-stream"))) {
                const blob = await res.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                // HML extension for Hancom Office
                a.download = `시험지_${new Date().toISOString().slice(0, 10)}.hml`;
                document.body.appendChild(a);
                a.click();
                a.remove();
                window.URL.revokeObjectURL(url);
            } else {
                // Handle JSON or Text error
                let errMsg = "시험지 생성 실패 (서버 오류)";

                try {
                    if (contentType.includes("application/json")) {
                        const errJson = await res.json();
                        errMsg = `[${errJson.stage || 'error'}] ${errJson.message}`;
                    } else {
                        const errText = await res.text();
                        console.error("DOWNLOAD_FAIL_BODY", errText);
                        errMsg = errText.slice(0, 200);
                    }
                } catch (e) { console.error(e); }

                alert(errMsg);
            }
        } catch (e: any) {
            console.error(e);
            alert('다운로드 중 오류가 발생했습니다.');
        }
    };

    const handleBulkUpdate = async () => {
        if (selectedIds.size === 0) return;

        // Filter out empty fields
        const updates: any = {};
        if (bulkUpdate.grade) updates.grade = bulkUpdate.grade;
        if (bulkUpdate.unit) updates.unit = bulkUpdate.unit;
        if (bulkUpdate.difficulty) updates.difficulty = bulkUpdate.difficulty;

        if (Object.keys(updates).length === 0) {
            alert('변경할 내용을 입력해주세요 (학년/단원/난이도)');
            return;
        }

        if (!confirm(`${selectedIds.size}개 문제의 정보를 일괄 수정하시겠습니까?`)) return;

        try {
            const res = await fetch('/api/admin/questions', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ids: Array.from(selectedIds),
                    updates
                })
            });

            if (res.ok) {
                alert('일괄 수정되었습니다.');
                fetchQuestions();
                setBulkUpdate({ grade: '', unit: '', difficulty: '' }); // Reset form
            } else {
                const err = await res.json();
                alert('수정 실패: ' + err.error);
            }
        } catch (e) {
            console.error(e);
            alert('오류가 발생했습니다.');
        }
    };

    const handleSaveQuestion = async (q: any) => {
        try {
            const res = await fetch('/api/admin/questions', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ids: [q.id],
                    updates: {
                        grade: q.grade,
                        unit: q.unit,
                        difficulty: q.difficulty,
                        plain_text: q.plain_text // Allow text edit? Maybe later.
                    }
                })
            });

            if (res.ok) {
                alert('저장되었습니다.');
                fetchQuestions();
                setSelectedQuestion(null);
            } else {
                const err = await res.json();
                alert('저장 실패: ' + err.error);
            }
        } catch (e) {
            console.error(e);
            alert('오류가 발생했습니다.');
        }
    };

    const handleQuickDifficultyChange = async (q: any, newDiff: string) => {
        // Optimistic Update
        const oldDiff = q.difficulty;

        // Update List State
        setQuestions(prev => prev.map(item =>
            item.id === q.id ? { ...item, difficulty: newDiff } : item
        ));

        // Update Modal State (if open)
        if (selectedQuestion && selectedQuestion.id === q.id) {
            setSelectedQuestion(prev => ({ ...prev, difficulty: newDiff }));
        }

        try {
            const res = await fetch('/api/admin/questions', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ids: [q.id],
                    updates: { difficulty: newDiff }
                })
            });

            if (!res.ok) {
                // Revert on failure
                setQuestions(prev => prev.map(item =>
                    item.id === q.id ? { ...item, difficulty: oldDiff } : item
                ));
                if (selectedQuestion && selectedQuestion.id === q.id) {
                    setSelectedQuestion(prev => ({ ...prev, difficulty: oldDiff }));
                }
                alert('수정 실패');
            }
        } catch (e) {
            console.error(e);
            alert('오류가 발생했습니다.');
        }
    };

    const fetchQuestions = async () => {
        setLoading(true);
        // Reset selection on new fetch to avoid confusion
        setSelectedIds(new Set());

        try {
            const params = new URLSearchParams({
                q: search,
                school,
                subject,
                page: page.toString()
            });

            const res = await fetch(`/api/admin/questions?${params.toString()}`);
            const data = await res.json();

            if (data.success) {
                setQuestions(data.data);
                setTotal(data.count);
            }
        } catch (error) {
            console.error('Failed to fetch questions:', error);
        } finally {
            setLoading(false);
        }
    };

    // Debounce search or just search on button click? 
    // Let's do simple Search button for now to avoid too many requests
    useEffect(() => {
        fetchQuestions();
    }, [page]); // Re-fetch on page change

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        setPage(1);
        fetchQuestions();
    };

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-6">
            <h1 className="text-2xl font-bold text-gray-800">문제 관리 (Questions Admin)</h1>

            {/* Filters */}
            <form onSubmit={handleSearch} className="bg-white p-6 rounded-lg shadow-sm border space-y-4 md:space-y-0 md:flex md:gap-4 items-end">
                <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-700 mb-1">학교명 (School)</label>
                    <input
                        type="text"
                        value={school}
                        onChange={e => setSchool(e.target.value)}
                        placeholder="경기고, 휘문고..."
                        className="w-full border rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                </div>
                <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-700 mb-1">과목 (Subject)</label>
                    <select
                        value={subject}
                        onChange={e => setSubject(e.target.value)}
                        className="w-full border rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    >
                        <option value="">전체</option>
                        <option value="공통수학1">공통수학1</option>
                        <option value="공통수학2">공통수학2</option>
                        <option value="대수">대수</option>
                        <option value="미적분1">미적분1</option>
                        <option value="미적분2">미적분2</option>
                        <option value="기하">기하</option>
                        <option value="확통">확통</option>
                    </select>
                </div>
                <div className="flex-[2]">
                    <label className="block text-sm font-medium text-gray-700 mb-1">내용 검색 (Content Search)</label>
                    <input
                        type="text"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="문제 텍스트 검색..."
                        className="w-full border rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                </div>
                <button
                    type="submit"
                    className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded text-sm font-medium transition-colors"
                >
                    검색
                </button>
            </form>

            {/* Bulk Update Bar (Visible when selection > 0) */}
            {selectedIds.size > 0 && (
                <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-lg flex flex-wrap gap-4 items-center shadow-sm animate-in fade-in slide-in-from-top-2">
                    <span className="font-bold text-yellow-800 text-sm">{selectedIds.size}개 선택됨: 일괄 수정</span>

                    <select
                        className="border rounded px-2 py-1 text-sm w-24"
                        value={bulkUpdate.grade}
                        onChange={e => setBulkUpdate({ ...bulkUpdate, grade: e.target.value })}
                    >
                        <option value="">학년 선택</option>
                        <option value="고1">고1</option>
                        <option value="고2">고2</option>
                        <option value="고3">고3</option>
                        <option value="중1">중1</option>
                        <option value="중2">중2</option>
                        <option value="중3">중3</option>
                    </select>

                    <input
                        type="text"
                        placeholder="단원명 (예: 다항식)"
                        className="border rounded px-2 py-1 text-sm w-32"
                        value={bulkUpdate.unit}
                        onChange={e => setBulkUpdate({ ...bulkUpdate, unit: e.target.value })}
                    />

                    <select
                        className="border rounded px-2 py-1 text-sm w-24"
                        value={bulkUpdate.difficulty}
                        onChange={e => setBulkUpdate({ ...bulkUpdate, difficulty: e.target.value })}
                    >
                        <option value="">난이도</option>
                        {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
                            <option key={n} value={n}>{n}</option>
                        ))}
                    </select>

                    <button
                        onClick={handleBulkUpdate}
                        className="bg-yellow-600 hover:bg-yellow-700 text-white px-4 py-1 rounded text-sm font-bold"
                    >
                        일괄 적용
                    </button>
                </div>
            )}

            {/* Stats & Actions */}
            <div className="flex justify-between items-center text-sm text-gray-600">
                <span>총 {total}개의 문제가 검색되었습니다.</span>
                <div className="flex items-center gap-2">
                    {/* Delete Selected */}
                    {selectedIds.size > 0 && (
                        <button
                            onClick={handleDeleteSelected}
                            className="bg-red-500 hover:bg-red-600 text-white px-3 py-2 rounded text-sm font-medium transition-colors shadow-sm flex items-center gap-1"
                        >
                            <span>🗑️ 선택 삭제</span>
                        </button>
                    )}

                    <button
                        onClick={handleDownload}
                        disabled={selectedIds.size === 0}
                        className="bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white px-3 py-2 rounded text-sm font-medium transition-colors shadow-sm flex items-center gap-1"
                    >
                        <span>📥 다운로드</span>
                    </button>

                    {/* Spacer */}
                    <div className="w-4"></div>

                    {/* Delete All (Danger) */}
                    <button
                        onClick={handleDeleteAll}
                        className="bg-gray-800 hover:bg-red-900 text-white px-3 py-2 rounded text-xs font-medium transition-colors shadow-sm border border-gray-600"
                    >
                        ⛔ 전체 초기화
                    </button>

                    <span className="text-xs bg-gray-100 px-2 py-1 rounded ml-2">Page {page}</span>
                </div>
            </div>

            {/* Data Grid */}
            <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
                <table className="w-full text-left border-collapse table-auto">
                    <thead className="bg-gray-50 text-gray-700 text-sm font-medium">
                        <tr>
                            <th className="p-3 border-b w-10 text-center">
                                <input
                                    type="checkbox"
                                    onChange={toggleAll}
                                    checked={questions.length > 0 && selectedIds.size === questions.length}
                                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                />
                            </th>
                            <th className="p-3 border-b w-14 text-center">No.</th>
                            <th className="p-3 border-b w-24">지역/학교</th>
                            <th className="p-3 border-b w-16">학년</th>
                            <th className="p-3 border-b w-24">단원</th>
                            <th className="p-3 border-b w-16">난이도</th>
                            <th className="p-3 border-b">문제 내용</th>
                            <th className="p-3 border-b w-20 text-center">관리</th>
                        </tr>
                    </thead>
                    <tbody className="text-sm divide-y divide-gray-100">
                        {loading ? (
                            <tr><td colSpan={8} className="p-8 text-center text-gray-500">Loading...</td></tr>
                        ) : questions.length === 0 ? (
                            <tr><td colSpan={8} className="p-8 text-center text-gray-500">데이터가 없습니다.</td></tr>
                        ) : (
                            questions.map((q) => (
                                <tr
                                    key={q.id}
                                    className={`hover:bg-gray-50 transition-colors cursor-pointer ${selectedIds.has(q.id) ? 'bg-blue-50' : ''}`}
                                    onClick={() => toggleSelect(q.id)}
                                >
                                    <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                                        <input
                                            type="checkbox"
                                            checked={selectedIds.has(q.id)}
                                            onChange={() => toggleSelect(q.id)}
                                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                        />
                                    </td>
                                    <td className="p-3 text-center text-gray-500 text-xs">{q.question_number}</td>
                                    <td className="p-3">
                                        <div className="font-bold text-gray-800">{q.school || '-'}</div>
                                        <div className="text-xs text-gray-500">{q.region} {q.district}</div>
                                    </td>
                                    <td className="p-3 text-gray-700">{q.grade}</td>
                                    <td className="p-3 text-gray-700 text-xs">{q.unit || '미분류'}</td>
                                    <td className="p-3" onClick={e => e.stopPropagation()}>
                                        <select
                                            className={`border rounded px-1 py-1 text-xs font-bold ${parseInt(q.difficulty) >= 8 ? 'bg-red-50 text-red-700 border-red-200' :
                                                parseInt(q.difficulty) >= 5 ? 'bg-yellow-50 text-yellow-800 border-yellow-200' :
                                                    'bg-green-50 text-green-700 border-green-200'
                                                }`}
                                            value={q.difficulty || '1'}
                                            onChange={(e) => handleQuickDifficultyChange(q, e.target.value)}
                                        >
                                            {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
                                                <option key={n} value={n}>{n}</option>
                                            ))}
                                        </select>
                                    </td>
                                    <td className="p-3 text-gray-600 text-xs max-w-md overflow-hidden" onClick={e => setSelectedQuestion(q)}>
                                        <div className="max-h-[150px] overflow-hidden relative group">
                                            <QuestionRenderer
                                                xmlContent={q.content_xml}
                                                showDownloadAction={false}
                                            />
                                            {/* Fade out effect at bottom */}
                                            <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-white to-transparent pointer-events-none"></div>
                                        </div>
                                    </td>
                                    <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                                        <button
                                            onClick={() => setSelectedQuestion(q)}
                                            className="text-xs bg-white text-gray-700 px-2 py-1 rounded border hover:bg-gray-100 shadow-sm"
                                        >
                                            수정
                                        </button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Pagination UI - Simple Prev/Next */}
            <div className="flex justify-center gap-2">
                <button
                    disabled={page === 1}
                    onClick={() => setPage(p => p - 1)}
                    className="px-4 py-2 border rounded disabled:opacity-50 text-sm hover:bg-gray-50"
                >
                    이전
                </button>
                <button
                    disabled={questions.length < 20}
                    onClick={() => setPage(p => p + 1)}
                    className="px-4 py-2 border rounded disabled:opacity-50 text-sm hover:bg-gray-50"
                >
                    다음
                </button>
            </div>

            {/* Edit Modal */}
            {selectedQuestion && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-in fade-in">
                    <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl h-[90vh] flex flex-col">
                        <div className="p-4 border-b flex justify-between items-center bg-gray-50 rounded-t-lg">
                            <h3 className="font-bold text-lg text-gray-800">
                                문제 정보 수정 (ID: {selectedQuestion.question_number})
                            </h3>
                            <button onClick={() => setSelectedQuestion(null)} className="text-gray-500 hover:text-gray-800">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>

                        <div className="flex-1 overflow-auto p-6 md:grid md:grid-cols-2 md:gap-6">
                            {/* Left Col: Metadata Form */}
                            <div className="space-y-6">
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">지역 (Region)</label>
                                        <input
                                            className="w-full border p-2 rounded text-sm"
                                            value={selectedQuestion.region || ''}
                                            onChange={e => setSelectedQuestion({ ...selectedQuestion, region: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">구/군 (District)</label>
                                        <input
                                            className="w-full border p-2 rounded text-sm"
                                            value={selectedQuestion.district || ''}
                                            onChange={e => setSelectedQuestion({ ...selectedQuestion, district: e.target.value })}
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">학교 (School)</label>
                                    <input
                                        className="w-full border p-2 rounded text-sm"
                                        value={selectedQuestion.school || ''}
                                        onChange={e => setSelectedQuestion({ ...selectedQuestion, school: e.target.value })}
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">연도</label>
                                        <input
                                            className="w-full border p-2 rounded text-sm"
                                            value={selectedQuestion.year || ''}
                                            onChange={e => setSelectedQuestion({ ...selectedQuestion, year: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">학기</label>
                                        <select
                                            className="w-full border p-2 rounded text-sm"
                                            value={selectedQuestion.semester || ''}
                                            onChange={e => setSelectedQuestion({ ...selectedQuestion, semester: e.target.value })}
                                        >
                                            <option value="1학기중간">1학기중간</option>
                                            <option value="1학기기말">1학기기말</option>
                                            <option value="2학기중간">2학기중간</option>
                                            <option value="2학기기말">2학기기말</option>
                                        </select>
                                    </div>
                                </div>

                                <div className="border-t pt-4 mt-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">학년 (Grade)</label>
                                            <select
                                                className="w-full border p-2 rounded text-sm"
                                                value={selectedQuestion.grade || '고1'}
                                                onChange={e => setSelectedQuestion({ ...selectedQuestion, grade: e.target.value })}
                                            >
                                                <option value="고1">고1</option>
                                                <option value="고2">고2</option>
                                                <option value="고3">고3</option>
                                                <option value="중1">중1</option>
                                                <option value="중2">중2</option>
                                                <option value="중3">중3</option>
                                            </select>
                                        </div>

                                        <div>
                                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">난이도 (1-10)</label>
                                            <select
                                                className="w-full border p-2 rounded text-sm bg-yellow-50"
                                                value={selectedQuestion.difficulty || '1'}
                                                onChange={e => handleQuickDifficultyChange(selectedQuestion, e.target.value)}
                                            >
                                                {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
                                                    <option key={n} value={n}>{n}</option>
                                                ))}
                                            </select>
                                            <p className="text-[10px] text-gray-400 mt-1">* 선택 즉시 저장됩니다.</p>
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">단원명 (Unit)</label>
                                    <input
                                        className="w-full border p-2 rounded text-sm"
                                        placeholder="예: 다항식"
                                        value={selectedQuestion.unit || ''}
                                        onChange={e => setSelectedQuestion({ ...selectedQuestion, unit: e.target.value })}
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">과목 (Subject)</label>
                                    <select
                                        className="w-full border p-2 rounded text-sm"
                                        value={selectedQuestion.subject || ''}
                                        onChange={e => setSelectedQuestion({ ...selectedQuestion, subject: e.target.value })}
                                    >
                                        <option value="공통수학1">공통수학1</option>
                                        <option value="공통수학2">공통수학2</option>
                                        <option value="대수">대수</option>
                                        <option value="미적분1">미적분1</option>
                                        <option value="미적분2">미적분2</option>
                                        <option value="기하">기하</option>
                                        <option value="확통">확통</option>
                                    </select>
                                </div>
                            </div>

                            {/* Right Col: Content Preview */}
                            <div className="mt-6 md:mt-0 flex flex-col h-full space-y-4">
                                <div className="flex border-b">
                                    {/* Tabs */}
                                    <button
                                        className={`px-4 py-2 text-sm font-medium ${previewTab === 'preview' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                                        onClick={() => setPreviewTab('preview')}
                                    >
                                        미리보기 (Image)
                                    </button>
                                    <button
                                        className={`px-4 py-2 text-sm font-medium ${previewTab === 'text' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                                        onClick={() => setPreviewTab('text')}
                                    >
                                        Plain Text
                                    </button>
                                    <button
                                        className={`px-4 py-2 text-sm font-medium ${previewTab === 'xml' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                                        onClick={() => setPreviewTab('xml')}
                                    >
                                        Source XML
                                    </button>
                                </div>

                                <div className="flex-1 overflow-auto bg-gray-50 rounded border relative">
                                    {previewTab === 'preview' && (
                                        <div className="p-4">
                                            <QuestionRenderer
                                                xmlContent={selectedQuestion.content_xml}
                                                showDownloadAction={true}
                                                fileName={`Q${selectedQuestion.question_number}_${selectedQuestion.subject || 'math'}`}
                                            />
                                        </div>
                                    )}

                                    {previewTab === 'text' && (
                                        <div className="h-full flex flex-col">
                                            <textarea
                                                className="w-full h-full p-3 text-sm bg-transparent border-none resize-none focus:ring-0"
                                                value={selectedQuestion.plain_text || ''}
                                                onChange={e => setSelectedQuestion({ ...selectedQuestion, plain_text: e.target.value })}
                                            />
                                            <p className="text-xs text-gray-400 p-2 text-right">검색 인덱스용 텍스트입니다.</p>
                                        </div>
                                    )}

                                    {previewTab === 'xml' && (
                                        <div className="h-full">
                                            <textarea
                                                readOnly
                                                className="w-full h-full p-3 font-mono text-xs bg-slate-800 text-green-400 border-none resize-none focus:ring-0"
                                                value={selectedQuestion.content_xml || ''}
                                            />
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Footer Actions */}
                        <div className="p-4 border-t bg-gray-50 rounded-b-lg flex justify-between">
                            <div className="text-xs text-gray-400 self-center">
                                Source ID: {selectedQuestion.source_db_id}
                            </div>
                            <div className="space-x-2">
                                <button
                                    onClick={() => setSelectedQuestion(null)}
                                    className="px-4 py-2 bg-white text-gray-700 border rounded text-sm hover:bg-gray-100"
                                >
                                    취소
                                </button>
                                <button
                                    onClick={() => handleSaveQuestion(selectedQuestion)}
                                    className="px-6 py-2 bg-blue-600 text-white rounded text-sm font-bold hover:bg-blue-700 shadow-sm"
                                >
                                    저장
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
