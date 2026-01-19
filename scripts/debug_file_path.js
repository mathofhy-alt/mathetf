
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const fs = require('fs');

const envPath = path.resolve(__dirname, '../.env.local');
const envConfig = fs.readFileSync(envPath, 'utf8');

const envVars = {};
envConfig.split('\n').forEach(line => {
    const [key, value] = line.split('=');
    if (key && value) {
        envVars[key.trim()] = value.trim().replace(/^["']|["']$/g, '');
    }
});

const supabaseUrl = envVars.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = envVars.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing env vars or failed to parse .env.local');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkFiles() {
    const { data, error } = await supabase
        .from('exam_materials')
        .select('*')
        .limit(1);

    if (error) {
        console.error('Error:', error);
        return;
    }

    if (data && data.length > 0) {
        console.log('Columns:', Object.keys(data[0]));
        console.log('Sample Data:', data[0]);
    }

    if (data && data.length > 0) {
        // Check the first file
        const targetFile = data[0];
        console.log(`Checking file: ${targetFile.file_path}`);

        const filename = '영동일고_테스트_파일.pdf';
        const { data: urlData, error: urlError } = await supabase.storage
            .from('exam-materials')
            .createSignedUrl(targetFile.file_path, 60, {
                download: filename
            });

        if (urlError) {
            console.error('Error creating signed URL:', urlError);
        } else {
            console.log('Signed URL generated.');

            try {
                const response = await fetch(urlData.signedUrl, { method: 'HEAD' });
                console.log('HTTP Status:', response.status);
                console.log('Content-Type:', response.headers.get('content-type'));
                console.log('Content-Length:', response.headers.get('content-length'));
                console.log('Content-Disposition:', response.headers.get('content-disposition'));
            } catch (fetchError) {
                console.error('Error fetching URL:', fetchError);
            }
        }
    }
}

checkFiles();
