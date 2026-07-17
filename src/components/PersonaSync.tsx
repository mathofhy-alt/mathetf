"use client";
import { useEffect } from 'react';
import { getStoredRole, syncRoleToProfile, ROLE_SYNCED_KEY } from '@/components/RoleOnboardingModal';

/**
 * localStorage 의 역할 선택(mathetf_role)을 로그인 후 profiles.persona 로 백필.
 * - 역할은 대부분 비로그인 첫 방문(온보딩 모달)에 선택되므로, 로그인된 페이지 로드 때 여기서 DB에 반영.
 * - 기존 회원도 다음 방문 때 자동 백필됨.
 * - 성공 시 mathetf_role_synced 에 값 기록 → 이후 방문에선 네트워크 요청 0회.
 */
export default function PersonaSync() {
    useEffect(() => {
        const role = getStoredRole();
        if (!role) return;
        if (localStorage.getItem(ROLE_SYNCED_KEY) === role) return;
        void syncRoleToProfile(role);
    }, []);
    return null;
}
