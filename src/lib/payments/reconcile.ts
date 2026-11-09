import { createAdminClient } from '@/utils/supabase/server-admin';
import { uuidPattern, verifyPaidPayment, verifyPaymentIdentity, samePaymentSelection, paymentResumeRequired } from './order';
import { hasSchemaCapability, paymentCreationMode } from '../schemaCapabilities';

type Admin = ReturnType<typeof createAdminClient>;

// Same server-only secret and authentication scheme as the existing lookup.
export async function portone(paymentId: string, cancel = false) {
    if (!process.env.PORTONE_API_SECRET) throw new Error('PAYMENT_CONFIG');
    const response = await fetch(`https://api.portone.io/payments/${encodeURIComponent(paymentId)}${cancel ? '/cancel' : ''}`, {
        method: cancel ? 'POST' : 'GET',
        headers: {
            Authorization: `PortOne ${process.env.PORTONE_API_SECRET}`,
            ...(cancel ? { 'Content-Type': 'application/json', 'Idempotency-Key': `"full-refund-${paymentId}"` } : {}),
        },
        // Omitted amount means the entire remaining payment. Never send a
        // browser-supplied amount. The request body stays identical on retries.
        ...(cancel ? { body: JSON.stringify({ reason: '대체된 주문 또는 상품 지급 실패에 따른 자동 전액 취소', requester: 'ADMIN' }) } : {}),
        cache: 'no-store', signal: AbortSignal.timeout(10000),
    });
    if ([401, 403].includes(response.status)) throw new Error('PAYMENT_AUTH');
    if (!cancel && response.status === 404) return null;
    if (!response.ok) throw new Error(cancel ? `CANCEL_HTTP_${response.status}` : 'PAYMENT_UNAVAILABLE');
    return response.json();
}

/** Read-only credential/connectivity probe, including when every queue is empty. */
export async function checkPaymentProvider() {
    // A missing payment (404) is a valid authenticated lookup. Never approve,
    // cancel or create this probe payment, even if the ID happens to exist.
    await portone('order-00000000000000000000000000000000');
}

async function recordRefund(sb: Admin, order: any, outcome: 'pending' | 'succeeded', errorCode?: string, cancellationId?: string) {
    const { error } = await sb.rpc('record_payment_refund', {
        p_payment_id: order.payment_id, p_outcome: outcome,
        p_error_code: errorCode || null, p_cancellation_id: cancellationId || null,
    });
    if (error) throw new Error('REFUND_RECORD_RETRY');
}

async function refundSuperseded(sb: Admin, order: any, payment?: any): Promise<never> {
    if (order.amount === 0) throw new Error('PAYMENT_SUPERSEDED');
    if (order.refund_status === 'succeeded') throw new Error('PAYMENT_REFUNDED');
    payment = payment ?? await portone(order.payment_id);
    if (!payment || ['READY', 'FAILED'].includes(payment.status)) {
        await defer(sb, order, payment?.status || 'NOT_FOUND');
        throw new Error('PAYMENT_SUPERSEDED');
    }
    if (['PENDING', 'PAY_PENDING', 'CANCEL_PENDING', 'VIRTUAL_ACCOUNT_ISSUED'].includes(payment.status)) throw new Error('PAYMENT_REFUND_PENDING');
    await verifyIdentity(sb, order, payment);
    if (!['PAID', 'PARTIAL_CANCELLED', 'CANCELLED'].includes(payment.status)) await recordReview(sb, order, payment, 'provider_state');
    if (order.manual_review_required && order.review_reason !== 'refund_pending' && order.supersede_reason !== 'operator_refund') throw new Error('PAYMENT_MANUAL_REVIEW');
    let cancellationId: string | undefined = Array.isArray(payment.cancellations) ? payment.cancellations.slice(-1)[0]?.id : undefined;
    try {
        // Persist intent BEFORE contacting the provider. Crashes and timeouts
        // are retried by webhook / cron / the same result URL, never fulfillment.
        await recordRefund(sb, order, 'pending');
        if (payment.status !== 'CANCELLED') {
            const result = await portone(order.payment_id, true);
            cancellationId = result?.cancellation?.id;
            payment = await portone(order.payment_id);
            if (!payment || payment.status !== 'CANCELLED') throw new Error('CANCEL_NOT_CONFIRMED');
            verifyOrderIdentity(order, payment);
        }
        if (order.status === 'completed' || order.supersede_reason === 'operator_refund') await recordCancellation(sb, order, cancellationId);
        else await recordRefund(sb, order, 'succeeded', undefined, cancellationId);
    } catch (error: any) {
        // Store our stable codes, never provider bodies or secrets.
        const providerUnavailable = ['PAYMENT_CONFIG', 'PAYMENT_AUTH'].includes(error?.message);
        const code = providerUnavailable || /^(CANCEL_HTTP_\d+|CANCEL_NOT_CONFIRMED|REFUND_RECORD_RETRY|PAYMENT_MISMATCH)$/.test(error?.message) ? error.message : 'CANCEL_UNAVAILABLE';
        await recordRefund(sb, order, 'pending', code, cancellationId);
        throw Object.assign(new Error('PAYMENT_REFUND_PENDING'), { providerUnavailable });
    }
    throw new Error('PAYMENT_REFUNDED');
}

