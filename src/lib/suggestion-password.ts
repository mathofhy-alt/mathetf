import { scryptSync, randomBytes, timingSafeEqual } from 'crypto';

// 건의사항 비밀글 비밀번호 해시 (scrypt).
// 저장 형식: "scrypt$<salt hex>$<hash hex>" — 이 접두사가 없으면 레거시 평문으로 간주.

const KEYLEN = 32;

export function hashPassword(plain: string): string {
    const salt = randomBytes(16).toString('hex');
    const hash = scryptSync(plain, salt, KEYLEN).toString('hex');
    return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(plain: string, stored: string): boolean {
    if (!stored) return false;
    if (stored.startsWith('scrypt$')) {
        const [, salt, hash] = stored.split('$');
        if (!salt || !hash) return false;
        const candidate = scryptSync(plain, salt, KEYLEN);
        const expected = Buffer.from(hash, 'hex');
        return candidate.length === expected.length && timingSafeEqual(candidate, expected);
    }
    // 레거시 평문 행 — 일치 시 호출부에서 해시로 업그레이드
    const a = Buffer.from(plain);
    const b = Buffer.from(stored);
    return a.length === b.length && timingSafeEqual(a, b);
}

export function isLegacyPlaintext(stored: string): boolean {
    return !!stored && !stored.startsWith('scrypt$');
}
