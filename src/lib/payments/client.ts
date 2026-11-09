import type { User } from '@supabase/supabase-js';
import { retryChoiceMessage } from './order';

async function choosePaymentAction(text: string, action: string, waitText = '결제를 끝냈어요 · 잠시 뒤 확인'): Promise<boolean> {
    // Shared by cart, pass and personal-DB purchases. Escape means wait.
    if (typeof document === 'undefined') return window.confirm(`${text}\n확인: ${action}\n취소: ${waitText}`);
    const dialog = document.createElement('dialog');
    dialog.className = 'payment-retry-dialog';
    dialog.setAttribute('aria-label', '이전 결제 확인');
    const message = document.createElement('p');
    message.textContent = text;
    const wait = document.createElement('button');
    wait.textContent = waitText;
    const replace = document.createElement('button');
    replace.textContent = action;
    dialog.append(message, wait, replace);
    document.body.append(dialog);
    return new Promise(resolve => {
        const finish = (value: boolean) => { dialog.remove(); resolve(value); };
        wait.onclick = () => finish(false);
        replace.onclick = () => finish(true);
        dialog.oncancel = event => { event.preventDefault(); finish(false); };
        if (dialog.showModal) { dialog.showModal(); wait.focus(); }
        else finish(window.confirm(`${text}\n확인: ${action}`));
    });
}
const chooseReplacement = () => choosePaymentAction(retryChoiceMessage, '결제하지 않았어요 · 새로 결제하기');
const chooseResume = (order: any) => choosePaymentAction(
    `이전에 시작한 주문이 있습니다.\n${order.name}\n카드 ${order.amount.toLocaleString()}원 · 포인트 ${order.usedPoints.toLocaleString()}P\n현재 선택과 다를 수 있습니다. 위 내용으로 이전 주문을 계속 결제할까요?`,
    '위 상품·금액으로 이전 주문 결제', '돌아가기');

const key = (userId: string, kind: string) => `mathetf_pending_payment_${userId}_${kind}`;
export const reviewKey = (userId: string, kind: string) => `mathetf_review_payments_${userId}_${kind}`;
export function rememberPaymentReview(userId: string, kind: string, paymentId: string) {
    let saved: string[] = [];
    try { const value = JSON.parse(localStorage.getItem(reviewKey(userId, kind)) || '[]'); if (Array.isArray(value)) saved = value; } catch { }
    localStorage.setItem(reviewKey(userId, kind), JSON.stringify([...new Set([...saved, paymentId])]));
    localStorage.removeItem(`${key(userId, kind)}_request`);
    clearPendingPayment(userId, kind, paymentId);
    window.dispatchEvent?.(new Event('payment-updated'));
}
export function clearPaymentReview(userId: string, kind: string, paymentId: string) {
    try {
        const saved = JSON.parse(localStorage.getItem(reviewKey(userId, kind)) || '[]');
        if (!Array.isArray(saved) || !saved.includes(paymentId)) return;
        const remaining = saved.filter((id: string) => id !== paymentId);
        if (remaining.length) localStorage.setItem(reviewKey(userId, kind), JSON.stringify(remaining));
        else localStorage.removeItem(reviewKey(userId, kind));
        window.dispatchEvent?.(new Event('payment-updated'));
    } catch { }
}
export function clearPendingPayment(userId: string, kind: string, paymentId: string) {
    // An older callback must never erase a newer checkout's recovery pointer.
    if (localStorage.getItem(key(userId, kind)) === paymentId) {
        localStorage.removeItem(key(userId, kind));
        window.dispatchEvent?.(new Event('payment-updated'));
    }
}

