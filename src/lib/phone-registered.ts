import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * 이 번호로 이미 가입한 계정이 있는지 (가입 시 user_metadata.phone 에 숫자만 저장됨).
 * [10/6] 같은 번호로 계정을 여러 개 만들어 하루 무료 PDF 한도를 늘리는 사례(22개 번호·46계정) → 1번호 1계정.
 * 기존 중복 계정은 그대로 두고, 새 가입만 막는다.
 * ※ find-id 와 같은 전체 조회 방식. 회원이 수만 명이 되면 profiles.phone 인덱스 조회로 바꿀 것.
 */
export async function isPhoneRegistered(admin: SupabaseClient, phone: string): Promise<boolean> {
    const target = phone.replace(/[^0-9]/g, '');
    if (!target) return false;
    const perPage = 1000;
    for (let page = 1; ; page++) {
        const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
        if (error) throw error;
        if (data.users.some(u => String(u.user_metadata?.phone ?? '').replace(/[^0-9]/g, '') === target)) return true;
        if (data.users.length < perPage) return false;
    }
}

export const PHONE_TAKEN_MESSAGE = '이미 가입된 휴대폰 번호입니다. 아이디 찾기로 기존 계정을 확인해주세요.';
