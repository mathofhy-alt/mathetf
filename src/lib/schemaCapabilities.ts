import type { createAdminClient } from '@/utils/supabase/server-admin';

type Admin = ReturnType<typeof createAdminClient>;
type Capability = 'paymentResolution' | 'oncePurchaseUsage' | 'paymentCreation' | 'submissionReward';
const probes = {
    // Each marker is committed atomically with the functions/view it enables.
    paymentResolution: ['payment_orders', 'legacy_resolution'],
    oncePurchaseUsage: ['plan_usage', 'qb_once_purchase_id,qb_exam_purchase_id'],
    paymentCreation: ['payment_orders', 'create_request_id'],
    submissionReward: ['submission_reward_capability', 'installed'],
} as const;
const cache = new Map<string, { until: number; value: boolean }>();
const pending = new Map<string, Promise<boolean>>();
const TTL = 5_000;

/** Read-only, zero-row probes; never call a fulfillment RPC to detect a schema. */
export async function hasSchemaCapability(sb: Admin, capability: Capability): Promise<boolean> {
    const key = `${process.env.NEXT_PUBLIC_SUPABASE_URL || ''}:${capability}`;
    const saved = cache.get(key);
    if (saved && saved.until > Date.now()) return saved.value;
    const running = pending.get(key);
    if (running) return running;
    const check = (async () => {
        const [table, column] = probes[capability];
        const { error } = await sb.from(table).select(column).limit(0);
        // A missing column is expected before/after a rolled-back migration.
        // Permission, network and database failures must not erase usage history.
        if (error && !['42703', 'PGRST204', ...(capability === 'submissionReward' ? ['42P01', 'PGRST205'] : [])].includes(error.code)) throw new Error('SCHEMA_CHECK_RETRY');
        const value = !error;
        cache.set(key, { value, until: Date.now() + TTL });
        return value;
    })();
    pending.set(key, check);
    try { return await check; }
    finally { pending.delete(key); }
}

/** Preparation preserves the deployed INSERT contract until explicit cutover. */
export async function paymentCreationMode(sb: Admin, requiresWorker = true): Promise<'legacy' | 'modern' | 'closed'> {
    if (!await hasSchemaCapability(sb, 'paymentCreation')) return 'legacy';
    // After cutover, a validated zero-card quote uses the locked RPC without
    // depending on provider/scheduler health. Preparation keeps its old contract.
    if (!requiresWorker) {
        const { data, error } = await sb.from('payment_transition').select('direct_insert_retired').single();
        if (error || !data) throw new Error('SCHEMA_CHECK_RETRY');
        if (data.direct_insert_retired) return 'modern';
    }
    const { data: ready, error } = await sb.rpc('payment_checkout_ready', {});
    if (error) throw new Error('SCHEMA_CHECK_RETRY');
    if (ready === true) return 'modern';
    const { data, error: transitionError } = await sb.from('payment_transition').select('direct_insert_retired').single();
    if (transitionError || !data) throw new Error('SCHEMA_CHECK_RETRY');
    return data.direct_insert_retired ? 'closed' : 'legacy';
}