export async function confirmPayment(userId: string, paymentId: string, kind = 'cart', retryInput?: unknown) {
    const res = await fetch('/api/payments/complete', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentId, retryInput }), signal: AbortSignal.timeout(45000),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
        if (['PAYMENT_MANUAL_REVIEW', 'PAYMENT_REFUND_PENDING'].includes(data.code)) {
            rememberPaymentReview(userId, kind, paymentId);
        }
        const notPaid = ['PAYMENT_NOT_PAID', 'PAYMENT_SUPERSEDED', 'PAYMENT_CLOSED'].includes(data.code);
        // READY/404 is not invalidation. Preserve the pointer until the server
        // commits a replacement, or confirms irreversible closure / full refund.
        if (['PAYMENT_SUPERSEDED', 'PAYMENT_REFUNDED', 'PAYMENT_CLOSED'].includes(data.code)) {
            clearPendingPayment(userId, kind, paymentId);
            clearPaymentReview(userId, kind, paymentId);
        }
        throw Object.assign(new Error(`${data.message || '같은 주문의 결과를 다시 확인해주세요.'} 주문: ${paymentId}`), {
            code: data.code, resumeOrder: data.resumeOrder, notPaid, choiceRequired: data.code === 'PAYMENT_RETRY_CHOICE', pending: data.code === 'PAYMENT_PENDING', paymentId,
        });
    }
    clearPendingPayment(userId, data.kind || kind, paymentId);
    clearPaymentReview(userId, data.kind || kind, paymentId);
    return data;
}

