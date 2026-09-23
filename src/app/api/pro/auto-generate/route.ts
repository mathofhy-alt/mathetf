import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/server-admin';
import { availableCatalog } from '@/lib/questions/catalog';
import { resolveScope } from '@/lib/questions/scope';
import {uuidPattern} from '@/lib/payments/order';

export async function POST(req: NextRequest) {
    const { data: { user } } = await createClient().auth.getUser();
    if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    const body = await req.json().catch(() => null);
    if (!body || !Number.isInteger(body.count) || body.count < 1 || body.count > 50 ||
        !Number.isInteger(body.minDifficulty) || !Number.isInteger(body.maxDifficulty) ||
        body.minDifficulty < 1 || body.maxDifficulty > 10 || body.minDifficulty > body.maxDifficulty) {
        return NextResponse.json({ error: '문항 수와 난이도 범위를 확인해주세요.' }, { status: 400 });
    }
    try {
        const scope = resolveScope(await availableCatalog(), body.selectedDbs, body.mockSlug);
        if (!scope.length) return NextResponse.json({ error: '먼저 출제할 자료를 선택해주세요.' }, { status: 400 });
        const sb = createAdminClient();
        const excluded=Array.isArray(body.excludedQuestionIds)?body.excludedQuestionIds:[];
        if(excluded.length>5000 || excluded.some((id:unknown)=>typeof id!=='string'||!uuidPattern.test(id))) throw new Error('제외할 문항 정보를 확인해주세요.');
        if(body.unit!==undefined && (!Array.isArray(body.unit)||body.unit.length>300||body.unit.some((u:unknown)=>typeof u!=='string'))) throw new Error('출제 단원을 확인해주세요.');
        const {data,error}=await sb.rpc('question_bank_random',{
            p_scope:scope,p_excluded:excluded,p_subject:typeof body.subject==='string'?body.subject:'',p_units:body.unit||[],
            p_min:body.minDifficulty,p_max:body.maxDifficulty,p_count:body.count,p_include_off:body.includeOffCurriculum===true,
        });
        if(error) throw new Error('자동 출제를 완료하지 못했습니다. 잠시 후 다시 시도해주세요.');
        return NextResponse.json({...data,requestedCount:body.count});
    } catch (e) {
        return NextResponse.json({ error: e instanceof Error ? e.message : '자동 출제를 완료하지 못했습니다.' }, { status: 400 });
    }
}
