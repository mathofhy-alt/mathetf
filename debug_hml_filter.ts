
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load env
dotenv.config({ path: path.resolve(__dirname, '.env.local') });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function runDebug() {
    console.log('--- Starting Filter Debug Simulation ---');

    // 1. Fetch the MANUAL_S_... image found previously
    // BinID: MANUAL_S_1769962881108
    const targetBinId = 'MANUAL_S_1769962881108';

    const { data: images } = await supabase
        .from('question_images')
        .select('*')
        .eq('original_bin_id', targetBinId);

    if (!images || images.length === 0) {
        console.error('Target image not found in DB!');
        return;
    }

    const testImg = images[0];
    console.log('Fetched Image:', {
        id: testImg.id,
        original_bin_id: testImg.original_bin_id,
        format: testImg.format
    });

    // 2. Mock the AllImages array structure used in generator.ts
    // generator.ts: allImages.push({ originalId: img.original_bin_id, newId, image: img });
    const mockAllImages = [
        {
            originalId: testImg.original_bin_id,
            newId: 100, // Simulated new ID
            image: testImg
        }
    ];

    // 3. Run the Hybrid Filter Logic EXACTLY as it was implemented
    console.log('\n--- Running Hybrid Filter Logic ---');

    const usedImages = mockAllImages.filter(img => {
        const id = String(img.newId);

        // LOGIC START
        const format = (img.image.format || '').toLowerCase();
        console.log(`[Filter Check] ID: ${id}, Format: '${format}'`);

        // Rule 1: Always keep non-SVGs (Safety First)
        if (format !== 'svg') {
            console.log(`[Filter Result] KEEP (Non-SVG rule)`);
            return true;
        }

        console.log('[Filter Result] CHECK USAGE (SVG rule)');
        return false; // Assuming usage check fails for this test
    });

    console.log(`\nFinal Filtered Count: ${usedImages.length}`);
    if (usedImages.length > 0) {
        console.log('SUCCESS: Image was PRESERVED.');
    } else {
        console.log('FAILURE: Image was REMOVED.');
    }
}

runDebug();
