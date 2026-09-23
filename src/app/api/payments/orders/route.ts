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
        // Only an explicit original submission link can determine the reward recipient.
        for (const item of quote.items) {
            const material = materials!.find(m => m.id === item.item_id);
            if (item.item_type !== 'PERSONAL_DB') continue;
            let original:any;
            if(material.source_submission_id) {
                const result=await sb.from('exam_materials').select('*').eq('id',material.source_submission_id).single();
                if(result.error || !result.data) throw new Error('제보 수익 배분 정보를 확인하지 못했습니다.');
                original=result.data;
            } else {
                const result=await sb.from('exam_materials').select('*').eq('school',material.school).eq('grade',material.grade)
                    .eq('semester',material.semester).eq('exam_type',material.exam_type).eq('subject',material.subject)
                    .eq('exam_year',material.exam_year).eq('content_type','원본제보').limit(2);
                if(result.error) throw new Error('제보 수익 배분 정보를 확인하지 못했습니다.');
                if((result.data||[]).length>1) throw new Error('이 자료의 원본 제보 연결을 운영자가 확인해야 합니다.');
                original=result.data?.[0];
            }
            if(!original) continue;
            const recipient = original.submitter_id || original.uploader_id;
            if (recipient && recipient !== user.id && recipient !== material.uploader_id) {
                item.reward_user_id = recipient;
                item.submission_id = original.id;
            }
        }
        const paymentId = `order-${crypto.randomUUID().replace(/-/g, '')}`;
        const { error: insertError } = await sb.from('payment_orders').insert({ payment_id: paymentId, user_id: user.id, ...quote });
        if (insertError) { console.error('[Order create]', insertError.code); return NextResponse.json({ message: '주문을 준비하지 못했습니다. 결제는 시작되지 않았습니다.' }, { status: 503 }); }
        return NextResponse.json({ paymentId, amount: quote.amount, name: quote.name });
    } catch (error: any) { return NextResponse.json({ message: error.message || '주문 정보를 확인해주세요.' }, { status: 400 }); }
}