type CartInput = { kind: 'cart'; [key: string]: unknown };
const active = new Map<string, Promise<any>>();
export function payOrder(user: User, input: CartInput, phone?: string): Promise<any> {
    const storageKey = key(user.id, input.kind);
    const existing = active.get(storageKey);
    if (existing) return existing;
    const run = async () => {
        let order: any;
        let resumed = false;
        const resume = async (saved: any) => {
            if (!(await chooseResume(saved))) throw new Error('이전 주문 결제를 보류했습니다.');
            order = saved;
            resumed = true;
        };
        const pending = localStorage.getItem(storageKey);
        let replaceOpen = false;
        let supersedePaymentId = pending || undefined;
        if (pending) {
            try { return await confirmPayment(user.id, pending, input.kind, input); }
            catch (e: any) {
                if (e?.resumeOrder) await resume(e.resumeOrder);
                else if (e?.choiceRequired) { if (!(await chooseReplacement())) throw e; replaceOpen = true; }
                else if (['PAYMENT_MANUAL_REVIEW', 'PAYMENT_REFUND_PENDING'].includes(e?.code)) supersedePaymentId = undefined;
                else if (!e?.notPaid) throw e;
            }
        }
        let createdOrder = resumed;
        // Preserve across a lost create response / refresh. Reusing this key
        // recovers the server order even after it has already completed.
        const requestKey = `${storageKey}_request`;
        let requestId = localStorage.getItem(requestKey) || crypto.randomUUID();
        localStorage.setItem(requestKey, requestId);
        const clearRequest = () => { if (localStorage.getItem(requestKey) === requestId) localStorage.removeItem(requestKey); };
        for (let attempt = 0; !createdOrder && attempt < 4; attempt++) {
            const prepared = await fetch('/api/payments/orders', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...input, requestId, supersedePaymentId, replaceOpen }), signal: AbortSignal.timeout(45000),
            });
            order = await prepared.json();
            if (order.resumeOrder) { await resume(order.resumeOrder); createdOrder = true; break; }
            if (['PAYMENT_MANUAL_REVIEW', 'PAYMENT_REFUND_PENDING'].includes(order.code)) {
                if (order.paymentId) rememberPaymentReview(user.id, input.kind, order.paymentId);
                throw Object.assign(new Error(order.message), { code: order.code, paymentId: order.paymentId });
            }
            if (order.code === 'PAYMENT_RETRY_CHOICE' || order.choiceRequired) {
                supersedePaymentId = order.paymentId || order.recoverPaymentId;
                if (supersedePaymentId) localStorage.setItem(storageKey, supersedePaymentId);
                if (!(await chooseReplacement())) throw new Error(order.message || retryChoiceMessage);
                replaceOpen = true;
                continue;
            }
            if (!prepared.ok) throw new Error(order.message);
            if (order.recoverPaymentId) {
                supersedePaymentId = order.recoverPaymentId;
                localStorage.setItem(storageKey, order.recoverPaymentId);
                try { const result = await confirmPayment(user.id, order.recoverPaymentId, input.kind, input); clearRequest(); return result; }
                catch (e: any) {
                    if (e?.resumeOrder) { await resume(e.resumeOrder); createdOrder = true; break; }
                    else if (e?.choiceRequired) { if (!(await chooseReplacement())) throw e; replaceOpen = true; }
                    else if (['PAYMENT_MANUAL_REVIEW', 'PAYMENT_REFUND_PENDING'].includes(e?.code)) supersedePaymentId = undefined;
                    else if (!e?.notPaid) { if (e?.code === 'PAYMENT_REFUNDED') clearRequest(); throw e; }
                    requestId = crypto.randomUUID();
                    localStorage.setItem(requestKey, requestId);
                }
                continue;
            }
            if (order.paymentId) { createdOrder = true; break; }
        }
        if (!createdOrder) throw new Error('다른 화면에서 주문이 바뀌었습니다. 같은 주문의 결과를 다시 확인해주세요.');
        if (!resumed && order.usedPoints !== undefined && order.usedPoints !== (input.usedPoints ?? 0)) throw new Error('포인트 적용 금액이 달라졌습니다. 금액을 다시 확인해주세요.');
        localStorage.setItem(storageKey, order.paymentId);
        clearRequest();
        window.dispatchEvent?.(new Event('payment-updated'));
        if (order.amount > 0 && !(window as any).PortOne) throw new Error('결제 모듈을 불러오는 중입니다. 잠시 후 다시 시도해주세요.');
        if (order.amount > 0) {
            let response: any;
            let sdkError: unknown;
            let onRestore: (event: PageTransitionEvent) => void = () => {};
            try {
                const restored = new Promise<never>((_, reject) => {
                    onRestore = event => { if (event.persisted) reject(new Error('결제 화면에서 돌아왔습니다.')); };
                    window.addEventListener?.('pageshow', onRestore);
                });
                response = await Promise.race([restored, (window as any).PortOne.requestPayment({
                    storeId: process.env.NEXT_PUBLIC_PORTONE_STORE_ID, channelKey: process.env.NEXT_PUBLIC_PORTONE_CHANNEL_KEY,
                    paymentId: order.paymentId, orderName: order.name, totalAmount: order.amount, currency: 'CURRENCY_KRW', payMethod: 'CARD',
                    products: order.products, customData: { orderId: order.paymentId },
                    redirectUrl: `${window.location.origin}/payments/return`,
                    customer: { customerId: user.id, fullName: user.email?.split('@')[0] || 'User', email: user.email, phoneNumber: user.user_metadata?.phone || user.phone || phone },
                })]);
            } catch (e) { sdkError = e; }
            finally { window.removeEventListener?.('pageshow', onRestore); }
            // SDK errors/cancel responses can race with approval. Only a server
            // provider lookup may release an uncertain order.
            try { return await confirmPayment(user.id, order.paymentId, input.kind); }
            catch (e: any) {
                if (e?.notPaid && (sdkError || response?.code != null)) throw new Error(`결제가 진행되지 않았어요. ${response?.message || '결제를 취소했어요. 다시 시도해주세요.'}`);
                throw e;
            }
        }
        // Zero amount never touches the SDK, even if it has not loaded.
        return confirmPayment(user.id, order.paymentId, input.kind);
    };
    // Same-tab clicks share one promise; Web Locks serializes other tabs too.
    const promise = (typeof navigator !== 'undefined' && navigator.locks
        ? navigator.locks.request(storageKey, { ifAvailable: true }, lock => {
            if (!lock) throw new Error('다른 창에서 결제를 확인 중입니다. 해당 창에서 결과를 확인해주세요.');
            return run();
        }) : run()).finally(() => active.delete(storageKey));
    active.set(storageKey, promise);
    return promise;
}
