'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import { REPORT_REWARD_LABEL } from '@/lib/report-reward';

/**
 * 홈 첫 화면 팝업 — 원본 시험지 제보(무료 타이핑) 안내 (10/12 사용자 요청).
 * 누르면: 로그인했으면 무료 타이핑 창(헤더가 'open-original-report' 신호로 연다), 아니면 회원가입.
 * [10/12 사용자 승인] 처음 온 사람에게 한 번, 그 뒤로는 일주일에 한 번만(마지막으로 띄운 시각, 이 브라우저 localStorage).
 *   이미 원본을 제보한 회원에게는 안 띄운다(/api/original-report?has=1). 노출·클릭은 feature_usage 에
 *   report_popup_view / report_popup_click (title = 'user' | 'anon') 으로 남긴다.
 *   저장소가 막혀 있으면 매번 뜰 수 있지만 닫기는 정상으로 된다.
 */
const KEY = 'home_report_popup_last_shown';
const WEEK = 7 * 864e5;

const log = (feature: string, who: string) => {
    fetch('/api/log/feature', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ feature, title: who }) }).catch(() => { });
};

export default function ReportPopup() {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [who, setWho] = useState<'user' | 'anon'>('anon');

    useEffect(() => {
        let last = 0;
        try { last = Number(localStorage.getItem(KEY) || 0); } catch { }
        if (Date.now() - last < WEEK) return;
        let alive = true;
        const t = setTimeout(async () => {   // 첫 화면이 그려진 뒤에
            const j = await fetch('/api/original-report?has=1').then(r => r.json()).catch(() => ({ has: false, user: false }));
            if (!alive || j.has) return;   // 이미 제보한 회원
            const w = j.user ? 'user' : 'anon';
            try { localStorage.setItem(KEY, String(Date.now())); } catch { }
            setWho(w); setOpen(true); log('report_popup_view', w);
        }, 600);
        return () => { alive = false; clearTimeout(t); };
    }, []);
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [open]);

    if (!open) return null;

    const go = async () => {
        setOpen(false);
        log('report_popup_click', who);
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
                    <button type="button" onClick={() => setOpen(false)}>닫기</button>
                </div>
            </div>
        </div>
    );
}
