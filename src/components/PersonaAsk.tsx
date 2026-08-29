'use client';

import { useEffect, useState } from 'react';
import { PencilRuler, GraduationCap, X } from 'lucide-react';
import { ROLE_STORAGE_KEY, ROLE_SYNCED_KEY, syncRoleToProfile, type UserRole } from '@/components/RoleOnboardingModal';

/**
 * 한 줄짜리 역할 묻기 — 무료 PDF 를 받은 직후에 뜬다.
 *
 * [왜 필요했나 — 2026-08-30]
 * 회원 613명 중 **301명(49%)이 persona 미응답**이다. 시험지를 만든 50명 중 25명이 그 안에 있어서
 * '강사 전환율' 같은 지표가 실제 사용자의 1/4만 설명하고 있었다.
 *
 * 원인은 "안 물어봐서" 가 아니라 **물어보는 자리가 틀려서**다.
 * 기존 RoleOnboardingModal 은 홈에서만, 그것도 처음 한 번만 뜬다.
 * 그런데 우리 유입은 네이버에서 "2025 낙생고 1-2 중간고사" 로 검색해
 * **곧장 /exam/[id] 로 떨어진다.** 홈을 안 거치니 물어볼 기회가 아예 없었다.
 *
 * → 무료 PDF 를 받은 직후, 그 화면에서 한 번만 묻는다.
 *   다운로드를 막지 않는다. 닫으면 다시 안 뜬다. 이미 답한 사람에겐 안 뜬다.
 */

const DISMISS_KEY = 'mathetf_persona_ask_dismissed';

export default function PersonaAsk({ visible, onDone }: { visible: boolean; onDone?: () => void }) {
    const [show, setShow] = useState(false);

    useEffect(() => {
        if (!visible) return;
        if (typeof window === 'undefined') return;
        // 이미 역할을 골랐거나(온보딩·이 배너 어느 쪽이든) 닫은 적 있으면 안 띄운다
        const known = localStorage.getItem(ROLE_STORAGE_KEY)
            || localStorage.getItem(ROLE_SYNCED_KEY)
            || localStorage.getItem(DISMISS_KEY);
        if (!known) setShow(true);
    }, [visible]);

    const choose = async (role: UserRole) => {
        try { localStorage.setItem(ROLE_STORAGE_KEY, role); } catch { }
        setShow(false);
        onDone?.();
        // 프로필 반영은 온보딩과 같은 함수를 쓴다(실패해도 조용히, PersonaSync 가 재시도)
        void syncRoleToProfile(role);
        fetch('/api/log/feature', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ feature: 'persona_ask', title: role }),
        }).catch(() => { });
    };

    const dismiss = () => {
        try { localStorage.setItem(DISMISS_KEY, '1'); } catch { }
        setShow(false);
        onDone?.();
    };

    if (!show) return null;

    return (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[200] w-[calc(100%-2rem)] max-w-md">
            <div className="bg-white rounded-2xl border border-[#B7D1EA] shadow-xl p-4">
                <div className="flex items-start gap-2">
                    <p className="flex-1 text-sm font-bold text-[#1E2D4F] break-keep">
                        어느 쪽이신가요? 자료를 그쪽에 맞춰 보여드립니다.
                    </p>
                    <button onClick={dismiss} aria-label="닫기" className="text-slate-300 hover:text-slate-500 shrink-0">
                        <X size={16} />
                    </button>
                </div>
                <div className="flex gap-2 mt-3">
                    <button
                        onClick={() => choose('teacher')}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-[#3AADA9] hover:bg-[#2E948F] text-white text-sm font-extrabold rounded-xl transition-colors"
                    >
                        <PencilRuler size={15} /> 선생님·강사
                    </button>
                    <button
                        onClick={() => choose('student')}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-[#497AB7] hover:bg-[#3A6599] text-white text-sm font-extrabold rounded-xl transition-colors"
                    >
                        <GraduationCap size={15} /> 학생·학부모
                    </button>
                </div>
            </div>
        </div>
    );
}
