import { createHmac, timingSafeEqual } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { storageKey } from './storage-key';

function signature(payload: string, secret: string) { return createHmac('sha256', secret).update(payload).digest('base64url'); }
export function uploadProof(user: string, path: string, size: number, secret: string, now = Date.now()) {
    if (!secret) throw Error('Missing upload signing secret');
    const payload = Buffer.from(JSON.stringify({ user, path, size, expires: now + 2 * 3600_000 })).toString('base64url');
    return `${payload}.${signature(payload, secret)}`;
}

export async function registerMaterial(sb: SupabaseClient, user: { id: string; email?: string; user_metadata?: Record<string, unknown> }, body: any, secret: string, now = Date.now()) {
    const [payload, mac, extra] = String(body?.proof || '').split('.');
    if (!secret || !payload || !mac || extra) throw Error('Invalid upload proof');
    const expected = Buffer.from(signature(payload, secret));
    const supplied = Buffer.from(mac);
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) throw Error('Invalid upload proof');
    const proof = JSON.parse(Buffer.from(payload, 'base64url').toString());
    const key = storageKey(proof.path);
    if (proof.user !== user.id || !key || !key.startsWith(user.id + '/') || proof.expires < now || !Number.isSafeInteger(proof.size)) throw Error('Invalid upload proof');
    // Confirm the server-issued key was actually uploaded. No client supplied path is used.
    const name = key.slice(user.id.length + 1);
    const files = await sb.storage.from('exam-materials').list(user.id, { search: name, limit: 100 });
    if (files.error || !files.data?.some(f => f.name === name && Number(f.metadata?.size) === proof.size)) throw Error('Upload not found');
    const m = body?.metadata;
    if (!m || !['PDF', 'HWP', 'HML', 'HWPX', 'IMAGE', 'JPG', 'JPEG', 'PNG', 'WEBP', 'HEIC', 'HEIF'].includes(m.file_type) || !['해설', '문제', '원본제보'].includes(m.content_type)) throw Error('Invalid metadata');
    const ext = key.split('.').pop()!.toLowerCase();
    if (m.content_type !== '원본제보' && !(m.file_type === 'PDF' ? ext === 'pdf' : m.file_type === 'HWP' && ['hwp','hwpx','hml'].includes(ext))) throw Error('Invalid file type');
    const text: Record<string, string> = {};
    for (const field of ['school','region','district','subject','title','exam_type']) {
        if (typeof m[field] !== 'string' || m[field].length > 300 || /[\x00-\x1f]/.test(m[field])) throw Error('Invalid metadata');
        text[field] = m[field];
    }
    if (!text.school || text.school === 'DELETED' || !text.title || !text.subject || !Number.isInteger(m.exam_year) || m.exam_year < 1980 || m.exam_year > 2100 || !Number.isInteger(m.grade) || m.grade < 1 || m.grade > 6 || !Number.isInteger(m.semester) || m.semester < 1 || m.semester > 12) throw Error('Invalid metadata');
    // Replays use the same server UUID as the row ID and cannot create another listing.
    const id = name.match(/_([0-9a-f-]{36})\.[a-z]+$/i)?.[1];
    if (!id) throw Error('Invalid upload key');
    const result = await sb.from('exam_materials').insert({
        ...text, id, exam_year: m.exam_year, grade: m.grade, semester: m.semester,
        uploader_id: user.id, uploader_name: String(user.user_metadata?.display_name || user.user_metadata?.full_name || user.email?.split('@')[0] || '회원').slice(0,100),
        file_path: key, file_type: m.file_type, content_type: m.content_type,
        price: m.content_type === '원본제보' ? 0 : m.file_type === 'PDF' ? 1000 : 2000, sales_count: 0,
    });
    if (result.error) throw Error('Registration failed');
}
