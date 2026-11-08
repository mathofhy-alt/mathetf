import crypto from 'crypto';

export { BUNDLE_KEEP_DAYS } from './qbPassConfig';
export const bundleHash = (ids: string[]) => crypto.createHash('sha1').update([...ids].sort().join(',')).digest('hex').slice(0, 12);
export const bundleExpired = (job: { retain_until?: string | null }, now = Date.now()) =>
    !!job.retain_until && new Date(job.retain_until).getTime() <= now;

/** 미리보기에는 정답·해설을 보내지 않는다. 중첩된 미주/각주도 깊이로 제거한다. */
export function questionPreview(xml: string): string {
    let depth = 0, out = '', at = 0;
    const tags = /<\/?(?:[\w-]+:)?(?:ENDNOTE|FOOTNOTE)\b[^>]*>/gi;
    for (let m; (m = tags.exec(xml));) {
        if (!depth) out += xml.slice(at, m.index);
        if (m[0].startsWith('</')) depth = Math.max(0, depth - 1);
        else if (!m[0].endsWith('/>')) depth++;
        at = tags.lastIndex;
    }
    if (!depth) out += xml.slice(at);
    return out;
}
