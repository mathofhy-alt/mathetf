
const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');
const { createClient } = require('@supabase/supabase-js');

// Manually load .env.local
try {
    const envPath = path.join(process.cwd(), '.env.local');
    if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf-8');
        envContent.split('\n').forEach(line => {
            const parts = line.split('=');
            if (parts.length >= 2) {
                const key = parts[0].trim();
                const val = parts.slice(1).join('=').trim().replace(/^["']|["']$/g, '');
                if (key && !key.startsWith('#')) {
                    process.env[key] = val;
                }
            }
        });
    }
} catch (e) { console.error('Env Load Error', e); }

async function run() {
    console.log('--- Debugging HWPX Flow ---');

    // 1. Check Template
    const templatePath = path.join(process.cwd(), 'standard_template.hwpx');
    if (!fs.existsSync(templatePath)) {
        console.error('Template NOT FOUND at', templatePath);
        return;
    }

    try {
        const tmplBuf = fs.readFileSync(templatePath);
        const zip = await JSZip.loadAsync(tmplBuf);
        console.log('Template Files found:', Object.keys(zip.files).filter(f => f.includes('section0.xml')));

        const secFile = zip.file('Contents/section0.xml');
        if (secFile) {
            const secXml = await secFile.async('string');
            console.log('Section0 Size:', secXml.length);
            console.log('Has [[INSERT_HERE]]?', secXml.includes('[[INSERT_HERE]]'));
            console.log('Has placeholders?', /\[\[.*?\]\]/.test(secXml));

            // Show structure near end
            console.log('Section Ends With:', secXml.slice(-100));
        } else {
            console.error('Template MISSING Contents/section0.xml');
        }

    } catch (e) {
        console.error('Template Zip Error:', e.message);
    }

    // 2. Check DB Content
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
        console.error('Missing Supabase Credentials');
        return;
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data, error } = await supabase
        .from('questions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1);

    if (error) {
        console.error('DB Error:', error.message);
    } else if (data && data.length > 0) {
        const q = data[0];
        const xml = q.content_xml;
        console.log(`Latest Question ID: ${q.id}`);
        console.log('Content XML Length:', xml ? xml.length : 0);
        console.log('XML Preview:', xml ? xml.slice(0, 300) : 'NULL');
        console.log('Has <hp:p>?', xml && xml.includes('<hp:p'));
        console.log('Has Asset Metadata?', xml && xml.includes('<!-- ASSETS'));
    } else {
        console.log('No questions found in DB');
    }
}

run();
