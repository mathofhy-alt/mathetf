import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  const { data, error } = await sb
    .from('exam_materials')
    .select('school, is_verified, exam_year, subject')
    .order('school');

  if (error) { console.error(error.message); return; }

  const summary: Record<string, { t: number; v: number; f: number; n: number }> = {};
  for (const r of data!) {
    const k = r.school || '(없음)';
    if (!summary[k]) summary[k] = { t: 0, v: 0, f: 0, n: 0 };
    summary[k].t++;
    if (r.is_verified === true)  summary[k].v++;
    else if (r.is_verified === false) summary[k].f++;
    else summary[k].n++;
  }

  console.log('\n=== is_verified 현황 (검증 안 된 자료 있는 학교만) ===');
  console.log('학교명 | true(검증) | false | null | 합계');
  console.log('----------------------------------------------');
  for (const [school, s] of Object.entries(summary).sort((a,b) => b[1].t - a[1].t)) {
    if (s.f > 0 || s.n > 0) {
      console.log(`${school}: ✅${s.v} | ❌${s.f} | ❓${s.n} | 합계${s.t}`);
    }
  }

  const totalV = Object.values(summary).reduce((a, s) => a + s.v, 0);
  const totalF = Object.values(summary).reduce((a, s) => a + s.f, 0);
  const totalN = Object.values(summary).reduce((a, s) => a + s.n, 0);
  console.log(`\n전체 합계: ✅검증 ${totalV} | ❌미승인 ${totalF} | ❓null ${totalN}`);
  console.log(`\n→ 지금 is_verified를 true로 바꾸면 추가로 광고 가능한 자료: ${totalF + totalN}개`);
}

main().catch(console.error);
