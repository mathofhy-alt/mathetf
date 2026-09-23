import {NextRequest,NextResponse} from 'next/server';
import {createClient} from '@/utils/supabase/server';
import {createAdminClient} from '@/utils/supabase/server-admin';
export async function GET(req:NextRequest) {
    const {data:{user}}=await createClient().auth.getUser();
    if(user?.email!=='mathofhy@naver.com') return new NextResponse(null,{status:403});
    const days=Number(req.nextUrl.searchParams.get('days') || 28);
    const {data,error}=await createAdminClient().rpc('question_bank_metrics',{p_days:Number.isInteger(days) ? Math.max(1,Math.min(days,90)):28});
    return NextResponse.json(error ? {error:'집계 설정을 확인해주세요.'}:{data}, {status:error?503:200});
}
