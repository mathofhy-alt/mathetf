import {NextRequest,NextResponse} from 'next/server';
import {getHomeExams} from '@/lib/home-catalog';
import {unpackHomeRow} from '@/lib/data';
import {matchesCatalogSearch} from '@/lib/catalog-search';

// [10/27 대표] 홈 전체 목록이 50페이지 × 1.2초 — unstable_cache 가 버셀에서 안 들어 페이지마다 1만 행을 DB 에서 다시 읽었다.
//   → 인스턴스 메모리에 5분 담아 두고, 홈은 all=1 로 한 번에 받는다(CDN 에도 5분).
const MEM_TTL=5*60*1000;
const mem:{at:number;rows:any[]|null}=(globalThis as any).__homeCatalog||{at:0,rows:null};
(globalThis as any).__homeCatalog=mem;
async function homeRows(){
    if(mem.rows&&Date.now()-mem.at<MEM_TTL)return mem.rows;
    const rows=await getHomeExams();mem.rows=rows;mem.at=Date.now();return rows;
}

export async function GET(req:NextRequest){
    try{
        const page=Number(req.nextUrl.searchParams.get('page')||0);
        if(!Number.isInteger(page)||page<0||page>100)return NextResponse.json({error:'페이지를 확인해주세요.'},{status:400});
        const rows=await homeRows();
        if(req.nextUrl.searchParams.get('all')==='1')
            return NextResponse.json({rows,total:rows.length},{headers:{'Cache-Control':'public, max-age=60, s-maxage=300, stale-while-revalidate=600'}});
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
        // [10/27] total — 홈이 나머지 페이지를 한꺼번에(동시에) 받도록. 예전엔 차례로 20페이지 × 1.2초를 기다렸다
        return NextResponse.json({rows:rows.slice(page*200,(page+1)*200),hasNext:(page+1)*200<rows.length,total:rows.length},{headers:{'Cache-Control':'public, max-age=60'}});
    }catch{return NextResponse.json({error:'전체 자료를 불러오지 못했습니다.'},{status:503});}
}
