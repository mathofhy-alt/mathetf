import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkActualPrices() {
    console.log('--- Checking actual prices in exam_materials ---');
    const { data, error } = await supabase
        .from('exam_materials')
        .select('id, title, price, created_at, file_type')
        .eq('file_type', 'DB')
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error:', error);
        return;
    }

    data.forEach(item => {
        console.log(`ID: ${item.id} | Price: ${item.price}P | Title: ${item.title} | CreatedAt: ${item.created_at}`);
    });
}

checkActualPrices();
