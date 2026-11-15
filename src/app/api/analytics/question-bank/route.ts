import {safeAttribution} from '@/lib/analytics/campaigns';
import {NextRequest,NextResponse} from 'next/server';
import {createClient} from '@/utils/supabase/server';
import {createAdminClient} from '@/utils/supabase/server-admin';
import {productionSite} from '@/lib/analytics/server';
import {uuidPattern} from '@/lib/payments/order';
const allowed = new Set(['qb_enter','qb_db_select','qb_search','qb_search_empty','qb_cart_add','qb_save_fail','qb_pass_block','qb_demo','qb_auto_generate','qb_auth_request','qb_resume','qb_clone',
    // [11/16] 화면이 보내는데 여기 없어 400 으로 버려지던 것(비로그인 방문은 10/26 차단 뒤 기록 0) — DB 제약도 같이 넓힘(20261116 마이그레이션)
    'qb_login_wall','qb_generate_click','qb_ladder','qb_autogen']);
export async function POST(req:NextRequest) {
    if(!productionSite(req)) return new NextResponse(null,{status:204});
    try {
        const origin = req.headers.get('origin') || req.headers.get('referer');
        if(!origin || new URL(origin).host!==req.nextUrl.host) return new NextResponse(null,{status:403});
        const body = await req.json();
        if(!allowed.has(body.event) || !uuidPattern.test(body.eventId) || !uuidPattern.test(body.sessionId)) return new NextResponse(null,{status:400});
        const {data:{user}} = await createClient().auth.getUser();
        if(user?.email==='mathofhy@naver.com')return new NextResponse(null,{status:204});
        const attribution=safeAttribution(body);
        const {error} = await createAdminClient().from('question_bank_events').upsert({event_id:body.eventId,session_id:body.sessionId,event:body.event,source:'client',origin:attribution.origin,campaign:attribution.campaign,device:attribution.device,user_id:user?.id || null,
            question_count:Number.isInteger(body.questionCount) && body.questionCount>=0 && body.questionCount<=50 ? body.questionCount : null}, {onConflict:'event_id',ignoreDuplicates:true});
        if(error) return new NextResponse(null,{status:503});
        return new NextResponse(null,{status:204});
    } catch { return new NextResponse(null,{status:400}); }
}
