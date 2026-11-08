import type { SupabaseClient, User } from '@supabase/supabase-js';
import { storageKey } from './storage-key';

export const ADMIN_EMAIL = 'mathofhy@naver.com';
export const DOWNLOAD_TTL = 120;
const MONTH_MS = 30 * 86400_000;

export function safeFilename(value: string): string {
    const clean = value.replace(/[\x00-\x1f\x7f\\/<>:"|?*]/g, '_');
    if (clean.length <= 220) return clean || '자료';
    const ext = clean.match(/\.[a-z0-9]{1,10}$/i)?.[0] || '';
    return clean.slice(0, 220 - ext.length) + ext;
}

export function attachment(filename: string): string {
    const encoded = encodeURIComponent(safeFilename(filename)).replace(/['()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
    return `attachment; filename="download.${filename.split('.').pop()?.replace(/[^a-z0-9]/gi, '') || 'bin'}"; filename*=UTF-8''${encoded}`;
}

export function downloadError(status: number, message: string): Response {
    // Messages are fixed server strings. Never reflect a storage path or upstream error.
    return new Response(`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>자료 다운로드 안내</title><body style="font-family:system-ui;max-width:36rem;margin:15vh auto;padding:24px;line-height:1.7"><h1 style="font-size:24px">자료 다운로드 안내</h1><p>${message}</p><p><a href="/login">로그인하기</a> · <a href="/mypage">구매 내역 보기</a> · <a href="/">홈으로</a></p></body></html>`, {
        status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'" },
    });
}

export function downloadRedirect(url: string, filename: string): Response {
    // storage-js uses encodeURI for download filenames; encode this query value
    // separately so '+', '&', and '#' in Korean titles survive unchanged.
    const location = new URL(url);
    location.searchParams.set('download', safeFilename(filename));
    return new Response(null, { status: 302, headers: {
        Location: location.toString(), 'Content-Disposition': attachment(filename),
        'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer',
        'X-Content-Type-Options': 'nosniff',
    } });
}

export function purchaseIsCurrent(purchase: { created_at: string; payment_id?: string | null }, now = Date.now()): boolean {
    if (purchase.payment_id?.startsWith('typing-')) return true;
    const paidAt = Date.parse(purchase.created_at);
    return Number.isFinite(paidAt) && paidAt <= now && now - paidAt < MONTH_MS;
}

export async function materialDownload(admin: SupabaseClient, user: Pick<User, 'id' | 'email'> | null, item: string, now = Date.now()): Promise<Response> {
    if (!user) return downloadError(401, '로그인 후 자료를 다운로드하실 수 있습니다.');
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(item)) return downloadError(400, '자료 정보를 확인할 수 없습니다. 구매 내역에서 다시 선택해 주세요.');
    try {
        const isAdmin = user.email === ADMIN_EMAIL;
        if (!isAdmin) {
            // Both generations are scoped on the server, independently of browser/RLS state.
            const [current, legacy] = await Promise.all([
                admin.from('purchased_items').select('created_at,payment_id,price_paid').eq('user_id', user.id).eq('item_id', item),
                admin.from('purchases').select('created_at').eq('user_id', user.id).eq('exam_id', item),
            ]);
            if (current.error || legacy.error) return downloadError(503, '구매 내역을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.');
            // A legacy row cannot resurrect a revoked modern entitlement for the same item.
            const purchases = current.data?.length ? current.data : legacy.data || [];
            if (!purchases.length) return downloadError(403, '이 자료의 구매 내역이 없습니다. 구매하신 계정으로 로그인해 주세요.');
            if (!purchases.some(p => purchaseIsCurrent(p, now))) return downloadError(410, '다운로드 가능 기간인 결제일로부터 30일이 지났습니다. 무료 타이핑 자료는 기간 제한 없이 받으실 수 있습니다.');
            if (current.data?.length) {
                const candidates = current.data.filter(p => purchaseIsCurrent(p, now));
                const ids = [...new Set(candidates.map(p => p.payment_id).filter((id): id is string => typeof id === 'string' && !!id))];
                const [history, orders] = await Promise.all([
                    admin.from('payment_history').select('payment_id,status').eq('user_id', user.id).in('payment_id', ids),
                    admin.from('payment_orders').select('payment_id,status').eq('user_id', user.id).in('payment_id', ids),
                ]);
                if (history.error || orders.error) return downloadError(503, '결제 상태를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.');
                const valid = candidates.some(p => {
                    const h = (history.data || []).filter(r => r.payment_id === p.payment_id);
                    const o = (orders.data || []).filter(r => r.payment_id === p.payment_id);
                    // Any non-paid state (including partial refunds) revokes this payment.
                    if (h.some(r => r.status !== 'PAID') || o.some(r => r.status !== 'completed')) return false;
                    if (p.payment_id?.startsWith('typing-')) return p.price_paid === 0;
                    return h.length > 0 && (!p.payment_id?.startsWith('order-') || o.length > 0);
                });
                if (!valid) return downloadError(403, '취소·환불되었거나 유효한 결제를 확인할 수 없는 자료입니다. 고객센터로 문의해 주세요.');
            }
        }
        const { data: row, error } = await admin.from('exam_materials')
            .select('id,file_path,file_type,content_type,school,exam_year,grade,semester,exam_type').eq('id', item).maybeSingle();
        if (error) return downloadError(503, '자료 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
        if (!row?.file_path || row.school === 'DELETED') return downloadError(404, '자료를 찾을 수 없습니다. 고객센터로 문의해 주세요.');
        const key = storageKey(row.file_path);
        if (!key) return downloadError(400, '자료의 파일 정보를 확인할 수 없습니다. 고객센터로 문의해 주세요.');
        if (!isAdmin && (row.file_type === 'DB' || row.content_type === '개인DB' || row.content_type === '원본제보')) return downloadError(403, '이 자료는 직접 다운로드할 수 없습니다. 개인DB 자료는 시험지 만들기에서 이용해 주세요.');
        const ext = row.file_path.match(/\.([a-z0-9]{1,10})$/i)?.[1] || (row.file_type === 'PDF' ? 'pdf' : 'hwp');
        const filename = safeFilename(`${row.school}_${row.exam_year}_${row.grade}_${row.semester}_${row.exam_type}_${row.content_type || '자료'}.${ext}`);
        const signed = await admin.storage.from('exam-materials').createSignedUrl(key, DOWNLOAD_TTL, { download: filename });
        if (signed.error || !signed.data?.signedUrl) return downloadError(503, '다운로드를 준비하지 못했습니다. 잠시 후 다시 시도해 주세요.');
        return downloadRedirect(signed.data.signedUrl, filename);
    } catch {
        return downloadError(503, '다운로드를 준비하지 못했습니다. 잠시 후 다시 시도해 주세요.');
    }
}
