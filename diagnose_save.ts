
import fs from 'fs';
import path from 'path';
import 'dotenv/config';

async function diagnose() {
    console.log('[Diagnostics] Starting...');
    console.log('[Diagnostics] CWD:', process.cwd());

    // Check Templates
    const t1 = path.join(process.cwd(), '재조립양식.hml');
    const t2 = path.join(process.cwd(), 'template.hml');
    console.log(`[Diagnostics] Checking ${t1}: ${fs.existsSync(t1)}`);
    console.log(`[Diagnostics] Checking ${t2}: ${fs.existsSync(t2)}`);

    // Check Generator Import
    try {
        console.log('[Diagnostics] Importing generator...');
        const mod = await import('./src/lib/hml-v2/generator');
        console.log('[Diagnostics] Generator imported:', !!mod.generateHmlFromTemplate);
    } catch (e) {
        console.error('[Diagnostics] Generator Import Failed:', e);
    }
}

diagnose();
