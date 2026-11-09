import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/server-admin';
import { paymentIdPattern, retryChoiceMessage } from './order';
import { readOrder, reconcileOrder } from './reconcile';

export function paymentErrorResponse(error: any, paymentId?: string) {
    const messages: Record<string, string> = {
        PAYMENT_RETRY_CHOICE: `${retryChoiceMessage} 선택 버튼이 보이지 않으면 화면을 새로고침해주세요.`,
        PAYMENT_NOT_PAID: '결제가 완료되지 않았습니다. 새로 결제하면 서버에서 이전 주문을 대체합니다.',
        PAYMENT_SUPERSEDED: '대체된 주문입니다. 이 주문으로 상품이나 포인트가 지급되지 않습니다. 늦게 승인되면 자동 전액 취소합니다.',
        PAYMENT_REFUNDED: '상품을 지급하지 않고 카드 결제를 전액 취소했습니다. 카드사 반영에는 시간이 걸릴 수 있습니다.',
        PAYMENT_REFUND_PENDING: '상품 지급을 중단하고 카드 전액 취소를 확인 중입니다. 자동으로 재시도합니다. 같은 주문의 결과를 다시 확인해주세요.',
        PAYMENT_PENDING: '카드 승인을 확인 중입니다. 잠시 후 같은 주문의 결과를 다시 확인해주세요.',
        PAYMENT_CLOSED: '결제되지 않은 이전 주문을 정리했습니다. 상품과 금액을 확인한 뒤 다시 결제해주세요.',
        PAYMENT_MANUAL_REVIEW: '이전 결제를 운영자 확인 대상으로 기록했습니다. 이 상품의 중복 구매는 확인이 필요하며, 다른 상품은 구매할 수 있습니다. 주문 번호로 고객센터에 문의해주세요.',
        PAYMENT_RESUME_REQUIRED: '이전 주문의 상품과 금액을 확인한 뒤 같은 주문을 계속 결제할 수 있습니다.',
    };
    const code = messages[error?.message] ? error.message : 'ORDER_RETRY';
    const resumeOrder = code === 'PAYMENT_RESUME_REQUIRED' ? error.resumeOrder : undefined;
    return NextResponse.json({ success: false, code, paymentId, ...(resumeOrder ? { resumeOrder } : {}),
        message: resumeOrder ? `${messages[code]} ${resumeOrder.name} · 카드 ${resumeOrder.amount.toLocaleString()}원 · 포인트 ${resumeOrder.usedPoints.toLocaleString()}P. 화면을 새로고침하면 재개 버튼이 표시됩니다.` : messages[code] || '결제 결과를 확정하지 못했습니다. 다시 결제하지 말고 같은 주문의 결과 확인을 눌러주세요.' },
    { status: code === 'ORDER_RETRY' || code === 'PAYMENT_REFUND_PENDING' ? 503 : 409 });
}

export async function completeOrder(req: NextRequest, kind?: 'cart' | 'topup') {
    const { data: { user } } = await createClient().auth.getUser();
    if (!user) return NextResponse.json({ success: false, message: '로그인 후 결제 결과를 다시 확인해주세요.' }, { status: 401 });
    let paymentId: string | undefined;
    try {
        const body = await req.json();
        if (typeof body.paymentId !== 'string' || !paymentIdPattern.test(body.paymentId)) return NextResponse.json({ success: false, message: '서버에서 생성한 주문이 필요합니다.' }, { status: 400 });
        paymentId = body.paymentId;
        const sb = createAdminClient();
        const order = await readOrder(sb, paymentId!, user.id);
        if (kind && order.kind !== kind) throw new Error('ORDER_NOT_FOUND');
        return NextResponse.json(await reconcileOrder(sb, order, body.retryInput));
    } catch (error: any) {
        if (error?.message === 'ORDER_NOT_FOUND') return NextResponse.json({ success: false, message: '본인의 주문을 찾을 수 없습니다.' }, { status: 404 });
        return paymentErrorResponse(error, paymentId);
    }
}
