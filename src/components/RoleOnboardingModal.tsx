"use client";
import React, { useEffect, useState } from 'react';
import { GraduationCap, PencilRuler, X } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';

export type UserRole = 'student' | 'teacher';

export const ROLE_STORAGE_KEY = 'mathetf_role';
const STORAGE_KEY = ROLE_STORAGE_KEY;
export const ROLE_SYNCED_KEY = 'mathetf_role_synced';

/** 로그인 상태면 선택 역할을 profiles.persona 에 반영. 실패해도 조용히 넘어감(PersonaSync가 재시도). */
export async function syncRoleToProfile(role: UserRole): Promise<void> {
    try {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) return;
        const { error } = await supabase.from('profiles').update({ persona: role }).eq('id', session.user.id);
        if (!error) localStorage.setItem(ROLE_SYNCED_KEY, role);
    } catch { /* 오프라인·컬럼 미존재 등 — 다음 방문 때 PersonaSync가 재시도 */ }
}

export function getStoredRole(): UserRole | null {
    if (typeof window === 'undefined') return null;
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'student' || v === 'teacher' ? v : null;
}

/**
 * 첫 방문 시 1회 표시되는 역할 선택 모달.
 * - 학생·학부모 / 선생님·강사 를 골라 localStorage 에 저장 (다음 방문엔 안 뜸).
 * - onSelect 로 선택 역할을 넘겨, 이후 역할별 튜토리얼/기본화면 분기에 사용.
 */

export default function RoleOnboardingModal({ onSelect }: { onSelect?: (role: UserRole) => void; onClose?: () => void }) {
 const [role,setRole]=useState<UserRole|null>(null);
 useEffect(()=>{try{setRole(getStoredRole());}catch{}},[]);
 const choose=(value:UserRole)=>{setRole(value);try{localStorage.setItem(STORAGE_KEY,value);}catch{} void syncRoleToProfile(value);onSelect?.(value);};
 return <div aria-label="이용 목적 선택" className="text-sm"><p className="text-slate-500 mb-2">어떤 목적으로 이용하시나요? 선택하지 않아도 시작할 수 있습니다.</p>
 <div className="flex flex-wrap gap-2">{([['student','내 시험 대비'],['teacher','수업용 출제']] as const).map(([value,label])=><button key={value} type="button" aria-pressed={role===value} onClick={()=>choose(value)} className={`rounded-lg px-4 py-2 border ${role===value?'bg-brand-100 border-brand-400':'border-slate-200'}`}>{label}</button>)}</div>
 {role&&<p className="mt-2 text-slate-600">{role==='student'?'배운 단원에서 문제를 고르고, 틀린 문항을 다시 모아 연습하세요.':'수업 범위·난이도로 문항을 고르고, 기존 시험지를 복제해 반별로 편집하세요.'} <a className="underline" href={`/guide?audience=${role}`}>목적별 사용법</a></p>}</div>;
}
