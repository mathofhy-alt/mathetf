import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/server-admin';
import { paymentIdPattern } from '@/lib/payments/order';
import { readOrder, reconcileOrder } from '@/lib/payments/reconcile';

export const maxDuration = 60;
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const paymentId = body?.data?.paymentId;
        if (typeof paymentId !== 'string' || !paymentIdPattern.test(paymentId)) return new NextResponse(null, { status: 400 });
        const sb = createAdminClient();
        const order = await readOrder(sb, paymentId);
        // The webhook is a lookup trigger only. Never trust its status, user,
        // amount or event type; query PortOne using the server secret every time.
        // Zero-won orders cannot have provider webhooks or be completed here.
        if (order.amount === 0) return new NextResponse(null, { status: 200 });
        await reconcileOrder(sb, order);
        return new NextResponse(null, { status: 200 });
    } catch (error: any) {
        const settled = ['ORDER_NOT_FOUND', 'PAYMENT_NOT_PAID', 'PAYMENT_RETRY_CHOICE', 'PAYMENT_SUPERSEDED', 'PAYMENT_REFUNDED', 'PAYMENT_CLOSED', 'PAYMENT_MANUAL_REVIEW'];
        return new NextResponse(null, { status: settled.includes(error?.message) ? 200 : 503 });
    }
}
