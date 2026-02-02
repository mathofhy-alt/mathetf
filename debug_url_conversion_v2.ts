
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function testSupabaseDownload() {
    // URL: https://eupclfzfouxzzmipjchz.supabase.co/storage/v1/object/public/hwpx/manual_captures/fb6df3a9-dd7c-4068-bc83-1d15ee9a61a4_solution_1769792061657.png
    // Pattern: .../public/<BUCKET>/<PATH>

    const targetUrl = "https://eupclfzfouxzzmipjchz.supabase.co/storage/v1/object/public/hwpx/manual_captures/fb6df3a9-dd7c-4068-bc83-1d15ee9a61a4_solution_1769792061657.png";
    const publicMarker = '/public/';
    const splitIdx = targetUrl.indexOf(publicMarker);

    if (splitIdx === -1) {
        console.error('Not a standard Supabase Public URL');
        return;
    }

    const fullPath = targetUrl.substring(splitIdx + publicMarker.length);
    // fullPath: hwpx/manual_captures/...

    const slashIdx = fullPath.indexOf('/');
    const bucket = fullPath.substring(0, slashIdx); // "hwpx"
    const filePath = fullPath.substring(slashIdx + 1); // "manual_captures/..."

    console.log(`Bucket: ${bucket}`);
    console.log(`Path: ${filePath}`);

    const { data, error } = await supabase
        .storage
        .from(bucket)
        .download(filePath);

    if (error) {
        console.error('Download Error:', error);
    } else {
        console.log('Download Success!');
        const buffer = await data.arrayBuffer();
        console.log(`Size: ${buffer.byteLength} bytes`);
        const b64 = Buffer.from(buffer).toString('base64');
        console.log(`Base64 Start: ${b64.substring(0, 50)}`);
    }
}

testSupabaseDownload();
