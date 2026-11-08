import { createAdminClient } from '@/utils/supabase/server-admin';
import { passStatus } from '@/lib/qbPass';
import { chooseCharge } from '@/lib/planAccess';
import { bundleExpired, bundleHash } from '@/lib/bundlePolicy';
import { resolveBundleSource, bundleIds, BundleError, bundleLimitMessage, ownedPrintBundle } from '@/lib/planBundles';

/** 생성/미리보기는 차감하지 않는다. 받을 횟수가 있거나 본인이 받은 같은 묶음이어야 한다. */
export async function previewAccess(user: { id: string; email?: string | null }, source: 'print' | 'predict', ids?: string[], body?: any) {
    const ps = await passStatus(user);
    if (body?.jobId) {
        const job = await ownedPrintBundle(user, body.jobId);
        if (!ids?.every(id => job.question_ids?.includes(id))) throw new BundleError('묶음에 없는 문항입니다.', 403);
        return ps;
    }
    if (ids?.length) {
        source = await resolveBundleSource(user, body?.setIds ? bundleIds(body.setIds) : ids, body?.receiptId);
        const setIds = body?.setIds ? bundleIds(body.setIds) : ids;
        if (!ids.every(id => setIds.includes(id))) throw new BundleError('잘못된 묶음 요청입니다.', 400);
        const { data, error } = await createAdminClient().from('pdf_jobs').select('status, hwp_ready, pdf_delivered, retain_until')
            .eq('user_id', user.id).eq('kind', source).eq('set_hash', bundleHash(setIds));
        if (error) throw new BundleError('묶음 기록을 확인하지 못했어요.', 503);
        const received = (data || []).filter(j => j.status === 'done' || j.hwp_ready || j.pdf_delivered);
        if (received.some(j => !bundleExpired(j))) return ps;
        // 만료 작업은 재사용하지 않는다. 새 영수증은 아래에서 현재 권한으로 심사한다.
    }
    if (!ps.unlimited && !chooseCharge(ps, source === 'print' ? 'bundle' : 'predict'))
        throw new BundleError(bundleLimitMessage(source), 402, true);
    return ps;
}