export function verifyLegacyPayment(order: any, payment: any, confirmedOwner = false) {
    if (!payment || payment.id !== order.payment_id || payment.currency !== 'KRW' || payment.amount?.total !== order.amount) throw new Error('PAYMENT_MISMATCH');
    let custom = payment.customData;
    if (typeof custom === 'string') { try { custom = JSON.parse(custom); } catch { throw new Error('PAYMENT_MISMATCH'); } }
    const customerId = payment.customer?.id;
    if ((customerId != null && customerId !== order.user_id) || (custom?.orderId != null && custom.orderId !== order.payment_id)
        || (!confirmedOwner && (customerId == null || custom?.orderId == null))) throw new Error('PAYMENT_MISMATCH');
    // Persist only the fields needed for the operator's decision, not the full
    // provider response (which can contain card/customer personal information).
    return { id: payment.id, status: payment.status, currency: payment.currency,
        amount: { total: payment.amount.total }, customer: { id: customerId ?? null }, customData: custom ? { orderId: custom.orderId ?? null } : null };
}

function verifyOrderIdentity(order: any, payment: any) {
    if (order.legacy_resolution || order.legacy_reconciliation) verifyLegacyPayment(order, payment, true);
    else verifyPaymentIdentity(order, payment);
}

async function recordReview(sb: Admin, order: any, payment: any, reason: 'provider_mismatch' | 'provider_state') {
    const { error } = await sb.rpc('record_payment_review', {
        p_payment_id: order.payment_id, p_provider_status: String(payment?.status || 'UNKNOWN').slice(0, 64), p_reason: reason,
    });
    if (error) throw new Error('ORDER_RETRY');
    throw new Error('PAYMENT_MANUAL_REVIEW');
}

async function verifyIdentity(sb: Admin, order: any, payment: any) {
    try { verifyOrderIdentity(order, payment); }
    catch (error: any) {
        if (error?.message !== 'PAYMENT_MISMATCH') throw error;
        // A permanent identity conflict belongs to this order. Persist it before
        // releasing unrelated purchases; it never authorizes goods or a refund.
        await recordReview(sb, order, payment, 'provider_mismatch');
    }
}

async function recordPartialCancellation(sb: Admin, order: any) {
    const { error } = await sb.rpc('record_payment_partial_cancellation', { p_payment_id: order.payment_id });
    if (error) throw new Error('ORDER_RETRY');
    throw new Error('PAYMENT_MANUAL_REVIEW');
}

async function recordCancellation(sb: Admin, order: any, cancellationId?: string) {
    const { error } = await sb.rpc('record_payment_cancellation', { p_payment_id: order.payment_id, p_cancellation_id: cancellationId || null });
    if (error) throw new Error('ORDER_RETRY');
}

async function defer(sb: Admin, order: any, status: string) {
    const { error } = await sb.rpc('defer_payment_reconciliation', { p_payment_id: order.payment_id, p_provider_status: status });
    if (error) throw new Error('ORDER_RETRY');
}

async function removePurchasedCartItems(sb: Admin, order: any) {
    if (order.kind !== 'cart') return;
    const ids = [...new Set((Array.isArray(order.items) ? order.items : [])
        .map((item: any) => item?.item_id)
        .filter((id: unknown): id is string => typeof id === 'string' && uuidPattern.test(id)))];
    if (!ids.length) return;
    try {
        const { error } = await sb.from('cart_items').delete().eq('user_id', order.user_id).in('item_id', ids);
        if (error) console.error('[Order cart cleanup]', error.code);
    } catch { console.error('[Order cart cleanup] retry required'); }
}

export async function readOrder(sb: Admin, paymentId: string, userId?: string) {
    let query = sb.from('payment_orders').select('*').eq('payment_id', paymentId);
    if (userId) query = query.eq('user_id', userId);
    const { data, error } = await query.single();
    if (error && error.code !== 'PGRST116') throw new Error('ORDER_RETRY');
    if (!data) throw new Error('ORDER_NOT_FOUND');
    return data;
}

