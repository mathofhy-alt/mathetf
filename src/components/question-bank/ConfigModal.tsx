'use client';

import React, { useState } from 'react';
import { X } from 'lucide-react';

interface ConfigModalProps {
    onClose: () => void;
    onConfirm: (title: string, questionsPerColumn: number) => void;
    isGenerating: boolean;
    onDraftChange?: (title:string, questionsPerColumn:number) => void;
    initialTitle?: string;
    initialQuestionsPerColumn?: number;
}

export default function ConfigModal({ onClose, onConfirm, isGenerating, initialTitle = '', initialQuestionsPerColumn = 2, onDraftChange }: ConfigModalProps) {
    const [title, setTitle] = useState(initialTitle);
    const [questionsPerColumn, setQuestionsPerColumn] = useState(initialQuestionsPerColumn);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!title.trim()) return;
        onConfirm(title, questionsPerColumn);
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
                            한글에서 열어 편집하는 HML 파일로 저장합니다. PDF는 한글에서 변환할 수 있습니다.
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
