'use client';

import React, { useState } from 'react';
import { X } from 'lucide-react';

interface ConfigModalProps {
    onClose: () => void;
    onConfirm: (title: string, questionsPerColumn: number, showSource: boolean) => void;
    isGenerating: boolean;
    onDraftChange?: (title:string, questionsPerColumn:number) => void;
    initialTitle?: string;
    initialQuestionsPerColumn?: number;
    initialShowSource?: boolean;
}

export default function ConfigModal({ onClose, onConfirm, isGenerating, initialTitle = '', initialQuestionsPerColumn = 2, initialShowSource = true, onDraftChange }: ConfigModalProps) {
    const [title, setTitle] = useState(initialTitle);
    const [questionsPerColumn, setQuestionsPerColumn] = useState(initialQuestionsPerColumn);
    const [showSource, setShowSource] = useState(initialShowSource);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!title.trim()) return;
        onConfirm(title, questionsPerColumn, showSource);
    };

    return (
        <div role="dialog" aria-modal="true" aria-label="시험지 설정" className="rd rd-overlay">
            <div className="rd-modal rd-modal-sm">
                <div className="rd-sheet-handle" />
                <div className="rd-modal-head">
                    <h3 className="rd-modal-title">시험지 설정</h3>
                    <button
                        aria-label="시험지 설정 닫기" onClick={onClose}
                        disabled={isGenerating}
                        className="rd-modal-x"
                    >
                        <X size={20} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                    <div className="rd-modal-body">
                    <div className="rd-field">
                        <label className="rd-field-label">
                            시험지 제목
                        </label>
                        <input
                            aria-label="시험지 제목" type="text"
                            maxLength={100}
                            value={title}
                            onChange={(e) => {setTitle(e.target.value);onDraftChange?.(e.target.value,questionsPerColumn);}}
                            placeholder="예: 공통수학2 기말고사 대비"
                            className="rd-input"
                            autoFocus
                        />
                        <p className="rd-help">
                            무료·시험지 1장권·시험대비권·강사 이용권 모두 보관함에 저장한 뒤 한글(HML)·PDF로 받을 수 있습니다.
                        </p>
                    </div>

                    <div className="rd-field">
                        <label className="rd-field-label">
                            열당 문제 수
                        </label>
                        <div className="rd-seg">
                            {[1, 2, 3].map((n) => (
                                <button
                                    key={n}
                                    type="button" aria-pressed={questionsPerColumn === n}
                                    onClick={() => {setQuestionsPerColumn(n);onDraftChange?.(title,n);}}
                                >
                                    {n}문제
                                </button>
                            ))}
                        </div>
                        <p className="rd-help">
                            한 열(단)에 배치할 문제 수를 선택하세요.
                        </p>
                    </div>

                    <div className="rd-field">
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                            <input
                                type="checkbox" aria-label="출처 표시"
                                checked={showSource}
                                onChange={(e) => setShowSource(e.target.checked)}
                                style={{ width: 18, height: 18, accentColor: '#497AB7' }}
                            />
                            <span className="rd-field-label" style={{ margin: 0 }}>출처 표시</span>
                        </label>
                        <p className="rd-help">
                            문제마다 바로 위에 출처를 한 줄로 넣습니다. 예: [출처] ○○고등학교 2025 2학기 기말 공통수학2 17번
                        </p>
                    </div>
                    </div>

                    <div className="rd-modal-foot">
                        <button
                            type="button"
                            aria-label="시험지 설정 닫기" onClick={onClose}
                            disabled={isGenerating}
                            className="rd-btn rd-btn-gray"
                        >
                            취소
                        </button>
                        <button
                            type="submit"
                            disabled={!title.trim() || isGenerating}
                            className="rd-btn rd-btn-primary"
                        >
                            {isGenerating ? '생성 중...' : '시험지 생성하기'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
