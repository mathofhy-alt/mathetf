import {NextRequest,NextResponse} from 'next/server';
import {getHomeExams} from '@/lib/home-catalog';
export async function GET(req:NextRequest){try{const page=Number(req.nextUrl.searchParams.get('page')||0);if(!Number.isInteger(page)||page<0||page>100)return NextResponse.json({error:'페이지를 확인해주세요.'},{status:400});const rows=await getHomeExams();return NextResponse.json({rows:rows.slice(page*200,(page+1)*200),hasNext:(page+1)*200<rows.length},{headers:{'Cache-Control':'public, max-age=60'}});}catch{return NextResponse.json({error:'전체 자료를 불러오지 못했습니다.'},{status:503});}}
