import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/server-admin';
import { checkPaymentProvider, readOrder, reconcileOrder } from '@/lib/payments/reconcile';
import { createHash, timingSafeEqual } from 'node:crypto';
import { uuidPattern } from '@/lib/payments/order';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export async function GET(req: NextRequest) {
    const authorization = req.headers.get('authorization');
    if (!authorization?.startsWith('Bearer ')) return new NextResponse(null, { status: 401 });
    const sb = createAdminClient();
    // This value is generated inside the migration, never configured in Vercel
    // and never exposed through a public RPC or client-readable table.
    const { data: config, error: configError } = await sb.from('payment_reconcile_config').select('secret').eq('id', true).single();
    if (configError || !config?.secret) return new NextResponse(null, { status: 503 });
    const hash = (value: string) => createHash('sha256').update(value).digest();
    if (!timingSafeEqual(hash(authorization), hash(`Bearer ${config.secret}`))) return new NextResponse(null, { status: 401 });
    let providerHealthy = true;
    try { await checkPaymentProvider(); }
    catch { providerHealthy = false; }
    const processQueue = async (queue: string, limit: number) => {
        // Do not lease work while credentials or provider access are broken.
        if (!providerHealthy) return { healthy: true, outcomes: [] as string[] };
        const { data, error } = await sb.rpc('claim_payment_reconciliation_v3', { p_limit: limit, p_queue: queue });
        if (error || !Array.isArray(data)) return { healthy: false, outcomes: [] as string[] };
        // Twenty concurrent provider lookups keep a 40-row legacy batch within
        // two timeout windows; active refund capacity is reserved independently.
        const outcomes: string[] = [];
        for (let i = 0; i < (data || []).length; i += 20) outcomes.push(...await Promise.all(data.slice(i, i + 20).map(async (claimed: any) => {
            try {
                await reconcileOrder(sb, await readOrder(sb, claimed.payment_id));
                return 'completed';
            } catch (e: any) {
                if (['PAYMENT_CONFIG', 'PAYMENT_AUTH'].includes(e?.message) || e?.providerUnavailable) providerHealthy = false;
                return ['PAYMENT_REFUNDED', 'PAYMENT_SUPERSEDED', 'PAYMENT_PENDING', 'PAYMENT_NOT_PAID', 'PAYMENT_RETRY_CHOICE', 'PAYMENT_CLOSED', 'PAYMENT_MANUAL_REVIEW'].includes(e?.message) ? e.message : 'retry';
            }
        })));
        return { healthy: true, outcomes };
    };
    const [urgent, pending, completed, legacy] = await Promise.all([
        processQueue('refund', 20), processQueue('pending', 20), processQueue('completed', 20), processQueue('legacy', 40),
    ]);
    const queues = [urgent, pending, completed, legacy];
    const results = queues.flatMap(queue => queue.outcomes);
    // A leased order can fail independently (including a permanent exception).
    // Provider access, queue access and the run record measure availability;
    // order failures remain visible and retryable without closing all checkout.
    const workerHealthy = providerHealthy && queues.every(queue => queue.healthy);
    const orderFailures = results.filter(result => result === 'retry').length;
    const summary = { success: workerHealthy, workerHealthy, providerHealthy, allOrdersProcessed: workerHealthy && orderFailures === 0,
        orderFailures, queueFailures: queues.filter(queue => !queue.healthy).length,
        checked: results.length, urgentChecked: urgent.outcomes.length, pendingChecked: pending.outcomes.length,
        completedChecked: completed.outcomes.length, legacyChecked: legacy.outcomes.length, results };
    const dispatchId = req.headers.get('x-payment-reconcile-dispatch');
    const { error: recordError } = await sb.rpc('record_payment_reconciliation_run', {
        p_results: summary, p_dispatch_id: dispatchId && uuidPattern.test(dispatchId) ? dispatchId : null,
    });
    return NextResponse.json({ ...summary, success: workerHealthy && !recordError, workerHealthy: workerHealthy && !recordError }, { status: !workerHealthy || recordError ? 503 : 200 });
}

// pg_net uses POST; GET remains usable by authenticated operational probes.
export const POST = GET;
