
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const envPath = path.resolve(process.cwd(), '.env.local');
let supabaseUrl = '';
let serviceKey = '';

if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf-8');
    content.split('\n').forEach(line => {
        const [key, value] = line.split('=');
        if (key && value) {
            const cleanVal = value.trim().replace(/^["']|["']$/g, '');
            if (key.trim() === 'NEXT_PUBLIC_SUPABASE_URL') supabaseUrl = cleanVal;
            if (key.trim() === 'SUPABASE_SERVICE_ROLE_KEY') serviceKey = cleanVal;
        }
    });
}

const supabase = createClient(supabaseUrl, serviceKey);

async function run() {
    console.log("--- Payload Size Diagnostic (10 Questions) ---");

    const start = Date.now();
    const { data, error } = await supabase
        .from('questions')
        .select(`
            id,
            content_xml,
            question_images (
                data
            )
        `)
        .limit(10);

    if (error) {
        console.error("Error:", error);
        return;
    }

    const json = JSON.stringify(data);
    const sizeInMB = Buffer.byteLength(json, 'utf8') / (1024 * 1024);

    console.log(`Payload Size for 10 Questions: ${sizeInMB.toFixed(2)} MB`);
    console.log(`Fetch Time (Service Role): ${Date.now() - start}ms`);

    if (data) {
        data.forEach((q: any, i: number) => {
            const imgCount = q.question_images?.length || 0;
            const imgSize = q.question_images?.reduce((acc: number, img: any) => acc + (img.data?.length || 0), 0) || 0;
            console.log(`[Q${i}] XML: ${(q.content_xml?.length || 0) / 1024} KB | Images: ${imgCount} (${(imgSize / 1024).toFixed(2)} KB)`);
        });
    }
}

run();
