
'use client';

import React, { useEffect, useState } from 'react';
import { X, Loader2, Plus, Check } from 'lucide-react';
import { DEFAULT_SIMILAR_BASIS, fetchSimilarImages, fetchSimilarMeta } from '@/lib/similarPrefetch';
import QuestionRenderer from '@/components/QuestionRenderer';

interface SimilarQuestionsModalProps {
    onClose: () => void;
    baseQuestion: any;
    cart: any[];
    onToggleCart: (question: any) => void;
    onReplace?: (oldQuestion: any, newQuestion: any) => void;
    onViewSolution?: (question: any) => void;
}

export default function SimilarQuestionsModal({ onClose, baseQuestion, cart, onToggleCart, onReplace, onViewSolution }: SimilarQuestionsModalProps) {
    const [questions, setQuestions] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    // [유사 기준] 지금 임베딩(embedding)은 해설을 함께 담고 있어 실측 75%가 해설 = 사실상 '풀이 유사'.
    // 발문만의 임베딩(embedding_statement)을 따로 두어 사용자가 고르게 한다.
    const [basis, setBasis] = useState<'statement' | 'solution'>(DEFAULT_SIMILAR_BASIS);
    // 서버가 실제로 무엇을 썼는지 — 발문 임베딩이 없으면 풀이로 폴백한다.
    const [usedBasis, setUsedBasis] = useState<'statement' | 'solution' | null>(null);
    // [2단계 로딩 대응] 검색 직후엔 question_images 가 아직 안 와서(null) 원본이 비어 보일 수 있음
    // → 모달이 직접 이미지를 받아온다.
    const [baseImages, setBaseImages] = useState<any[] | null>(baseQuestion?.question_images ?? null);

    useEffect(() => {
        setBaseImages(baseQuestion?.question_images ?? null);
        if (baseQuestion?.id && baseQuestion.question_images == null) {
            fetch('/api/questions/images', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids: [baseQuestion.id] }),
            })
                .then(r => r.json())
                .then(j => { if (j.success) setBaseImages(j.images?.[baseQuestion.id] || []); })
                .catch(() => setBaseImages([]));
        }
    }, [baseQuestion]);

    useEffect(() => {
        if (!baseQuestion?.id) return;

        const fetchSimilar = async () => {
            setLoading(true);
            setError(null);
            try {
                // [성능] meta=1: 이미지 없이 결과만 먼저 → 카드 즉시 표시, 스피너 최소화
                // [성능 2026-10-01] '유사' 버튼에 올렸을 때 시작해 둔 요청(similarPrefetch)이 있으면 그걸 이어받는다.
                const { ok, json: data } = await fetchSimilarMeta(baseQuestion.id, basis);
                if (!ok) {
                    throw new Error(data?.error || 'Failed to fetch similar questions');
                }
                if (data.success) {
                    setUsedBasis(data.basis ?? null);
                    setQuestions(data.data);          // question_images: null → 카드는 스켈레톤으로 즉시
                    setLoading(false);
                    // 이미지는 한 번에 뒤따라 로드 (10개 ≤ API 상한 20)
                    const ids = (data.data || []).map((q: any) => q.id);
                    if (ids.length > 0) {
                        try {
                            const imgs = await fetchSimilarImages(ids).catch(() => ({} as Record<string, any[]>));
                            setQuestions(prev => prev.map(q => ({ ...q, question_images: imgs[q.id] || [] })));
                        } catch {
                            setQuestions(prev => prev.map(q => ({ ...q, question_images: q.question_images ?? [] })));
                        }
                    }
                } else {
                    throw new Error(data.error);
                }
            } catch (e: any) {
                console.error(e);
                setError(e.message);
                setLoading(false);
            }
        };

        fetchSimilar();
    }, [baseQuestion, basis]);

    return (
        <div role="dialog" aria-modal="true" aria-label="유사 문항 검색" className="rd rd-overlay">
            <div className="rd-modal rd-modal-flush rd-modal-xl">
                <div className="rd-sheet-handle" />
                {/* Header */}
                <div className="rd-modal-band rd-modal-head">
                    <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px 10px' }}>
                            <h2 className="rd-modal-title">유사 문항 검색</h2>
                            <span className="rd-tag rd-tag-ink">
                                {baseQuestion.school} {baseQuestion.exam_year}
                            </span>
                        </div>
                        <p className="rd-modal-sub">
                            {basis === 'statement'
                                ? '문제(발문)가 비슷한 문항을 찾습니다 — 묻는 내용이 닮은 문제.'
                                : '풀이가 비슷한 문항을 찾습니다 — 해결 방법이 닮은 문제.'}
                        </p>
                        <div className="rd-seg rd-seg-inline" style={{ marginTop: 12 }}>
                            {([
                                ['statement', '문제 유사'],
                                ['solution', '풀이 유사'],
                            ] as const).map(([key, label]) => (
                                <button
                                    key={key}
                                    onClick={() => setBasis(key)}
                                    disabled={loading}
                                    className={basis === key ? 'is-on' : ''}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                        {/* 발문 임베딩이 아직 없는 문항이면 서버가 풀이 기준으로 되돌린다. 조용히 속이지 않는다. */}
                        {basis === 'statement' && usedBasis === 'solution' && !loading && (
                            <p style={{ margin: '8px 0 0', fontSize: 13, fontWeight: 700, color: '#8A4B00' }}>
                                이 문항은 아직 발문 분석이 없어 풀이 유사로 찾았습니다.
                            </p>
                        )}
                    </div>
                    <button
                        onClick={onClose}
                        aria-label="닫기"
                        className="rd-modal-x"
                    >
                        <X size={22} />
                    </button>
                </div>

                {/* Body - Split View */}
                <div className="rd-similar-split">
                    {/* Left Panel - Fixed Original Question */}
                    <div className="rd-similar-base">
                        <div style={{ padding: '16px 20px 0' }}>
                            <h3 className="rd-sec-title">원본 문제</h3>
                        </div>
                        <div data-modal-scroll className="custom-scrollbar" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '12px 20px 20px' }}>
                            <div>
                                <QuestionRenderer
                                    xmlContent={baseQuestion.content_xml}
                                    externalImages={baseImages || undefined}
                                    showDownloadAction={false}
                                    className="border-none shadow-none p-0"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Right Panel - Scrollable Similar Questions */}
                    <div data-modal-scroll className="rd-similar-list">
                        {loading ? (
                            <div className="rd-empty">
                                <Loader2 size={36} className="animate-spin" style={{ color: 'var(--rd-ink)' }} />
                                <p style={{ margin: 0 }}>유사한 문제를 분석하고 있습니다...</p>
                            </div>
                        ) : error ? (
                            <div className="rd-empty">
                                <strong>오류가 발생했습니다</strong>
                                <p style={{ margin: 0, fontSize: 14 }}>{error}</p>
                            </div>
                        ) : questions.length === 0 ? (
                            <div className="rd-empty">
                                <strong>유사한 문제를 찾을 수 없습니다.</strong>
                                <p style={{ margin: 0, fontSize: 14 }}>임베딩 데이터가 생성되지 않았거나, 유사도가 낮은 경우일 수 있습니다.</p>
                            </div>
                        ) : (
                            <div className="rd-similar-grid">
                                {questions.map((q, idx) => {
                                    const inCart = !!cart.find(c => c.id === q.id);
                                    const similarity = q.similarity ? Math.round(q.similarity * 100) : null;

                                    return (
                                        <div key={q.id} className="rd-similar-card">
                                            {/* Card Header for Similar Item */}
                                            <div className="rd-similar-card-head">
                                                <div style={{ display: 'flex', gap: 6, alignItems: 'center', minWidth: 0 }}>
                                                    <span className="rd-tag">
                                                        #{idx + 1}
                                                    </span>
                                                    {similarity && (
                                                        <span className="rd-tag rd-tag-ink">
                                                            {similarity}%
                                                        </span>
                                                    )}
                                                    <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--rd-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                                                        {q.school}
                                                    </span>
                                                </div>
                                                <div style={{ display: 'flex', gap: 6, flex: 'none' }}>
                                                    {onReplace && (
                                                        <button
                                                            onClick={() => onReplace(baseQuestion, q)}
                                                            className="rd-btn rd-btn-gray rd-btn-sm"
                                                        >
                                                            교체
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={() => onToggleCart(q)}
                                                        className={`rd-btn rd-btn-sm rd-btn-tint${inCart ? ' rd-btn-on' : ''}`}
                                                    >
                                                        {inCart ? (
                                                            <><Check size={15} /> 담김</>
                                                        ) : (
                                                            <><Plus size={15} /> 담기</>
                                                        )}
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Question Content */}
                                            <div style={{ padding: 16, flex: 1, overflow: 'hidden', background: '#fff' }}>
                                                {q.question_images === null ? (
                                                    <div className="animate-pulse" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                                        <div style={{ height: 14, width: '75%', borderRadius: 8, background: 'var(--rd-panel)' }} />
                                                        <div style={{ height: 14, width: '100%', borderRadius: 8, background: 'var(--rd-panel)' }} />
                                                        <div style={{ height: 64, width: '100%', borderRadius: 10, background: 'var(--rd-panel)', marginTop: 4 }} />
                                                    </div>
                                                ) : (
                                                    <QuestionRenderer
                                                        xmlContent={q.content_xml}
                                                        externalImages={q.question_images}
                                                        showDownloadAction={false}
                                                        className="border-none shadow-none p-0 !text-sm"
                                                    />
                                                )}
                                            </div>

                                            {/* Card Footer - 해설보기 */}
                                            {onViewSolution && (
                                                <div style={{ padding: '10px 12px', borderTop: '1px solid var(--rd-line)', display: 'flex', justifyContent: 'flex-end' }}>
                                                    <button
                                                        onClick={() => onViewSolution(q)}
                                                        className="rd-btn rd-btn-gray rd-btn-sm"
                                                        style={{ minHeight: 36 }}
                                                    >
                                                        해설보기
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
