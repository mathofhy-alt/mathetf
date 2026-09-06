import { createHmac, timingSafeEqual } from 'crypto';

/**
 * [수신거부] 로그인 없이 한 번 클릭으로 해제되는 서명 토큰.
 *
 * 왜 로그인을 안 받나: 정보통신망법이 요구하는 '수신 거부 방법'은 쉬워야 한다.
 * 메일을 받은 사람에게 로그인을 시키면 사실상 막아둔 것과 같고, 그러면 스팸 신고로 간다.
 * 스팸 신고는 도메인 평판을 깎아 이후 모든 메일이 스팸함으로 간다.
 *
 * ⚠ 서명 키는 SUPABASE_SERVICE_ROLE_KEY 에서 파생한다. 서버에만 있는 값이라 안전하지만,
 *   그 키를 교체하면 **이미 발송된 메일의 수신거부 링크가 전부 무효**가 된다.
 *   교체할 일이 생기면 그 사실을 기억할 것.
 */
function secret(): string {
    const k = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
    if (!k) throw new Error('SUPABASE_SERVICE_ROLE_KEY 없음 — 수신거부 토큰을 만들 수 없다');
    return k;
}

const b64url = (b: Buffer) => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export function makeUnsubToken(userId: string): string {
    const sig = createHmac('sha256', secret()).update(userId).digest();
    return `${userId}.${b64url(sig)}`;
}

/** 유효하면 userId, 아니면 null. 서명 비교는 타이밍 공격을 피해 상수시간으로 한다. */
export function verifyUnsubToken(token: string): string | null {
    const i = token.lastIndexOf('.');
    if (i <= 0) return null;
    const userId = token.slice(0, i);
    const given = token.slice(i + 1);
    const expect = b64url(createHmac('sha256', secret()).update(userId).digest());
    const a = Buffer.from(given), b = Buffer.from(expect);
    if (a.length !== b.length) return null;
    return timingSafeEqual(a, b) ? userId : null;
}
