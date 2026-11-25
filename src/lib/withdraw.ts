import { createHash } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * [2026-11-25] 회원 탈퇴 후 7일 동안 같은 휴대폰 번호로 다시 가입하지 못하게 한다(대표 지시).
 * 원번호는 남기지 않는다 — 숫자만 뽑아 sha256 한 값과 탈퇴 시각만 withdrawn_phones 에 둔다.
 */
export const REJOIN_BLOCK_DAYS = 7;

export function withdrawnPhoneHash(phone: string): string {
    return createHash('sha256').update('mathetf-withdraw:' + phone.replace(/[^0-9]/g, '')).digest('hex');
}

/** 7일 안에 탈퇴한 번호면 다시 가입할 수 있는 날(Date), 아니면 null. */
export async function rejoinBlockedUntil(admin: SupabaseClient, phone: string): Promise<Date | null> {
    const digits = phone.replace(/[^0-9]/g, '');
    if (!digits) return null;
    const { data, error } = await admin.from('withdrawn_phones').select('withdrawn_at')
        .eq('phone_hash', withdrawnPhoneHash(digits)).maybeSingle();
    if (error || !data) return null;   // 표 조회가 실패하면 가입을 막지 않는다(가입 자체가 멈추는 쪽이 더 큰 손해)
    const until = new Date(new Date(data.withdrawn_at).getTime() + REJOIN_BLOCK_DAYS * 86400_000);
    return until > new Date() ? until : null;
}

export function rejoinBlockedMessage(until: Date): string {
    const kst = new Date(until.getTime() + 9 * 3600_000);
    return `탈퇴한 휴대폰 번호는 ${REJOIN_BLOCK_DAYS}일 동안 다시 가입할 수 없어요. ${kst.getUTCMonth() + 1}월 ${kst.getUTCDate()}일 ${kst.getUTCHours()}시 이후에 가입해 주세요.`;
}

export async function recordWithdrawnPhone(admin: SupabaseClient, phone: string): Promise<void> {
    const digits = phone.replace(/[^0-9]/g, '');
    if (!digits) return;
    // 7일 지난 기록은 쓸모가 없으니 함께 지운다(보관 기간 최소화)
    await admin.from('withdrawn_phones').delete().lt('withdrawn_at', new Date(Date.now() - REJOIN_BLOCK_DAYS * 86400_000).toISOString());
    const { error } = await admin.from('withdrawn_phones').upsert({ phone_hash: withdrawnPhoneHash(digits), withdrawn_at: new Date().toISOString() });
    if (error) throw error;
}