async function observeLegacyOrder(sb: Admin, order: any): Promise<never> {
    const payment = await portone(order.payment_id);
    // Observation cannot authorize money or goods, including old approvals
    // without modern customer/customData fields.
    if (payment && payment.id !== order.payment_id) throw new Error('PAYMENT_MISMATCH');
    const status = payment?.status || 'NOT_FOUND';
    const { error } = await sb.rpc('observe_legacy_payment', { p_payment_id: order.payment_id, p_provider_status: status });
    if (error) throw new Error('ORDER_RETRY');
    if (['NOT_FOUND', 'READY', 'FAILED', 'CANCELLED'].includes(status)) throw new Error('PAYMENT_CLOSED');
    throw new Error('PAYMENT_MANUAL_REVIEW');
}

/** Keep the deployed completion contract until all resolution functions exist. */
async function reconcileBeforeResolution(sb: Admin, order: any, retryInput?: any) {
    if (order.status === 'cancelled') throw new Error('PAYMENT_REFUNDED');
    if (order.status === 'completed') {
        await removePurchasedCartItems(sb, order);
        return { success: true, alreadyProcessed: true, kind: order.kind, points: order.points, amount: order.amount };
    }
    if (order.manual_review_required) throw new Error('PAYMENT_MANUAL_REVIEW');
    // supersede may have committed while resolution is absent or rolled back.
    // Preserve its old-PAID review rule even during a negative capability cache.
    if (order.legacy_reconciliation && order.amount > 0) return observeLegacyOrder(sb, order);
    if (order.status === 'superseded') throw new Error('PAYMENT_SUPERSEDED');
    if (order.status === 'closed') throw new Error('PAYMENT_CLOSED');
    if (order.status !== 'pending') throw new Error('ORDER_RETRY');
    if (order.amount === 0 && retryInput && !samePaymentSelection(order, retryInput)) throw paymentResumeRequired(order);
    if (order.amount > 0) {
        const payment = await portone(order.payment_id);
        if (retryInput && (!payment || ['READY', 'FAILED'].includes(payment.status))) {
            if (payment) verifyPaymentIdentity(order, payment);
            throw paymentResumeRequired(order);
        }
        if (!payment) throw new Error('PAYMENT_NOT_PAID');
        verifyPaidPayment(order, payment);
    }
    const { data, error } = await sb.rpc('complete_payment_order', { p_payment_id: order.payment_id, p_user_id: order.user_id });
    // Never fall back after a failed v2 call. This is a separately selected old
    // contract; its upgraded wrapper rejects every non-fulfilled result.
    if (error || !data) throw new Error('ORDER_RETRY');
    const confirmed = await readOrder(sb, order.payment_id, order.user_id);
    if (confirmed.status !== 'completed') throw new Error('ORDER_RETRY');
    await removePurchasedCartItems(sb, confirmed);
    return { ...data, success: true, kind: order.kind, points: order.points, amount: order.amount };
}

