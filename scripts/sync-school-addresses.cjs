// Read-only DB query; refresh the local public NEIS school-address snapshot.
require('dotenv').config({ path: '.env.local', quiet: true });
const { createClient } = require('@supabase/supabase-js');
const fs = require('node:fs');
const path = require('node:path');

async function main() {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const names = new Set();
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db.from('exam_materials').select('school').order('id').range(offset, offset + 999);
    if (error) throw error;
    for (const row of data) if (/학교$/.test(row.school || '')) names.add(row.school);
    if (data.length < 1000) break;
  }
  // Legacy exam rows shorten the Ansan school's official name to 동산고등학교.
  if (names.has('동산고등학교')) names.add('안산동산고등학교');
  const records = [], missing = [];
  const queue = [...names].sort();
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (queue.length) {
      const name = queue.shift();
      const url = `https://open.neis.go.kr/hub/schoolInfo?Type=json&SCHUL_NM=${encodeURIComponent(name)}`;
      const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw new Error(`NEIS HTTP ${response.status}: ${name}`);
      const result = await response.json();
      const rows = result.schoolInfo?.find(item => item.row)?.row || [];
      if (!result.schoolInfo && result.RESULT?.CODE !== 'INFO-200') throw new Error(`NEIS error: ${JSON.stringify(result.RESULT)}`);
      const exact = rows.filter(row => row.SCHUL_NM === name && row.ORG_RDNMA?.trim());
      if (!exact.length) missing.push(name);
      for (const row of exact) records.push({ name, region: row.LCTN_SC_NM, address: row.ORG_RDNMA.trim(), schoolCode: row.SD_SCHUL_CODE, source: url });
    }
  }));
  records.sort((a, b) => a.name.localeCompare(b.name, 'ko') || a.schoolCode.localeCompare(b.schoolCode));
  const output = { source: '나이스 교육정보 개방 포털 학교기본정보', fetchedAt: new Date().toISOString(), records, missing: missing.sort() };
  fs.writeFileSync(path.join(__dirname, '../src/lib/school-addresses.json'), JSON.stringify(output, null, 2) + '\n');
  console.log(JSON.stringify({ schools: names.size, addresses: records.length, missing: output.missing }));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
