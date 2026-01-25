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
    const [page, setPage] = useState(1);

    // Bulk Update State
    const [bulkUpdate, setBulkUpdate] = useState({
        grade: '',
        unit: '',
        difficulty: ''
    });

    // Capture Error UI
    const [captureError, setCaptureError] = useState<{ message: string, stdout: string, stderr: string } | null>(null);

    // Cart / Selection
    const [selectedIds, setSelectedIds] = useState<Set<any>>(new Set());
    const [expandedSolutions, setExpandedSolutions] = useState<Set<string>>(new Set());

    // Similarity Search State
    const [similarQuestions, setSimilarQuestions] = useState<any[]>([]);
    const [isSimilarModalOpen, setIsSimilarModalOpen] = useState(false);
    const [similarityTarget, setSimilarityTarget] = useState<any>(null);
    const [loadingSimilar, setLoadingSimilar] = useState(false);

    // Embedding Generation State
    const [isGeneratingEmbeddings, setIsGeneratingEmbeddings] = useState(false);
    const [generationProgress, setGenerationProgress] = useState(0);

    // Detailed Edit Modal State
    const [selectedQuestion, setSelectedQuestion] = useState<any | null>(null);
    const [previewTab, setPreviewTab] = useState<'preview' | 'xml' | 'text'>('preview');

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
        if (!confirm(`${selectedIds.size}개의 문제를 삭제하시겠습니까?`)) return;

        try {
            const res = await fetch('/api/admin/questions', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids: Array.from(selectedIds) })
            });

            if (res.ok) {
                alert('삭제되었습니다.');
                setSelectedIds(new Set());
                fetchQuestions();
            } else {
                const err = await res.json();
                alert('삭제 실패: ' + err.error);
            }
        } catch (e) {
            console.error(e);
            alert('오류가 발생했습니다.');
        }
    };

    const handleCollectMathScripts = () => {
        // Collect all MathML/Latex scripts from the current page
        // Format: [Question ID] -> Script
        let report = "=== Math Script Analysis Report ===\n";
        questions.forEach(q => {
            report += `\n[Q-${q.question_number} ID:${q.id}]\n`;
            // Simple regex to find math text in plain text or XML
            // This is a naive extraction for inspection
            if (q.plain_text) {
                report += q.plain_text.slice(0, 500) + "\n";
            }
            // If we have detailed scripts from renderer (this would require renderer to expose it, but for now we just dump raw)
            // Let's dump the XML content too
            if (q.content_xml) {
                const mathTags = q.content_xml.match(/<script[^>]*>([\s\S]*?)<\/script>/g);
                if (mathTags) {
                    report += `Found ${mathTags.length} script tags.\n`;
                    mathTags.forEach((tag: string) => report += tag + "\n");
                }
            }
        });

        navigator.clipboard.writeText(report).then(() => {
            alert('현재 페이지의 모든 수식 스크립트가 클립보드에 복사되었습니다. 이 내용을 채팅창에 붙여넣어 주시면 분석해 드릴 수 있습니다.');
        }).catch(err => {
            console.error('Clipboard error:', err);
            alert('복사 실패. 콘솔을 확인해주세요.');
        });
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
                        plain_text: q.plain_text
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
        const oldDiff = q.difficulty;

        setQuestions(prev => prev.map(item =>
            item.id === q.id ? { ...item, difficulty: newDiff } : item
        ));

        if (selectedQuestion && selectedQuestion.id === q.id) {
            setSelectedQuestion((prev: any) => ({ ...prev, difficulty: newDiff }));
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
                setQuestions(prev => prev.map(item =>
                    item.id === q.id ? { ...item, difficulty: oldDiff } : item
                ));
                if (selectedQuestion && selectedQuestion.id === q.id) {
                    setSelectedQuestion((prev: any) => ({ ...prev, difficulty: oldDiff }));
                }
                alert('수정 실패');
            }
        } catch (e) {
            console.error(e);
            alert('오류가 발생했습니다.');
        }
    };

    const handleManualCapture = async (q: any, captureType: 'question' | 'solution' = 'question') => {
        try {
            const captureRes = await fetch('http://localhost:5000/trigger-manual-capture', {
                method: 'POST'
            });

            if (!captureRes.ok) {
                const err = await captureRes.json();
                console.error("[CAPTURE_SERVER_ERROR]", err);
                throw new Error(`${err.error}\nSTDOUT: ${err.stdout || ''}\nSTDERR: ${err.stderr || ''}`);
            }

            const { file_path } = await captureRes.json();

            const fileRes = await fetch(`http://localhost:5000/get-capture?path=${encodeURIComponent(file_path)}`);
            if (!fileRes.ok) {
                const err = await fileRes.json();
                throw new Error(`로컬 파일을 가져오지 못했습니다: ${err.error}`);
            }
            const blob = await fileRes.blob();

            const formData = new FormData();
            formData.append('file', blob, `capture_${q.question_number}_${captureType}.png`);
            formData.append('questionId', q.id);
            formData.append('captureType', captureType);

            const uploadRes = await fetch('/api/admin/upload-capture', {
                method: 'POST',
                body: formData
            });

            if (uploadRes.ok) {
                alert(`${captureType === 'solution' ? '해설' : '문제'} 이미지가 성공적으로 캡쳐되어 업로드되었습니다.`);
                fetchQuestions();
                if (captureType === 'solution') {
                    const newSet = new Set(expandedSolutions);
                    newSet.add(q.id);
                    setExpandedSolutions(newSet);
                }
            } else {
                alert('업로드 실패');
            }

        } catch (e: any) {
            console.error(e);
            const logMatch = e.message.match(/STDOUT: ([\s\S]*)\nSTDERR: ([\s\S]*)/);
            setCaptureError({
                message: e.message.split('\nSTDOUT:')[0],
                stdout: logMatch ? logMatch[1] : '',
                stderr: logMatch ? logMatch[2] : ''
            });
        }
    };

    const handleFindSimilar = async (q: any) => {
        setSimilarityTarget(q);
        setLoadingSimilar(true);
        setIsSimilarModalOpen(true);
        setSimilarQuestions([]);

        try {
            const params = new URLSearchParams({
                id: q.id,
                limit: '5',
                // Auto boost: Grade +3%, Unit +5%
                grade: q.grade || '',
                unit: q.unit || ''
            });

            const res = await fetch(`/api/admin/questions/similar?${params.toString()}`);
            const data = await res.json();

            if (data.success) {
                setSimilarQuestions(data.data);
            } else {
                console.error("Similarity search failed:", data.error);
                if (data.error.includes("embedding")) {
                    if (confirm("이 문항의 벡터 데이터가 없습니다. 지금 생성하시겠습니까?")) {
                        await fetch('/api/admin/embeddings/generate', {
                            method: 'POST',
                            body: JSON.stringify({ forceIds: [q.id] })
                        });
                        const retryRes = await fetch(`/api/admin/questions/similar?${params.toString()}`);
                        const retryData = await retryRes.json();
                        if (retryData.success) setSimilarQuestions(retryData.data);
                    }
                }
            }
        } catch (e) {
            console.error("Similarity search error:", e);
            alert("유사 문항 검색 중 오류가 발생했습니다.");
        } finally {
            setLoadingSimilar(false);
        }
    };

    const handleGenerateEmbeddings = async () => {
        if (!confirm("모든 문제에 대해 AI 데이터(벡터 임베딩)를 생성하시겠습니까?\n문제가 많을 경우 시간이 소요될 수 있습니다.")) return;

        setIsGeneratingEmbeddings(true);
        setGenerationProgress(0);
        let totalProcessed = 0;

        try {
            while (true) {
                const res = await fetch('/api/admin/embeddings/generate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({}) // Default: process pending items
                });
                const data = await res.json();

                if (!data.success) {
                    throw new Error(data.error);
                }

                if (data.processed === 0) {
                    break; // Done
                }

                totalProcessed += data.processed;
                setGenerationProgress(totalProcessed);

                await new Promise(r => setTimeout(r, 500));
            }

            alert(`완료되었습니다! 총 ${totalProcessed}개 문항의 AI 데이터를 생성했습니다.`);
        } catch (e: any) {
            console.error(e);
            alert(`오류 발생: ${e.message}`);
        } finally {
            setIsGeneratingEmbeddings(false);
        }
    };

    const handleDeleteCapture = async (imageId: string, imageUrl: string) => {
        try {
            const res = await fetch('/api/admin/delete-capture', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ imageId, imageUrl })
            });

            if (res.ok) {
                fetchQuestions();
                if (selectedQuestion) {
                    setSelectedQuestion((prev: any) => {
                        if (!prev) return null;
                        return {
                            ...prev,
                            question_images: prev.question_images.filter((img: any) => img.id !== imageId)
                        };
                    });
                }
            } else {
                const err = await res.json();
                alert(`삭제 실패: ${err.error}`);
            }
        } catch (e) {
            console.error(e);
            alert('삭제 중 오류가 발생했습니다.');
        }
    };

    const fetchQuestions = async () => {
        setLoading(true);
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

    useEffect(() => {
        fetchQuestions();
    }, [page]);

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        setPage(1);
        fetchQuestions();
    };

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-6">
            {/* Capture Error Modal (Selectable) */}
            {captureError && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4">
                    <div className="bg-white rounded-lg shadow-2xl w-full max-w-2xl flex flex-col max-h-[80vh]">
                        <div className="p-4 border-b flex justify-between items-center bg-red-50">
                            <h3 className="font-bold text-red-700">캡쳐 오류 상세 (드래그하여 복사 가능)</h3>
                            <button onClick={() => setCaptureError(null)} className="text-gray-500 hover:text-gray-800 text-xl font-bold">&times;</button>
                        </div>
                        <div className="p-6 overflow-auto space-y-4 text-sm font-mono whitespace-pre-wrap select-text">
                            <div className="font-bold text-red-600 underline">ERROR: {captureError.message}</div>
                            {captureError.stdout && (
                                <div>
                                    <div className="text-blue-600 font-bold mb-1">[STDOUT]</div>
                                    <div className="bg-gray-100 p-3 rounded border">{captureError.stdout}</div>
                                </div>
                            )}
                            {captureError.stderr && (
                                <div>
                                    <div className="text-orange-600 font-bold mb-1">[STDERR]</div>
                                    <div className="bg-gray-100 p-3 rounded border">{captureError.stderr}</div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-black text-gray-900 tracking-tight">
                    기출 문항 관리 <span className="text-gray-400 font-normal text-xl ml-2">({total}문제)</span>
                </h1>
                <div className="flex items-center gap-4">
                    {/* Search Stats */}
                    <div className="px-3 py-1 bg-blue-50 text-blue-800 rounded-full text-xs font-bold">
                        {selectedIds.size}개 선택됨
                    </div>
                    {/* Search Bar */}
                    <form onSubmit={handleSearch} className="flex gap-2">
                        <select
                            className="border rounded-lg px-3 py-2 text-sm"
                            value={school}
                            onChange={(e) => setSchool(e.target.value)}
                        >
                            <option value="">모든 학교</option>
                            <option value="경기고">경기고</option>
                            <option value="서울고">서울고</option>
                            <option value="휘문고">휘문고</option>
                        </select>
                        <select
                            className="border rounded-lg px-3 py-2 text-sm"
                            value={subject}
                            onChange={(e) => setSubject(e.target.value)}
                        >
                            <option value="">모든 과목</option>
                            <option value="수학(상)">수학(상)</option>
                            <option value="수학(하)">수학(하)</option>
                            <option value="수1">수1</option>
                            <option value="수2">수2</option>
                            <option value="미적분">미적분</option>
                            <option value="확통">확통</option>
                        </select>
                        <input
                            type="text"
                            placeholder="문항 내용 검색..."
                            className="border rounded-lg px-3 py-2 text-sm w-64"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                        <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-blue-700 transition-colors">
                            검색
                        </button>
                    </form>
                </div>
            </div>

            {/* Bulk Actions */}
            <div className="bg-white p-4 rounded-xl border shadow-sm flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                    <input
                        type="checkbox"
                        checked={selectedIds.size > 0 && selectedIds.size === questions.length}
                        onChange={toggleAll}
                        className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                    <span className="text-sm font-bold text-gray-700">전체 선택</span>
                </div>

                <div className="flex items-center gap-2 border-l pl-4">
                    <select
                        className="border rounded px-2 py-1.5 text-sm w-24"
                        value={bulkUpdate.grade}
                        onChange={e => setBulkUpdate({ ...bulkUpdate, grade: e.target.value })}
                    >
                        <option value="">학년 변경</option>
                        <option value="고1">고1</option>
                        <option value="고2">고2</option>
                        <option value="고3">고3</option>
                        <option value="중1">중1</option>
                        <option value="중2">중2</option>
                        <option value="중3">중3</option>
                    </select>
                    <input
                        className="border rounded px-2 py-1.5 text-sm w-32"
                        placeholder="단원명 변경"
                        value={bulkUpdate.unit}
                        onChange={e => setBulkUpdate({ ...bulkUpdate, unit: e.target.value })}
                    />
                    <select
                        className="border rounded px-2 py-1.5 text-sm w-24"
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
                        disabled={selectedIds.size === 0}
                        className="bg-gray-800 text-white px-3 py-1.5 rounded text-sm font-medium hover:bg-gray-900 disabled:opacity-50 transition-colors"
                    >
                        일괄 적용
                    </button>
                </div>

                <div className="flex-1"></div>

                <div className="flex items-center gap-2">
                    {/* AI Generation Button */}
                    <button
                        onClick={handleGenerateEmbeddings}
                        disabled={isGeneratingEmbeddings}
                        className={`px-4 py-2 rounded text-sm font-bold shadow-sm flex items-center gap-2 transition-all ${isGeneratingEmbeddings
                            ? 'bg-purple-100 text-purple-700 cursor-not-allowed'
                            : 'bg-purple-600 hover:bg-purple-700 text-white'
                            }`}
                    >
                        {isGeneratingEmbeddings ? (
                            <>
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-purple-700"></div>
                                AI 분석 중... ({generationProgress}개)
                            </>
                        ) : (
                            <>
                                🤖 AI 데이터 일괄 생성
                            </>
                        )}
                    </button>

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

                    {/* Math Fix Tool */}
                    <button
                        onClick={handleCollectMathScripts}
                        className="bg-blue-50 hover:bg-blue-100 text-blue-700 px-3 py-2 rounded text-xs font-bold border border-blue-200 transition-colors"
                        title="현재 페이지의 모든 수식 원본 스크립트를 복사합니다."
                    >
                        📋 수식 데이터 수집
                    </button>

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

            {/* Data Grid (Card Layout) */}
            {loading ? (
                <div className="p-20 text-center text-gray-500">
                    <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mb-4"></div>
                    <p>데이터를 불러오는 중입니다...</p>
                </div>
            ) : questions.length === 0 ? (
                <div className="p-20 text-center text-gray-500 bg-gray-50 rounded-lg border border-dashed">
                    <p className="text-xl mb-2">검색 결과가 없습니다.</p>
                    <p className="text-sm">검색 조건을 변경하거나 필터를 초기화해보세요.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-8">
                    {questions.map((q) => (
                        <div
                            key={q.id}
                            className={`bg-white border rounded-2xl overflow-hidden shadow-sm hover:shadow-lg transition-all flex flex-col relative group ${selectedIds.has(q.id) ? 'ring-2 ring-blue-500 border-blue-500 bg-blue-50/10' : 'border-gray-200'
                                }`}
                            onClick={() => toggleSelect(q.id)}
                        >
                            {/* Card Header */}
                            <div className="p-4 flex justify-between items-start bg-gray-50/80 border-b backdrop-blur-sm">
                                <div className="flex flex-col">
                                    <div className="flex items-center gap-2">
                                        <span className="font-black text-blue-600 text-xl">#{q.question_number}</span>
                                        <span className="text-sm bg-white border px-2 py-0.5 rounded text-gray-500 font-medium">
                                            {q.subject}
                                        </span>
                                    </div>
                                    <div className="text-sm text-gray-700 mt-1 font-bold w-full">
                                        {q.year && `${q.year}년`} {q.school} {q.grade} {q.semester}
                                    </div>
                                </div>
                                <div onClick={(e) => e.stopPropagation()}>
                                    <input
                                        type="checkbox"
                                        checked={selectedIds.has(q.id)}
                                        onChange={() => toggleSelect(q.id)}
                                        className="w-6 h-6 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                    />
                                </div>
                            </div>

                            {/* Card Body: Renderer */}
                            <div
                                className="flex-1 p-0 overflow-hidden relative bg-white cursor-pointer min-h-[400px] flex flex-col"
                                onClick={(e) => { e.stopPropagation(); setSelectedQuestion(q); }}
                            >
                                {/* Images Badge */}
                                {(q.question_images && q.question_images.length > 0) && (
                                    <div className="absolute top-2 right-2 z-10 bg-black/70 text-white text-[10px] px-2 py-1 rounded-full font-bold backdrop-blur-md">
                                        📸 {q.question_images.length}
                                    </div>
                                )}

                                <div className="flex-1 relative">
                                    <div className="absolute inset-0 overflow-hidden">
                                        <div className="origin-top-left h-full w-full overflow-hidden">
                                            <QuestionRenderer
                                                xmlContent={q.content_xml}
                                                showDownloadAction={false}
                                                externalImages={q.question_images}
                                                onDeleteCapture={handleDeleteCapture}
                                                className="text-xl font-medium leading-relaxed [&_img]:!max-w-full"
                                            />
                                        </div>
                                    </div>
                                    {/* Gradient overlay for long content */}
                                    <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-white to-transparent pointer-events-none"></div>
                                </div>

                                {/* Difficulty & Unit Badge (Overlay at bottom) */}
                                <div className="px-3 py-2 bg-white/90 border-t flex justify-between items-center text-xs">
                                    <div className="flex items-center gap-1 overflow-hidden">
                                        <span className="bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded truncate max-w-[100px]">
                                            {q.unit || '단원 미분류'}
                                        </span>
                                    </div>
                                    <div onClick={e => e.stopPropagation()}>
                                        <select
                                            className={`border rounded px-1.5 py-0.5 text-xs font-bold appearance-none text-center w-10 ${parseInt(q.difficulty) >= 8 ? 'bg-red-50 text-red-600 border-red-200' :
                                                parseInt(q.difficulty) >= 5 ? 'bg-yellow-50 text-yellow-700 border-yellow-200' :
                                                    'bg-green-50 text-green-700 border-green-200'
                                                }`}
                                            value={q.difficulty || '1'}
                                            onChange={(e) => handleQuickDifficultyChange(q, e.target.value)}
                                        >
                                            {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
                                                <option key={n} value={n}>{n}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                            </div>

                            {/* Card Footer: Expanded Solution */}
                            {expandedSolutions.has(q.id) && (
                                <div className="bg-green-50/50 border-t-2 border-green-100 p-3 animate-in slide-in-from-top-2">
                                    <div className="flex justify-between items-center mb-2">
                                        <span className="text-xs font-bold text-green-700 flex items-center gap-1">
                                            📝 해설 (Solution)
                                        </span>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleManualCapture(q, 'solution');
                                            }}
                                            className="text-[10px] bg-white border border-green-200 text-green-600 px-2 py-0.5 rounded hover:bg-green-50"
                                        >
                                            + 추가 캡쳐
                                        </button>
                                    </div>
                                    <div className="max-h-64 overflow-y-auto bg-white rounded border border-green-100 p-2 text-xs">
                                        <QuestionRenderer
                                            xmlContent=""
                                            showDownloadAction={false}
                                            externalImages={q.question_images}
                                            onDeleteCapture={handleDeleteCapture}
                                            displayMode="solution"
                                        />
                                    </div>
                                </div>
                            )}

                            {/* Card Actions */}
                            <div className="p-2 border-t bg-gray-50 flex gap-1">
                                <button
                                    onClick={(e) => { e.stopPropagation(); setSelectedQuestion(q); }}
                                    className="flex-1 bg-white border border-gray-200 text-gray-700 py-1.5 rounded text-xs font-medium hover:bg-gray-50 hover:border-gray-300 transition-colors"
                                >
                                    수정
                                </button>
                                <button
                                    onClick={(e) => { e.stopPropagation(); handleManualCapture(q, 'question'); }}
                                    className="flex-1 bg-blue-50 border border-blue-100 text-blue-600 py-1.5 rounded text-xs font-medium hover:bg-blue-100 transition-colors flex items-center justify-center gap-1"
                                >
                                    📸 문제
                                </button>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        const newSet = new Set(expandedSolutions);
                                        if (newSet.has(q.id)) newSet.delete(q.id);
                                        else newSet.add(q.id);
                                        setExpandedSolutions(newSet);
                                    }}
                                    className={`flex-1 border py-1.5 rounded text-xs font-medium transition-colors flex items-center justify-center gap-1 ${expandedSolutions.has(q.id)
                                        ? 'bg-green-600 border-green-600 text-white'
                                        : 'bg-green-50 border-green-100 text-green-600 hover:bg-green-100'
                                        }`}
                                >
                                    {expandedSolutions.has(q.id) ? '접기' : '📝 해설'}
                                </button>
                                <button
                                    onClick={(e) => { e.stopPropagation(); handleFindSimilar(q); }}
                                    className="flex-1 bg-purple-50 border border-purple-100 text-purple-600 py-1.5 rounded text-xs font-medium hover:bg-purple-100 transition-colors flex items-center justify-center gap-1"
                                >
                                    🔍 유사
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

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
                                                externalImages={selectedQuestion.question_images}
                                                onDeleteCapture={handleDeleteCapture}
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

            {/* Similarity Search Result Modal */}
            {isSimilarModalOpen && similarityTarget && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4" onClick={() => setIsSimilarModalOpen(false)}>
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
                        <div className="p-4 border-b flex justify-between items-center bg-gray-50 rounded-t-xl">
                            <div className="flex items-center gap-3">
                                <span className="bg-purple-100 text-purple-700 px-3 py-1 rounded-full text-sm font-bold">🔍 유사 문항 검색</span>
                                <h3 className="font-bold text-lg text-gray-800">
                                    Q{similarityTarget.question_number} ({similarityTarget.school} {similarityTarget.year}) 와(과) 비슷한 문제
                                </h3>
                            </div>
                            <button onClick={() => setIsSimilarModalOpen(false)} className="text-gray-400 hover:text-gray-800 text-2xl font-bold">&times;</button>
                        </div>

                        <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
                            {/* Left: Original Question */}
                            <div className="w-full md:w-1/3 border-r bg-gray-50/50 p-4 overflow-y-auto hidden md:block">
                                <h4 className="font-bold text-gray-500 mb-4 text-sm uppercase tracking-wide">기준 문제 (Source)</h4>
                                <div className="bg-white p-4 rounded-xl border shadow-sm">
                                    <QuestionRenderer
                                        xmlContent={similarityTarget.content_xml}
                                        externalImages={similarityTarget.question_images}
                                        className="text-lg"
                                    />
                                    <div className="mt-4 pt-4 border-t text-sm text-gray-600 space-y-1">
                                        <p>🏷️ 학년: <span className="font-bold">{similarityTarget.grade}</span></p>
                                        <p>📚 단원: <span className="font-bold">{similarityTarget.unit}</span></p>
                                        <p>📊 난이도: <span className="font-bold">{similarityTarget.difficulty}</span></p>
                                    </div>
                                </div>
                            </div>

                            {/* Right: Similar Questions List */}
                            <div className="w-full md:w-2/3 p-6 overflow-y-auto bg-gray-50">
                                {loadingSimilar ? (
                                    <div className="flex flex-col items-center justify-center h-full text-gray-500 gap-4">
                                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
                                        <p className="animate-pulse">유사한 문제를 찾고 있습니다...</p>
                                    </div>
                                ) : similarQuestions.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center h-full text-gray-400">
                                        <div className="text-6xl mb-4">🤷‍♂️</div>
                                        <p>유사한 문제를 찾지 못했습니다.</p>
                                        <p className="text-sm mt-2">임베딩 데이터가 생성되었는지 확인해주세요.</p>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                        {similarQuestions.map((simQ, idx) => (
                                            <div key={simQ.id} className="bg-white rounded-xl border shadow-sm overflow-hidden flex flex-col hover:shadow-md transition-shadow">
                                                <div className="p-3 bg-purple-50/50 border-b flex justify-between items-center">
                                                    <div className="flex items-center gap-2">
                                                        <span className="bg-purple-600 text-white text-xs px-2 py-0.5 rounded-full font-bold">{idx + 1}위</span>
                                                        <span className="text-sm font-bold text-purple-900">{Math.round(simQ.similarity * 100)}% 일치</span>
                                                    </div>
                                                    <div className="text-xs text-gray-500">
                                                        {simQ.year} {simQ.school} {simQ.grade}
                                                    </div>
                                                </div>
                                                <div className="p-4 flex-1 overflow-hidden" style={{ minHeight: '300px' }}>
                                                    {simQ.plain_text ? (
                                                        <p className="whitespace-pre-wrap text-sm">{simQ.plain_text.slice(0, 200)}...</p>
                                                    ) : (
                                                        <p className="text-gray-400 italic">내용 미리보기 없음</p>
                                                    )}
                                                    <div className="mt-4 text-center">
                                                        <button
                                                            className="text-purple-600 hover:text-purple-800 text-sm font-bold underline"
                                                            onClick={async () => {
                                                                alert(`상세 보기 기능은 준비 중입니다. (ID: ${simQ.id})`);
                                                            }}
                                                        >
                                                            자세히 보기
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
