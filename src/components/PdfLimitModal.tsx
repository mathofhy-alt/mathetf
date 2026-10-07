"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { X } from 'lucide-react';

/**
 * 무료 문제 PDF 하루 한도 안내 (10/7). 화면에는 횟수를 미리 적지 않고(사용자 결정),
 * 한도를 넘겨 받으려 할 때만 이 창으로 알린다. 받는 곳(시험지 페이지·홈)이 openPdfLimit 을 부르고,
 * 창은 헤더가 한 번만 그린다.
 */
export const openPdfLimit = (limit: number) => window.dispatchEvent(new CustomEvent('pdf-limit', { detail: { limit } }));

export default function PdfLimitModal() {
    const [limit, setLimit] = useState<number | null>(null);
    useEffect(() => {
        const h = (e: Event) => setLimit((e as CustomEvent).detail?.limit ?? 3);
        window.addEventListener('pdf-limit', h);
        return () => window.removeEventListener('pdf-limit', h);
    }, []);
    if (limit === null) return null;
    const close = () => setLimit(null);
    return (
        <div className="rd rd-overlay" style={{ zIndex: 320 }} onClick={e => { if (e.target === e.currentTarget) close(); }}>
            <div className="rd-modal rd-modal-sm" role="dialog" aria-modal="true" aria-labelledby="pdf-limit-title">
                <div className="rd-sheet-handle" aria-hidden="true" />
                <div className="rd-modal-head">
                    <h2 id="pdf-limit-title" className="rd-modal-title">오늘 받을 수 있는 무료 PDF를 다 받으셨어요</h2>
                    <button type="button" className="rd-modal-x" aria-label="닫기" onClick={close}><X size={20} /></button>
                </div>
                <p className="rd-modal-text">무료 문제 PDF는 하루 {limit}번까지 받을 수 있어요. 내일 다시 받을 수 있습니다.</p>
                <p className="rd-modal-note">더 필요하면 시험지 만들기에서 이 학교 문항을 골라 한글 파일로 만들 수 있어요.</p>
                <div className="rd-modal-actions">
                    <button type="button" className="rd-btn rd-btn-primary rd-btn-block" onClick={close}>확인</button>
                    <Link href="/question-bank" className="rd-btn rd-btn-gray rd-btn-block" onClick={close}>시험지 만들기로 가기</Link>
                </div>
            </div>
        </div>
    );
}
