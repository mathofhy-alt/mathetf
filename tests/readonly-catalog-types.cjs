// Read-only audit of saleable material types in the existing production catalog.
const fs = require('node:fs');
const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');

const env = dotenv.parse(fs.readFileSync('C:\\dev\\mathetf\\.env.local'));
if (env.NEXT_PUBLIC_SUPABASE_URL !== 'https://eupclfzfouxzzmipjchz.supabase.co') throw new Error('Unexpected Supabase project.');
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function main() {
    const counts = new Map();
    let total = 0;
    for (let start = 0; ; start += 1000) {
        const { data, error } = await sb.from('exam_materials').select('file_type,price').range(start, start + 999);
        if (error) throw new Error(`Catalog read failed: ${error.code}`);
        for (const material of data || []) {
            if (typeof material.price !== 'number' || material.price <= 0) continue;
            const type = material.file_type ?? '(null)';
            counts.set(type, (counts.get(type) || 0) + 1);
            total++;
        }
        if (!data || data.length < 1000) break;
    }
    console.log(JSON.stringify({ pricedMaterials: total, fileTypes: Object.fromEntries([...counts].sort()) }));
    const unsupported = [...counts.keys()].filter(type => !['DB', 'HWP', 'PDF'].includes(type));
    if (unsupported.length) { console.error(`Unsupported paid file types: ${unsupported.join(', ')}`); process.exitCode = 1; }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
