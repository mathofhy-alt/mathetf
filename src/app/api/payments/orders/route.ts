import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/server-admin';
import { cartQuote, uuidPattern } from '@/lib/payments/order';
import { PRIVATE_ITEM_TYPE } from '@/lib/questions/privateDb';
import { QB_PASS_TERMS, termPrice, termTitle, paywallOn } from '@/lib/qbPassConfig';

export async function POST(req: NextRequest) {
    const { data: { user } } = await createClient().auth.getUser();
    if (!user) return NextResponse.json({ message: '로그인이 필요합니다.' }, { status: 401 });
    try {
        const body = await req.json();
        if (body?.kind !== 'cart') throw new Error('자료 구매만 가능합니다.');
        const sb = createAdminClient();
        if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 100 || body.items.some((i: any) => !uuidPattern.test(i?.item_id))) throw new Error('구매 자료를 확인해주세요.');
        const itemIds = body.items.map((i: any) => i.item_id);
        const { data: materials, error } = await sb.from('exam_materials').select('*').in('id', itemIds);
        if (error) throw new Error('판매 정보를 불러오지 못했습니다.');
        // [10/6] 회원 전용 개인DB(private_dbs) — 주인만, 한 번만 산다. 가격·이름은 서버 표에서만 가져온다.
        const { data: privs, error: privError } = await sb.from('private_dbs').select('id, owner_user_id, title, price').in('id', itemIds);
        if (privError) throw new Error('판매 정보를 불러오지 못했습니다.');
        if ((privs || []).some(p => p.owner_user_id !== user.id)) throw new Error('구매할 수 없는 자료가 포함되어 있습니다.');
        if (privs?.length) {
            const { data: paid } = await sb.from('purchased_items').select('item_id').eq('user_id', user.id).eq('item_type', PRIVATE_ITEM_TYPE).in('item_id', privs.map(p => p.id));
            if (paid?.length) throw new Error('이미 결제한 개인DB입니다.');
        }
        const privateRows = (privs || []).map(p => ({ id: p.id, title: p.title, price: p.price, file_type: 'PRIVATE' }));
        // [10/7] 시험지 만들기 이용권 — 가격·이름은 서버 상수에서만
        // [10/7·10/8] 시험지 만들기 이용권 — 개월별 상품(1·3·6·12개월), 가격·이름은 서버 설정에서만
        if (QB_PASS_TERMS.some(t => itemIds.includes(t.itemId)) && !paywallOn()) throw new Error('시험지 만들기 이용권은 10월 12일(월)부터 판매합니다. 그 전까지는 시험지 만들기가 무료입니다.');
        const passRows = QB_PASS_TERMS.filter(t => itemIds.includes(t.itemId)).map(t => ({ id: t.itemId, title: termTitle(t.months), price: termPrice(t.months), file_type: 'PASS' }));
        const quote = cartQuote(body.items, [...(materials || []), ...privateRows, ...passRows], body.usedPoints);
        const { data: profile, error: profileError } = await sb.from('profiles').select('earned_points').eq('id', user.id).single();
        if (profileError || !profile || profile.earned_points < quote.used_points) throw new Error('보유 포인트가 부족합니다.');
        const paymentId = `order-${crypto.randomUUID().replace(/-/g, '')}`;
        const { error: insertError } = await sb.from('payment_orders').insert({ payment_id: paymentId, user_id: user.id, ...quote });
        if (insertError) { console.error('[Order create]', insertError.code); return NextResponse.json({ message: '주문을 준비하지 못했습니다. 결제는 시작되지 않았습니다.' }, { status: 503 }); }
        return NextResponse.json({ paymentId, amount: quote.amount, name: quote.name });
    } catch (error: any) { return NextResponse.json({ message: error.message || '주문 정보를 확인해주세요.' }, { status: 400 }); }
}
