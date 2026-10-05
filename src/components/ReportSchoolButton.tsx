'use client';

import { Camera } from 'lucide-react';

/** 학교 페이지의 '이 학교 시험지 제보' — 헤더가 띄우는 원본 제보 창을 이 학교가 선택된 채로 연다 */
export default function ReportSchoolButton({ code, label, className }: { code: string; label: string; className?: string }) {
    return (
        <button type="button" onClick={() => window.dispatchEvent(new CustomEvent('open-original-report', { detail: { code } }))}
            className={className || 'inline-flex items-center justify-center gap-2 bg-[#638747] hover:bg-[#2E948F] text-white font-extrabold px-5 py-3 rounded-xl transition-colors'}>
            <Camera size={18} /> {label}
        </button>
    );
}
