import mockLinks from '@/lib/questions/verified-mock-links.json';
import {NextRequest,NextResponse} from 'next/server';
import {createAdminClient} from '@/utils/supabase/server-admin';
import {availableCatalog} from '@/lib/questions/catalog';
import {resolveScope} from '@/lib/questions/scope';
import {samePaper,entryFilters} from '@/lib/questions/entry';
import demo from '@/lib/questions/demo-set.json';
export const dynamic='force-dynamic';
export async function GET(req:NextRequest){
 try{
 const p=req.nextUrl.searchParams,sb=createAdminClient();
 const catalog=await availableCatalog();let selected=catalog.filter(d=>!d.availability) as any[];
 let label='선택한 출제 범위';let mockSource:string|undefined;
 if(p.get('demo')==='1')selected=selected.filter(d=>demo.dbIds.includes(d.id));
 if(p.get('material')){
  const {data:row,error}=await sb.from('exam_materials').select('*').eq('id',p.get('material')!).single();
  if(error||!row)return NextResponse.json({error:'자료를 찾지 못했습니다.'},{status:404});
  selected=selected.filter(d=>d.id===row.id||samePaper(d,row));label=row.title||row.school;
 }else if(p.get('mock')){
  const {data:row,error}=await sb.from('mock_exams').select('*').eq('slug',p.get('mock')!).single();
  if(error||!row)return NextResponse.json({error:'모의고사 회차를 찾지 못했습니다.'},{status:404});
  const link=(mockLinks as Record<string,{source:string;dbIds:string[]}>)[row.slug];
  if(!link)return NextResponse.json({error:'이 회차의 문항 연결은 준비 중입니다. 원본 파일은 모의고사 자료 페이지에서 이용하세요.'},{status:409});
  selected=selected.filter(d=>link.dbIds.includes(d.id));if(!link.dbIds.every(id=>selected.some(d=>d.id===id)))return NextResponse.json({error:'이 회차의 전체 문항을 이용할 권한이 없습니다. 자료 이용 범위를 확인해주세요.'},{status:403});mockSource=link.source;
  label=row.title;
 }
 for(const key of ['school','region','district'] as const)if(p.get(key))selected=selected.filter(d=>d[key]===p.get(key));
 if(p.get('semester'))selected=selected.filter(d=>String(d.semester)===p.get('semester'));
 if(p.get('exam'))selected=selected.filter(d=>d.exam_type===p.get('exam'));
 if(!p.get('material')&&!p.get('mock')){const parts=[p.get('school')||p.get('region'),p.get('semester')?`${p.get('semester')}학기`:null,p.get('exam'),p.get('subject')].filter(Boolean);if(parts.length)label=parts.join(' ')+' 문항';}
 if(!selected.length)return NextResponse.json({error:'이 조건에서 출제 가능한 자료가 없습니다. 다른 회차를 선택해주세요.'},{status:404});
 let query=sb.rpc('question_bank_candidates',{p_scope:resolveScope(catalog,selected.map(d=>d.id),p.get('mock')),p_excluded:[]},{count:'exact'})
 .select('id,question_number,subject,grade,school,year,semester,difficulty,key_concepts,unit,work_status,source_db_id,question_type,is_off_curriculum')
 .eq('is_off_curriculum',false).order('question_number').order('id');
 if(p.get('demo')==='1')query=query.in('id',demo.ids);
 else if(p.get('subject'))query=query.eq('subject',p.get('subject')!);
 const {data,error,count}=await query.limit(p.get('demo')==='1'?5:50);
 if(error)throw error;
 if(p.get('demo')==='1'&&(!Array.isArray(data)||data.length!==5))return NextResponse.json({error:'예시 세트를 점검 중입니다. 조건 검색으로 시작해주세요.'},{status:503});
 return NextResponse.json({data:Array.isArray(data)?data:[],total:count||0,dbIds:selected.map(d=>d.id),filters:{...entryFilters(p.get('subject')),...(p.get('mock')?{mockSlug:p.get('mock')}:{})},label:p.get('demo')==='1'?demo.label:label,demo:p.get('demo')==='1'});
 }catch{return NextResponse.json({error:'출제 범위를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.'},{status:503});}
}
