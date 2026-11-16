import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/server-admin';
import { ADMIN_EMAIL, DOWNLOAD_TTL, downloadError, downloadRedirect, safeFilename } from '@/lib/downloads';
import { STORE_ITEM_TYPE } from '@/lib/store/config';
import { uuidPattern } from '@/lib/payments/order';

export const dynamic = 'force-dynamic';

/**
 * [11/17 대표] 서점 PDF 책 받기 — 산 회원만, 기간 제한 없음(책). 파일은 비공개 exam-materials 버킷,
 * 2분짜리 서명 주소로만 넘긴다(자료 다운로드와 같은 방식). 취소·환불된 결제는 막는다.
 */
export async function GET(req: Request) {
    try {
        const { data: { user }, error } = await createClient().auth.getUser();
        if (error || !user) return downloadError(401, '로그인 후 구매한 책을 받으실 수 있습니다.');
        const id = new URL(req.url).searchParams.get('book') || '';
        if (!uuidPattern.test(id)) return downloadError(400, '책 정보를 확인할 수 없습니다. 구매 내역에서 다시 선택해 주세요.');
        const sb = createAdminClient();
        if (user.email !== ADMIN_EMAIL) {
            const { data: rows, error: e1 } = await sb.from('purchased_items').select('payment_id').eq('user_id', user.id).eq('item_type', STORE_ITEM_TYPE).eq('item_id', id);
            if (e1) return downloadError(503, '구매 내역을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.');
            if (!rows?.length) return downloadError(403, '이 책의 구매 내역이 없습니다. 구매하신 계정으로 로그인해 주세요.');
            const ids = rows.map(r => r.payment_id).filter((v): v is string => !!v);
            const [history, orders] = await Promise.all([
                sb.from('payment_history').select('payment_id,status').eq('user_id', user.id).in('payment_id', ids),
                sb.from('payment_orders').select('payment_id,status').eq('user_id', user.id).in('payment_id', ids),
            ]);
            if (history.error || orders.error) return downloadError(503, '결제 상태를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.');
            const valid = ids.some(pid => {
                const h = (history.data || []).filter(r => r.payment_id === pid);
                const o = (orders.data || []).filter(r => r.payment_id === pid);
                return h.length > 0 && h.every(r => r.status === 'PAID') && o.every(r => r.status === 'completed');
            });
            if (!valid) return downloadError(403, '취소·환불되었거나 유효한 결제를 확인할 수 없는 책입니다. 고객센터로 문의해 주세요.');
        }
        const { data: book, error: e2 } = await sb.from('store_books').select('title,pdf_path').eq('id', id).maybeSingle();
        if (e2) return downloadError(503, '책 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
        if (!book) return downloadError(404, '책을 찾을 수 없습니다. 고객센터로 문의해 주세요.');
        if (!book.pdf_path) return downloadError(404, '이 책은 PDF로 받는 책이 아닙니다. 시험지 만들기의 개인DB에서 이용해 주세요.');
        const filename = safeFilename(`${book.title}.pdf`);
        const signed = await sb.storage.from('exam-materials').createSignedUrl(book.pdf_path, DOWNLOAD_TTL, { download: filename });
        if (signed.error || !signed.data?.signedUrl) return downloadError(503, '다운로드를 준비하지 못했습니다. 잠시 후 다시 시도해 주세요.');
        return downloadRedirect(signed.data.signedUrl, filename);
    } catch {
        return downloadError(503, '다운로드를 준비하지 못했습니다. 잠시 후 다시 시도해 주세요.');
    }
}
