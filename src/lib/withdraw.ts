import { createHash, createHmac } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * [2026-11-25] 회원 탈퇴 후 7일 동안 같은 휴대폰 번호로 다시 가입하지 못하게 한다(대표 지시).
 * 원번호는 남기지 않는다 — 서버 비밀키로 만든 HMAC 값과 탈퇴 시각만 withdrawn_phones 에 둔다.
 *   (번호는 경우의 수가 적어 비밀키 없는 해시는 몇 분이면 역산된다 — 11/25 배포 전 검토)
 *   비밀키 = WITHDRAW_PHONE_SECRET, 없으면 서비스 키(서버 환경변수에만 있고 DB·저장소에는 없음).
 * 7일 지난 행은 매일 예약 작업(cron withdrawn-phones-cleanup)과 탈퇴 처리 때 지운다.
 */
export const REJOIN_BLOCK_DAYS = 7;
const DAY = 86400_000;

function secret(): string {
    const s = process.env.WITHDRAW_PHONE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!s) throw new Error('withdraw: 비밀키 없음');
    return s;
}
const digitsOf = (phone: string) => String(phone || '').replace(/[^0-9]/g, '');

export function withdrawnPhoneHash(phone: string): string {
    return createHmac('sha256', secret()).update(digitsOf(phone)).digest('hex');
}
// 11/25 19:30 첫 처리분(비밀키 없는 sha256) — 7일(12/2)까지만 함께 본다
const legacyHash = (phone: string) => createHash('sha256').update('mathetf-withdraw:' + digitsOf(phone)).digest('hex');

/** 7일 안에 탈퇴한 번호면 다시 가입할 수 있는 시각, 아니면 null. */
export async function rejoinBlockedUntil(admin: SupabaseClient, phone: string): Promise<Date | null> {
    const d = digitsOf(phone);
    if (!d) return null;
    const { data, error } = await admin.from('withdrawn_phones').select('withdrawn_at')
        .in('phone_hash', [withdrawnPhoneHash(d), legacyHash(d)]).order('withdrawn_at', { ascending: false }).limit(1);
    if (error || !data?.length) return null;   // 표 조회가 실패하면 가입을 막지 않는다(가입 자체가 멈추는 쪽이 더 큰 손해)
    const until = new Date(new Date(data[0].withdrawn_at).getTime() + REJOIN_BLOCK_DAYS * DAY);
    return until > new Date() ? until : null;
}

export function rejoinBlockedMessage(until: Date): string {
    const k = new Date(until.getTime() + 9 * 3600_000 + 59_999);   // 분 단위로 올림(안내한 시각에 다시 막히지 않게)
    const mm = String(k.getUTCMinutes()).padStart(2, '0');
    return `탈퇴한 휴대폰 번호는 ${REJOIN_BLOCK_DAYS}일 동안 다시 가입할 수 없어요. ${k.getUTCMonth() + 1}월 ${k.getUTCDate()}일 ${k.getUTCHours()}시 ${mm}분 이후에 가입해 주세요.`;
}

/** 가입 인증 기록에 남은 원번호를 지운다(탈퇴·재가입 차단 때). */
export async function purgePhoneVerifications(admin: SupabaseClient, phone: string): Promise<void> {
    const d = digitsOf(phone);
    if (d) await admin.from('phone_verifications').delete().eq('phone_number', d);
}

export async function recordWithdrawnPhone(admin: SupabaseClient, phone: string): Promise<void> {
    const d = digitsOf(phone);
    if (!d) return;
    await admin.from('withdrawn_phones').delete().lt('withdrawn_at', new Date(Date.now() - REJOIN_BLOCK_DAYS * DAY).toISOString());
    const { error } = await admin.from('withdrawn_phones').upsert({ phone_hash: withdrawnPhoneHash(d), withdrawn_at: new Date().toISOString() });
    if (error) throw error;
    await purgePhoneVerifications(admin, d);
}
