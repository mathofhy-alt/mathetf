import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/server-admin';
import { cartQuote, paymentIdPattern, uuidPattern, samePaymentSelection, paymentResumeRequired } from '@/lib/payments/order';
import { readOrder, reconcileOrder } from '@/lib/payments/reconcile';
import { paymentErrorResponse } from '@/lib/payments/complete';
import { PRIVATE_ITEM_TYPE } from '@/lib/questions/privateDb';
import { hasSchemaCapability, paymentCreationMode } from '@/lib/schemaCapabilities';
import { QB_PASS_TERMS, PASS_ONCE, PASS_EXAM, PASS_SHEET, termPrice, termTitle, paywallOn } from '@/lib/qbPassConfig';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
    const { data: { user } } = await createClient().auth.getUser();
    if (!user) return NextResponse.json({ message: '로그인이 필요합니다.' }, { status: 401 });
    try {
        const body = await req.json();
        if (body?.kind !== 'cart') throw new Error('자료 구매만 가능합니다.');
        // Already-open legacy tabs do not send a request ID. A fresh request
        // still gets a server ID; subsequent attempts discover its pending row.
        const legacyClient = body.requestId === undefined || body.requestId === null;
        if (!legacyClient && (typeof body.requestId !== 'string' || !uuidPattern.test(body.requestId))) throw new Error('주문 요청 번호를 확인해주세요.');
        const requestId = legacyClient ? crypto.randomUUID() : body.requestId;
        const sb = createAdminClient();
        const recover = async (paymentId: string) => {
            if (!legacyClient) return NextResponse.json({ recoverPaymentId: paymentId });
            const saved = await readOrder(sb, paymentId, user.id);
            if (saved.status === 'pending' && !samePaymentSelection(saved, body)) return paymentErrorResponse(paymentResumeRequired(saved), paymentId);
            return NextResponse.json({ paymentId, amount: saved.amount, usedPoints: saved.used_points, name: saved.name });
        };
        // Existing request recovery does not open checkout or need a worker.
        const creationInstalled = await hasSchemaCapability(sb, 'paymentCreation');
        if (creationInstalled) {
            const { data: replay, error: replayError } = await sb.from('payment_orders').select('payment_id')
                .eq('user_id', user.id).eq('create_request_id', requestId).limit(1);
            if (replayError) return NextResponse.json({ message: '주문 정보를 확인하지 못했습니다. 잠시 후 다시 시도해주세요.' }, { status: 503 });
            if (replay?.length) return recover(replay[0].payment_id);
        }
        if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 100 || body.items.some((i: any) => !uuidPattern.test(i?.item_id))) throw new Error('구매 자료를 확인해주세요.');
        const itemIds = body.items.map((i: any) => i.item_id);
        const { data: materials, error } = await sb.from('exam_materials').select('*').in('id', itemIds);
        if (error) throw new Error('판매 정보를 불러오지 못했습니다.');
        // [10/6] 회원 전용 개인DB(private_dbs) — 주인만, 한 번만 산다. 가격·이름은 서버 표에서만 가져온다.
        const { data: privs, error: privError } = await sb.from('private_dbs').select('id, owner_user_id, title, price').in('id', itemIds);
        if (privError) throw new Error('판매 정보를 불러오지 못했습니다.');
        if ((privs || []).some(p => p.owner_user_id !== user.id)) throw new Error('구매할 수 없는 자료가 포함되어 있습니다.');
        if (privs?.length) {
            const { data: paid, error: paidError } = await sb.from('purchased_items').select('item_id').eq('user_id', user.id).eq('item_type', PRIVATE_ITEM_TYPE).in('item_id', privs.map(p => p.id));
            if (paidError) throw new Error('ORDER_RETRY');
            if (paid?.length) throw new Error('이미 결제한 개인DB입니다.');
        }
        const privateRows = (privs || []).map(p => ({ id: p.id, title: p.title, price: p.price, file_type: 'PRIVATE' }));
        // [10/7] 시험지 만들기 이용권 — 가격·이름은 서버 상수에서만
        // [10/7·10/8] 시험지 만들기 이용권 — 개월별 상품(1·3·6·12개월), 가격·이름은 서버 설정에서만
        if (QB_PASS_TERMS.some(t => itemIds.includes(t.itemId)) && !paywallOn()) throw new Error('시험지 만들기 이용권은 10월 12일(월)부터 판매합니다. 그 전까지는 시험지 만들기가 무료입니다.');
        const passRows = QB_PASS_TERMS.filter(t => itemIds.includes(t.itemId)).map(t => ({ id: t.itemId, title: termTitle(t.months), price: termPrice(t.months), file_type: 'PASS' }));
        // [11/5 대표] 1회권·시험대비권 — 가격·이름은 서버 설정에서만
        const planRows = [{ p: PASS_ONCE, file_type: 'ONCE' }, { p: PASS_EXAM, file_type: 'EXAMPASS' }, { p: PASS_SHEET, file_type: 'SHEET' }].filter(x => itemIds.includes(x.p.itemId)).map(x => ({ id: x.p.itemId, title: x.p.title, price: x.p.price, file_type: x.file_type }));
        const quote = cartQuote(body.items, [...(materials || []), ...privateRows, ...passRows, ...planRows], body.usedPoints);
        const mode = await paymentCreationMode(sb, quote.amount > 0);
        if (mode === 'closed')
            return NextResponse.json({ message: '결제 자동 복구 기능을 확인 중입니다. 잠시 후 다시 시도해주세요.' }, { status: 503 });
        // Reviews protect the same goods in both rollout paths. Before the SQL
        // is installed, no review columns are queried and every pending stays active.
        if (creationInstalled) {
            const { data: reviews, error: reviewError } = await sb.from('payment_orders').select('payment_id,items')
                .eq('user_id', user.id).or('manual_review_required.eq.true,and(legacy_reconciliation.eq.true,status.eq.pending)');
            if (reviewError) throw new Error('ORDER_RETRY');
            for (const overlap of (reviews || []).filter(o => o.items?.some((i: any) => itemIds.includes(i.item_id)))) {
                const saved = await readOrder(sb, overlap.payment_id, user.id);
                if (saved.legacy_reconciliation && !saved.manual_review_required) {
                    try { await reconcileOrder(sb, saved); }
                    catch (error: any) {
                        if (error?.message !== 'PAYMENT_CLOSED') return paymentErrorResponse(error, saved.payment_id);
                    }
                    const checked = await readOrder(sb, saved.payment_id, user.id);
                    if (checked.manual_review_required || checked.status === 'pending') return paymentErrorResponse(new Error('PAYMENT_MANUAL_REVIEW'), saved.payment_id);
                } else return paymentErrorResponse(new Error(saved.refund_status === 'pending' ? 'PAYMENT_REFUND_PENDING' : 'PAYMENT_MANUAL_REVIEW'), saved.payment_id);
            }
        }
        if (mode === 'legacy') {
            // Direct INSERT cannot atomically retire an earlier checkout or
            // track its late approval. Keep completion/recovery available, but
            // never create a replacement until the modern path is ready.
            let previousEnded = false;
            if (body.supersedePaymentId !== undefined) {
                if (typeof body.supersedePaymentId !== 'string' || !paymentIdPattern.test(body.supersedePaymentId)) throw new Error('이전 주문 번호를 확인해주세요.');
                const selected = await readOrder(sb, body.supersedePaymentId, user.id);
                previousEnded = ['closed', 'cancelled'].includes(selected.status) && !selected.manual_review_required && selected.refund_status !== 'pending';
                const review = selected.manual_review_required || selected.refund_status === 'pending';
                if (review && selected.items?.some((i: any) => itemIds.includes(i.item_id))) return paymentErrorResponse(new Error(selected.refund_status === 'pending' ? 'PAYMENT_REFUND_PENDING' : 'PAYMENT_MANUAL_REVIEW'), selected.payment_id);
                // An unrelated review remains independently tracked; it is not
                // a checkout to resume or supersede on every subsequent request.
                previousEnded ||= review;
                if (!previousEnded) return recover(selected.payment_id);
            }
            let openQuery = sb.from('payment_orders').select('payment_id')
                .eq('user_id', user.id).eq('kind', 'cart').eq('status', 'pending');
            if (creationInstalled) openQuery = openQuery.eq('manual_review_required', false);
            const { data: open, error: openError } = await openQuery.limit(1);
            if (openError || !open) throw new Error('ORDER_RETRY');
            if (open.length) return recover(open[0].payment_id);
            if (body.replaceOpen === true && !previousEnded) return NextResponse.json({ message: '이전 주문의 결제 결과를 먼저 확인해주세요. 새 결제는 잠시 후 다시 시도해주세요.' }, { status: 503 });
            const { data: profile, error: profileError } = await sb.from('profiles').select('earned_points').eq('id', user.id).maybeSingle();
            if (profileError) throw new Error('ORDER_RETRY');
            if ((profile?.earned_points ?? 0) < quote.used_points) throw new Error('보유 포인트가 부족합니다.');
            const paymentId = `order-${crypto.randomUUID().replace(/-/g, '')}`;
            const { error: insertError } = await sb.from('payment_orders').insert({ payment_id: paymentId, user_id: user.id, ...quote });
            if (insertError) return NextResponse.json({ message: '주문을 준비하지 못했습니다. 결제는 시작되지 않았습니다.' }, { status: 503 });
            return NextResponse.json({ paymentId, amount: quote.amount, usedPoints: quote.used_points, name: quote.name });
        }
        // Includes orders from another device or a lost localStorage pointer.
        if (body.supersedePaymentId !== undefined && (typeof body.supersedePaymentId !== 'string' || !paymentIdPattern.test(body.supersedePaymentId))) throw new Error('이전 주문 번호를 확인해주세요.');
        const selected = body.supersedePaymentId ? await readOrder(sb, body.supersedePaymentId, user.id) : null;
        if (selected?.status === 'completed' && !selected.manual_review_required && selected.refund_status !== 'pending') return recover(selected.payment_id);
        const { data: latest, error: latestError } = await sb.from('payment_orders').select('payment_id,status')
            .eq('user_id', user.id).eq('kind', 'cart').order('created_at', { ascending: false }).order('payment_id', { ascending: false }).limit(1);
        if (latestError || !latest) throw new Error('ORDER_RETRY');
        const { data: pending, error: pendingError } = await sb.from('payment_orders').select('*')
            .eq('user_id', user.id).eq('kind', 'cart').eq('status', 'pending').eq('legacy_reconciliation', false)
            .order('created_at', { ascending: false }).order('payment_id', { ascending: false }).limit(1);
        if (pendingError || !pending) throw new Error('ORDER_RETRY');
        // Only the selected (or newest active) checkout can be replaced. Other
        // pending orders have their own durable reconciliation schedule, with no
        // per-member count ceiling and no blanket supersession.
        const previousOrders = selected ? [selected] : pending;
        const checkedIds: string[] = [];
        for (const previous of previousOrders) {
            const overlaps = previous.items?.some((i: any) => itemIds.includes(i.item_id));
            // An independent zero-card purchase need not query or replace a
            // different active card checkout, even during a provider outage.
            if (!selected && quote.amount === 0 && previous.amount > 0 && !overlaps) continue;
            if (previous.manual_review_required || previous.refund_status === 'pending') {
                if (overlaps) return paymentErrorResponse(new Error(previous.refund_status === 'pending' ? 'PAYMENT_REFUND_PENDING' : 'PAYMENT_MANUAL_REVIEW'), previous.payment_id);
                continue;
            }
            try {
                await reconcileOrder(sb, previous, body);
                return recover(previous.payment_id);
            } catch (error: any) {
                const code = error?.message;
                if (code === 'PAYMENT_RETRY_CHOICE' && !(body.replaceOpen === true && body.supersedePaymentId === previous.payment_id)) return paymentErrorResponse(error, previous.payment_id);
                if (code === 'PAYMENT_MANUAL_REVIEW' || code === 'PAYMENT_REFUND_PENDING') {
                    if (overlaps) return paymentErrorResponse(error, previous.payment_id);
                    continue;
                } else if (!['PAYMENT_RETRY_CHOICE', 'PAYMENT_NOT_PAID', 'PAYMENT_SUPERSEDED', 'PAYMENT_REFUNDED', 'PAYMENT_CLOSED'].includes(code)) return paymentErrorResponse(error, previous.payment_id);
            }
            checkedIds.push(previous.payment_id);
        }
        const paymentId = `order-${crypto.randomUUID().replace(/-/g, '')}`;
        const { data: created, error: insertError } = await sb.rpc('create_payment_order', {
            p_payment_id: paymentId, p_user_id: user.id, p_quote: quote,
            p_previous_payment_ids: checkedIds, p_replace_open: body.replaceOpen === true,
            p_request_id: requestId, p_snapshot_id: latest[0]?.payment_id || null, p_snapshot_status: latest[0]?.status || null,
        });
        if (insertError) { console.error('[Order create]', insertError.code); return NextResponse.json({ message: '주문을 준비하지 못했습니다. 결제는 시작되지 않았습니다.' }, { status: 503 }); }
        if (created?.reviewRequired) return paymentErrorResponse(new Error('PAYMENT_MANUAL_REVIEW'), created.reviewPaymentId);
        if (created?.alreadyPurchased) return NextResponse.json({ message: '이미 결제한 개인DB입니다.' }, { status: 409 });
        if (!created?.paymentId) {
            if (legacyClient) {
                if (created?.choiceRequired) return paymentErrorResponse(new Error('PAYMENT_RETRY_CHOICE'), created.recoverPaymentId);
                if (created?.recoverPaymentId) return recover(created.recoverPaymentId);
                return NextResponse.json({ message: '주문이 변경되었습니다. 화면을 새로고침하고 다시 시도해주세요.' }, { status: 409 });
            }
            return NextResponse.json(created || { retry: true });
        }
        return NextResponse.json({ paymentId, amount: quote.amount, usedPoints: quote.used_points, name: quote.name });
    } catch (error: any) {
        if (['SCHEMA_CHECK_RETRY', 'ORDER_RETRY'].includes(error?.message)) return NextResponse.json({ message: '주문 정보를 확인하지 못했습니다. 잠시 후 다시 시도해주세요.' }, { status: 503 });
        return NextResponse.json({ message: error.message || '주문 정보를 확인해주세요.' }, { status: 400 });
    }
}
