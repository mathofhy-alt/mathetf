
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

dotenv.config({ path: path.join(__dirname, '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function probeData() {
    const qid = 'eb4224ee-60e7-4de6-a121-ecd164a9e8e9'; // Gyeonggi #20
    const { data: imgs } = await supabase
        .from('question_images')
        .select('*')
        .eq('question_id', qid);

    console.log(`Found ${imgs.length} images.`);

    for (const img of imgs) {
        if (img.original_bin_id === '2' || img.original_bin_id === '3') {
            const buffer = Buffer.from(img.data, 'base64');
            fs.writeFileSync(`probe_${img.original_bin_id}.${img.format}`, buffer);
            console.log(`Saved probe_${img.original_bin_id}.${img.format} (${buffer.length} bytes)`);
        }
    }
}

probeData();
