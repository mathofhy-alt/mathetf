
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Load env
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials!');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function verifyImages() {
    console.log('--- Verifying Supabase Images ---');

    // 1. Fetch a few questions with images
    const { data: questions, error: qError } = await supabase
        .from('questions')
        .select('*')
        .limit(5); // Check 5 random questions

    if (qError) {
        console.error('Error fetching questions:', qError);
        return;
    }

    console.log(`Fetched ${questions.length} questions.`);

    // 2. Fetch images for these questions
    const qIds = questions.map(q => q.id);
    const { data: images, error: iError } = await supabase
        .from('question_images')
        .select('*')
        .in('question_id', qIds);

    if (iError) {
        console.error('Error fetching images:', iError);
        return;
    }

    console.log(`Fetched ${images?.length || 0} images for these questions.`);

    if (!images || images.length === 0) {
        console.warn('No images found for these questions. Trying to fetch ANY images directly.');
        // Fallback: fetch any images
        const { data: anyImages, error: anyError } = await supabase
            .from('question_images')
            .select('*')
            .limit(3);

        if (anyError) {
            console.error('Error fetching ANY images:', anyError);
            return;
        }
        if (anyImages) inspectImages(anyImages);
    } else {
        inspectImages(images);
    }
}

function inspectImages(images: any[]) {
    for (const img of images) {
        console.log(`\nImage ID: ${img.id}`);
        console.log(`  Question ID: ${img.question_id}`);
        console.log(`  Original Bin ID: ${img.original_bin_id}`);
        console.log(`  Format: ${img.format}`);
        console.log(`  Size Bytes: ${img.size_bytes}`);

        const data = img.data || '';
        console.log(`  Data Length: ${data.length}`);

        if (data.length < 100) {
            console.error('  [CRITICAL] Data is suspiciously short (empty?)');
        } else {
            if (data.startsWith('http')) {
                console.log('  [INFO] Data is URL. Full Content:');
                console.log(`"${data}"`); // Quotes to see whitespace
            } else {
                console.log(`  Data Start: ${data.substring(0, 50)}...`);
                // Check for data URI prefix
                if (data.startsWith('data:')) {
                    console.log('  [INFO] Has data URI prefix.');
                } else {
                    console.log('  [INFO] Raw Base64 (likely).');
                }
            }
        }
    }
}

verifyImages().catch(console.error);
