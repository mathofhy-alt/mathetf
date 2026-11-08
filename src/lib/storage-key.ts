// Keep the same whitelist in 20261108_storage_lockdown.sql (safe_storage_key).
// Reject noncanonical input; never decode, trim, or repair an untrusted key.
const BUCKETS = new Set(['exam-materials', 'hwpx', 'hwpx-originals', 'mock-materials', 'exam-previews', 'mock-previews', 'exam-free-problems', 'question-assets', 'exam-analysis', 'pdf-jobs', 'exams']);
export function storageKey(value: unknown): string | null {
    if (typeof value !== 'string' || !value || value.length > 1024 || value !== value.normalize('NFC')) return null;
    if (!/^[A-Za-z0-9가-힣_ .(),+\[\]/-]+$/.test(value) || value.includes('..')) return null;
    const parts = value.split('/');
    if (parts.some(p => !p || p === '.' || p !== p.trim()) || BUCKETS.has(parts[0].toLowerCase())) return null;
    return value;
}

export function originalKey(value: unknown): string | null {
    const key = storageKey(value);
    return key && /^raw_uploads\/[0-9a-f-]{36}\.(hml|hwpx)$/i.test(key) ? key : null;
}
