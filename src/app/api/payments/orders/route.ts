import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/server-admin';
import { cartQuote, uuidPattern } from '@/lib/payments/order';

export async function POST(req: NextRequest) {
    const { data: { user } } = await createClient().auth.getUser();
    if (!user) return NextResponse.json({ message: '로그인이 필요합니다.' }, { status: 401 });
    try {
        const body = await req.json();
        if (body?.kind !== 'cart') throw new Error('자료 구매만 가능합니다.');
        const sb = createAdminClient();
        if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 100 || body.items.some((i: any) => !uuidPattern.test(i?.item_id))) throw new Error('구매 자료를 확인해주세요.');
        const { data: materials, error } = await sb.from('exam_materials').select('*').in('id', body.items.map((i: any) => i.item_id));
        if (error) throw new Error('판매 정보를 불러오지 못했습니다.');
        const quote = cartQuote(body.items, materials || [], body.usedPoints);
        const { data: profile, error: profileError } = await sb.from('profiles').select('earned_points').eq('id', user.id).single();
        if (profileError || !profile || profile.earned_points < quote.used_points) throw new Error('보유 포인트가 부족합니다.');
        const paymentId = `order-${crypto.randomUUID().replace(/-/g, '')}`;
        const { error: insertError } = await sb.from('payment_orders').insert({ payment_id: paymentId, user_id: user.id, ...quote });
        if (insertError) { console.error('[Order create]', insertError.code); return NextResponse.json({ message: '주문을 준비하지 못했습니다. 결제는 시작되지 않았습니다.' }, { status: 503 }); }
        return NextResponse.json({ paymentId, amount: quote.amount, name: quote.name });
    } catch (error: any) { return NextResponse.json({ message: error.message || '주문 정보를 확인해주세요.' }, { status: 400 }); }
}
