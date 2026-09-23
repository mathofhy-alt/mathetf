import {NextRequest,NextResponse} from 'next/server';
import {createClient} from '@/utils/supabase/server';
import {SAVED_EXAM_LIMIT} from '@/lib/config';
export const dynamic='force-dynamic';
export async function GET(req:NextRequest){
 const sb=createClient();const {data:{user}}=await sb.auth.getUser();
 if(!user)return NextResponse.json({items:[],count:0,limit:SAVED_EXAM_LIMIT},{status:401});
 let query=sb.from('user_items').select('id,name,details,reference_id,created_at',{count:'exact'}).eq('user_id',user.id).eq('type','saved_exam').order('created_at',{ascending:false});
 const id=req.nextUrl.searchParams.get('id');if(id)query=query.eq('id',id);
 const {data,error,count}=await query.limit(id?1:3);
 if(error)return NextResponse.json({error:'최근 시험지를 불러오지 못했습니다.'},{status:503});
 try {
 const items=await Promise.all((data||[]).map(async item=>{
  let details=item.details||{};
  if(id&&!Array.isArray(details.question_ids)){
   const result=await sb.storage.from('exams').download(`${user.id}/${item.reference_id}.json`);
   if(result.error||!result.data)throw new Error('편집 정보를 읽지 못했습니다.');details=JSON.parse(await result.data.text());
  }
  return {id:item.id,name:item.name,createdAt:item.created_at,count:details.question_count||0,bytes:details.file_bytes||null,
   ...(id?{ids:(details.question_ids||[]).slice(0,50),dbIds:details.source_db_ids||[],filters:details.filters||null,questionsPerColumn:details.questions_per_column||2}: {})};
 }));
 return NextResponse.json({items,count:count||0,limit:SAVED_EXAM_LIMIT});
 }catch{return NextResponse.json({error:'편집 정보를 불러오지 못했습니다.'},{status:503});}
}
