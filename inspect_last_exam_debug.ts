
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

// Load env
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase keys in .env.local');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectLastExam() {
    console.log('Fetching latest saved exam...');

    // 1. Get latest user item
    const { data: item, error } = await supabase
        .from('user_items')
        .select('*')
        .eq('type', 'saved_exam')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

    if (error || !item) {
        console.error('Failed to fetch latest item:', error);
        return;
    }

    console.log(`Found Latest Exam: "${item.name}" (ID: ${item.reference_id}) created at ${item.created_at}`);

    // 2. Download Debug Manifest
    const userId = item.user_id;
    const manifestPath = `${userId}/${item.reference_id}_debug.json`;

    console.log(`Downloading debug manifest: ${manifestPath}`);
    const { data, error: dlError } = await supabase
        .storage
        .from('exams')
        .download(manifestPath);

    if (dlError) {
        console.error('Failed to download debug manifest:', dlError);
        console.log('Trying to list files in folder to debug...');
        const { data: list, error: listError } = await supabase.storage.from('exams').list(userId);
        if (list) console.log('Files in user folder:', list.map(f => f.name));
        return;
    }

    // 3. Parse and Analyze
    const text = await data.text();
    const manifest = JSON.parse(text);

    console.log('\n=== DEBUG MANIFEST ANALYSIS ===');
    console.log(`Timestamp: ${manifest.timestamp}`);
    console.log(`Template: ${manifest.templateUsed}`);
    console.log(`Total Questions: ${manifest.totalQuestions}`);
    console.log(`Total Images processed: ${manifest.images.length}`);

    // Analyze Images
    let totalOriginalSize = 0;
    let totalEncodedSize = 0;
    const formatCounts: Record<string, number> = {};
    const signatures = new Set<string>();
    let duplicates = 0;

    manifest.images.forEach((img: any) => {
        totalOriginalSize += img.originalSize || 0;
        totalEncodedSize += img.dataLength || 0;
        formatCounts[img.format] = (formatCounts[img.format] || 0) + 1;

        // Check duplication by length + id as a proxy for signature
        const sig = `${img.dataLength}_${img.original_bin_id}`;
        if (signatures.has(sig)) duplicates++;
        signatures.add(sig);
    });

    console.log('\n--- Image Stats ---');
    console.log(`Total Uncompressed Size (approx): ${(totalOriginalSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`Total Encoded Data Size (Base64): ${(totalEncodedSize / 1024 / 1024).toFixed(2)} MB`);
    console.log('Formats:', formatCounts);
    console.log(`Potential Duplicates (by size+id): ${duplicates}`);

    // Top 5 Largest Images
    console.log('\n--- Top 5 Largest Images ---');
    const sorted = [...manifest.images].sort((a, b) => b.dataLength - a.dataLength).slice(0, 5);
    sorted.forEach((img: any) => {
        console.log(`Img ${img.id} (${img.format}): ${(img.dataLength / 1024).toFixed(2)} KB (Compressed: ${img.compressed})`);
    });

}

inspectLastExam();
