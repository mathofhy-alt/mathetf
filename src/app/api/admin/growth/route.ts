import {NextRequest,NextResponse} from 'next/server';
import {createClient} from '@/utils/supabase/server';
import {createAdminClient} from '@/utils/supabase/server-admin';
export async function GET(req:NextRequest){const {data:{user}}=await createClient().auth.getUser();if(user?.email!=='mathofhy@naver.com')return NextResponse.json({error:'관리자 로그인이 필요합니다.'},{status:403});const days=Number(req.nextUrl.searchParams.get('days')||28);const {data,error}=await createAdminClient().rpc('question_bank_growth',{p_days:[7,28,90].includes(days)?days:28});return NextResponse.json(error?{error:'집계 준비가 필요합니다. 테스트 DB 적용 상태를 확인해주세요.'}:{data},{status:error?503:200});}
