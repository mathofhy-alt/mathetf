'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import { REPORT_REWARD_LABEL } from '@/lib/report-reward';

/**
 * 홈 첫 화면 팝업 — 원본 시험지 제보(무료 타이핑) 안내 (10/12 사용자 요청).
 * 누르면: 로그인했으면 무료 타이핑 창(헤더가 'open-original-report' 신호로 연다), 아니면 회원가입.
 * '오늘 하루 보지 않기' 는 이 브라우저에만(localStorage). 저장소가 막혀 있어도 팝업은 정상으로 뜨고 닫힌다.
 */
const KEY = 'home_report_popup_hide_until';

export default function ReportPopup() {
    const router = useRouter();
    const [open, setOpen] = useState(false);

    useEffect(() => {
        let until = 0;
        try { until = Number(localStorage.getItem(KEY) || 0); } catch { }
        if (Date.now() < until) return;
        const t = setTimeout(() => setOpen(true), 600);   // 첫 화면이 그려진 뒤에
        return () => clearTimeout(t);
    }, []);
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [open]);

    if (!open) return null;

    const hideToday = () => {
        const end = new Date(); end.setHours(24, 0, 0, 0);   // 이 브라우저의 오늘 자정까지
        try { localStorage.setItem(KEY, String(end.getTime())); } catch { }
        setOpen(false);
    };
    const go = async () => {
        setOpen(false);
        const { data: { user } } = await createClient().auth.getUser().catch(() => ({ data: { user: null } }));
        if (user) window.dispatchEvent(new CustomEvent('open-original-report'));
        else router.push('/signup?next=%2F');
    };

    return (
        <div className="rd rd-overlay rd-rpop-overlay" role="dialog" aria-modal="true" aria-label="원본 시험지 제보 안내"
            onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
            <div className="rd-rpop">
                <button type="button" className="rd-rpop-x" aria-label="닫기" onClick={() => setOpen(false)}><X size={20} /></button>
                <button type="button" className="rd-rpop-main" onClick={go}>
                    <img src="/report-popup.webp" alt="" width={720} height={538} />
                    <span className="rd-rpop-body">
                        <span className="rd-rpop-badge">무료 타이핑</span>
                        <span className="rd-rpop-title">원본 시험지를 제보해 주시면</span>
                        <span className="rd-rpop-sub">그림·해설까지 예쁘게 달아서<br /><b>한글 파일</b>로 드려요</span>
                        <span className="rd-rpop-reward"><b>{REPORT_REWARD_LABEL}</b>도 드려요</span>
                        <span className="rd-rpop-cta">시험지 제보하기</span>
                    </span>
                </button>
                <div className="rd-rpop-foot">
                    <button type="button" onClick={hideToday}>오늘 하루 보지 않기</button>
                    <button type="button" onClick={() => setOpen(false)}>닫기</button>
                </div>
            </div>
        </div>
    );
}
