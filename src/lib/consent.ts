// 마케팅 수신동의의 '어느 문구에 동의했는가'를 남기기 위한 상수.
//
// 2026-09-05 이전 동의문은 수집 항목이 "이메일 주소, 닉네임, 서비스 이용 기록" 뿐이고
// 전송 매체를 밝히지 않았다. 그 문구로 동의한 사람에게 문자를 보낼 근거가 없으므로,
// 버전이 없는(= 옛 문구) 회원은 이메일 전용으로 취급한다.
// 발송 스크립트는 반드시 marketingChannels() 를 거쳐 대상을 고른다.
export const MARKETING_CONSENT_VERSION = '2026-09-05';

/** 이 버전 문구가 포함하는 전송 매체 */
export const MARKETING_CHANNELS = ['email', 'sms'] as const;

/** 광고성 정보를 보낼 수 있는 시간대 (야간 전송은 별도 동의가 필요해 아예 받지 않았다) */
export const SEND_WINDOW_KST = { from: 8, to: 21 } as const;

type Meta = { marketing_agreed?: boolean; marketing_consent_version?: string } | null | undefined;

/** 이 회원에게 실제로 보낼 수 있는 매체. 동의 안 했으면 빈 배열. */
export function marketingChannels(meta: Meta): ('email' | 'sms')[] {
    if (!meta?.marketing_agreed) return [];
    // 버전이 없으면 2026-09-05 이전 문구 = 매체 미고지 → 이메일까지만.
    return meta.marketing_consent_version === MARKETING_CONSENT_VERSION
        ? ['email', 'sms']
        : ['email'];
}
