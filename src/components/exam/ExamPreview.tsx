'use client';
import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * 시험지 상세 미리보기(새 디자인). 한 장씩 보여주고 아래 단추로 넘긴다.
 * SEO: 모든 쪽을 DOM 에 두고 현재 쪽만 보이게 한다(옛 ExamPreviewCarousel 과 같음 — 그건 모의고사 페이지가 계속 씀).
 * A4 비율로 틀을 고정해 쪽을 넘겨도 본문이 출렁이지 않는다.
 */
export default function ExamPreview({ images, label }: { images: string[]; label: string }) {
    const [i, setI] = useState(0);
    const n = images.length;
    if (n === 0) return null;
    return (
        <div>
            <div className="rd-x-stage">
                {images.map((url, idx) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={idx} src={url} alt={`${label} 수학 기출문제 미리보기 ${idx + 1}페이지`} loading="eager"
                        style={{ opacity: idx === i ? 1 : 0, pointerEvents: idx === i ? 'auto' : 'none' }} />
                ))}
            </div>
            {n > 1 && (
                <div className="rd-x-pager">
                    <button type="button" className="rd-round" aria-label="이전 쪽" onClick={() => setI(p => (p - 1 + n) % n)}><ChevronLeft size={20} aria-hidden="true" /></button>
                    <span aria-live="polite">{i + 1} / {n}쪽</span>
                    <button type="button" className="rd-round" aria-label="다음 쪽" onClick={() => setI(p => (p + 1) % n)}><ChevronRight size={20} aria-hidden="true" /></button>
                </div>
            )}
        </div>
    );
}