export async function reconcileOrder(sb: Admin, initialOrder: any, retryInput?: any) {
    const resolution = await hasSchemaCapability(sb, 'paymentResolution');
    if (!resolution) return reconcileBeforeResolution(sb, initialOrder, retryInput);
    // A probe can see a migration committed after the caller read the order.
    // Refresh its legacy marker before making any fulfillment decision.
    let order = typeof initialOrder.legacy_reconciliation === 'boolean' ? initialOrder
        : await readOrder(sb, initialOrder.payment_id, initialOrder.user_id);
    if (order.status === 'cancelled') throw new Error('PAYMENT_REFUNDED');
    if (order.status === 'completed') {
        if (order.amount > 0) {
            const payment = await portone(order.payment_id);
            if (!payment) throw new Error('ORDER_RETRY');
            await verifyIdentity(sb, order, payment);
            if (payment.status === 'CANCELLED') {
                await recordCancellation(sb, order, payment.cancellations?.slice(-1)[0]?.id);
                throw new Error('PAYMENT_REFUNDED');
            }
            if (order.refund_status === 'pending' && order.supersede_reason === 'operator_refund') return refundSuperseded(sb, order, payment);
            if (payment.status === 'PARTIAL_CANCELLED') {
                await recordPartialCancellation(sb, order);
            }
            if (payment.status !== 'PAID') await recordReview(sb, order, payment, 'provider_state');
            if (order.manual_review_required) {
                await defer(sb, order, payment.status);
                throw new Error('PAYMENT_MANUAL_REVIEW');
            }
            await defer(sb, order, payment.status);
        }
        await removePurchasedCartItems(sb, order);
        return { success: true, alreadyProcessed: true, kind: order.kind, points: order.points, amount: order.amount };
    }
    // The migration marks pre-rollout rows. Neither a background job nor a
    // delayed browser callback may guess whether those old payments delivered.
    // Observe and report them; never turn them into automatic refunds/grants.
    if (order.legacy_reconciliation && order.amount > 0) {
        const legacyPayment = await portone(order.payment_id);
        // Older orders can lack modern customer/customData fields. This branch
        // only reports/quietly closes; it cannot authorize money or goods.
        if (legacyPayment && legacyPayment.id !== order.payment_id) await recordReview(sb, order, legacyPayment, 'provider_mismatch');
        const status = legacyPayment?.status || 'NOT_FOUND';
        const { error } = await sb.rpc('observe_legacy_payment', { p_payment_id: order.payment_id, p_provider_status: status });
        if (error) throw new Error('ORDER_RETRY');
        if (['NOT_FOUND', 'READY', 'FAILED', 'CANCELLED'].includes(status)) throw new Error('PAYMENT_CLOSED');
        throw new Error('PAYMENT_MANUAL_REVIEW');
    }
    if (order.status === 'superseded') return refundSuperseded(sb, order);
    if (order.status === 'closed') throw new Error('PAYMENT_CLOSED');
    if (order.status !== 'pending') throw new Error('ORDER_RETRY');
    if (order.manual_review_required && order.amount === 0) throw new Error('PAYMENT_MANUAL_REVIEW');
    if (order.amount === 0 && retryInput) {
        if (!samePaymentSelection(order, retryInput)) {
            if (await paymentCreationMode(sb) !== 'modern') throw paymentResumeRequired(order);
            const { error } = await sb.rpc('supersede_payment_order', {
                p_payment_id: order.payment_id, p_user_id: order.user_id, p_reason: 'selection_changed',
            });
            if (error) throw new Error('ORDER_RETRY');
            // A completion that won the same lock is returned as success.
            return reconcileOrder(sb, await readOrder(sb, order.payment_id, order.user_id));
        }
    }
    let payment;
    if (order.amount > 0) {
        payment = await portone(order.payment_id);
        if (retryInput && (!payment || ['READY', 'FAILED'].includes(payment.status)) && await paymentCreationMode(sb) === 'legacy') {
            if (payment) verifyPaymentIdentity(order, payment);
            throw paymentResumeRequired(order);
        }
        if (!payment) throw new Error('PAYMENT_RETRY_CHOICE');
        if (!['READY', 'FAILED', 'PENDING', 'PAY_PENDING', 'CANCEL_PENDING', 'VIRTUAL_ACCOUNT_ISSUED'].includes(payment.status)) {
            await verifyIdentity(sb, order, payment);
            if (payment.status === 'PARTIAL_CANCELLED') await recordPartialCancellation(sb, order);
            if (!['PAID', 'CANCELLED'].includes(payment.status)) await recordReview(sb, order, payment, 'provider_state');
        }
        if (payment.status === 'CANCELLED') {
            await recordCancellation(sb, order, payment.cancellations?.slice(-1)[0]?.id);
            throw new Error('PAYMENT_REFUNDED');
        }
        if (order.manual_review_required) {
            await defer(sb, order, payment.status);
            throw new Error('PAYMENT_MANUAL_REVIEW');
        }
        if (order.legacy_resolution && payment.status === 'PAID') verifyOrderIdentity(order, payment);
        else verifyPaidPayment(order, payment);
    }
    const { data, error } = await sb.rpc('complete_payment_order_v2', { p_payment_id: order.payment_id, p_user_id: order.user_id });
    // Transport failure may mean SQL committed. Reconcile the row again;
    // never refund a possibly fulfilled order based on a transport error.
    if (error || !data) throw new Error('ORDER_RETRY');
    if (data.status === 'cancelled') throw new Error('PAYMENT_REFUNDED');
    if (data.reviewRequired) throw new Error('PAYMENT_MANUAL_REVIEW');
    if (data.superseded) {
        order = await readOrder(sb, order.payment_id, order.user_id);
        return refundSuperseded(sb, order, payment);
    }
    if (data.status !== 'completed') throw new Error('ORDER_RETRY');
    if (order.amount > 0) await defer(sb, order, 'PAID');
    await removePurchasedCartItems(sb, order);
    return { success: true, ...data, kind: order.kind, points: order.points, amount: order.amount };
}
