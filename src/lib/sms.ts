import { SolapiMessageService } from 'solapi';

/**
 * 운영 안내 문자 (10/8) — 가입 인증 문자와 같은 솔라피 계정·발신번호.
 * 개발 서버에서는 보내지 않고 로그만 남긴다(운영 DB 를 같이 써서 실제 회원에게 갈 수 있다).
 * 실패해도 호출한 일(채택 등)은 그대로 진행하도록 예외를 던지지 않고 결과만 돌려준다.
 */
export type SmsResult = 'sent' | 'scheduled' | 'no_phone' | 'dev' | 'failed';

/** 밤(KST 21시~다음 날 9시)이면 그다음 오전 9시, 아니면 null(바로 보냄). 사용자: "새벽에 채택을 누를 일이 많다" */
export function quietHoursSendAt(now = new Date()): Date | null {
    const kst = new Date(now.getTime() + 9 * 3600_000);
    const h = kst.getUTCHours();
    if (h >= 9 && h < 21) return null;
    const at = new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate(), 0, 0, 0));   // 그날 KST 9시 = UTC 0시
    if (h >= 21) at.setUTCDate(at.getUTCDate() + 1);
    return at;
}

export async function sendNotice(phone: string | null | undefined, text: string, opts: { quietHours?: boolean } = {}): Promise<SmsResult> {
    const to = String(phone || '').replace(/[^0-9]/g, '');
    if (!/^01\d{8,9}$/.test(to)) return 'no_phone';
    const key = process.env.SOLAPI_API_KEY, secret = process.env.SOLAPI_API_SECRET;
    if (!key || !secret || process.env.NODE_ENV === 'development') {
        console.log(`[개발 모드 문자] ${to}: ${text}`, opts.quietHours ? quietHoursSendAt() : '');
        return 'dev';
    }
    try {
        const at = opts.quietHours ? quietHoursSendAt() : null;
        await new SolapiMessageService(key, secret).send({ to, from: process.env.SOLAPI_SENDER_NUMBER || '07079544146', text }, at ? { scheduledDate: at.toISOString() } : undefined);
        return at ? 'scheduled' : 'sent';
    } catch (e) {
        console.error('[sms] 발송 실패', e);
        return 'failed';
    }
}
