import {NextRequest,NextResponse} from 'next/server';
import {getHomeExams} from '@/lib/home-catalog';
import {unpackHomeRow} from '@/lib/data';
import {matchesCatalogSearch} from '@/lib/catalog-search';

export async function GET(req:NextRequest){
    try{
        const page=Number(req.nextUrl.searchParams.get('page')||0);
        if(!Number.isInteger(page)||page<0||page>100)return NextResponse.json({error:'페이지를 확인해주세요.'},{status:400});
        const rows=await getHomeExams();
        const query=req.nextUrl.searchParams.get('q')?.trim().toLocaleLowerCase('ko-KR');
        if(query){
            if(query.length<2||query.length>80)return NextResponse.json({error:'검색어는 2~80자로 입력해주세요.'},{status:400});
            const matched=rows.filter(row=>{
                const item=unpackHomeRow(row);
                return matchesCatalogSearch({school:item.school,title:item.title,year:item.exam_year,
                    grade:item.grade,semester:item.semester,examType:item.exam_type,subject:item.subject},query);
            });
            return NextResponse.json({rows:matched},{headers:{'Cache-Control':'public, max-age=60'}});
        }
        return NextResponse.json({rows:rows.slice(page*200,(page+1)*200),hasNext:(page+1)*200<rows.length},{headers:{'Cache-Control':'public, max-age=60'}});
    }catch{return NextResponse.json({error:'전체 자료를 불러오지 못했습니다.'},{status:503});}
}
