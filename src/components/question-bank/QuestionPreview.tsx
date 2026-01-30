'use client';

import React from 'react';
import { X, ZoomIn } from 'lucide-react';

interface QuestionPreviewProps {
    question: any;
    position: { x: number, y: number } | null;
    onClose: () => void;
}

export default function QuestionPreview({ question, position, onClose }: QuestionPreviewProps) {
    if (!question || !position) return null;

    // Calculate position to prevent overflow
    // Default to displaying to the right of the cursor/element
    const style: React.CSSProperties = {
        top: position.y - 100, // Center vertically relative to trigger
        left: position.x + 20,
        zIndex: 50
    };

    // If too close to right edge, show on left
    if (window.innerWidth - position.x < 500) {
        style.left = 'auto'; // Reset left
        style.right = window.innerWidth - position.x + 20;
    }

    return (
        <div
            className="fixed bg-white rounded-xl shadow-2xl border p-4 w-[480px] max-h-[600px] flex flex-col pointer-events-none" // pointer-events-none prevents flickering if it covers trigger
            style={style}
        >
            <div className="flex justify-between items-start mb-2 border-b pb-2">
                <div>
                    <span className="font-bold text-lg text-slate-800 flex items-center gap-2">
                        <ZoomIn size={18} className="text-indigo-600" />
                        문제 미리보기
                    </span>
                    <div className="text-xs text-slate-500 mt-1">
                        {question.school} | {question.exam_year} | {question.grade}학년
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto bg-slate-50 rounded p-4 border min-h-[200px] flex items-center justify-center">
                {/* Logic to show Image vs Text */}
                {question.question_images && question.question_images[0] ? (
                    <img
                        src={question.question_images[0].data || question.question_images[0].public_url}
                        alt="Question"
                        className="max-w-full h-auto object-contain"
                    />
                ) : (
                    <div className="text-sm text-slate-700 whitespace-pre-wrap">
                        {question.content_text || question.plain_text || '(이미지/텍스트 없음)'}
                    </div>
                )}
            </div>

            <div className="mt-2 pt-2 border-t text-xs text-slate-400 flex justify-between">
                <span>단원: {question.unit || '미분류'}</span>
                <span className={`font-bold ${question.difficulty === 'Hard' ? 'text-red-500' : 'text-green-600'}`}>
                    {question.difficulty}
                </span>
            </div>
        </div>
    );
}
