
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function testStorageMetadata() {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

    // Login (needed for storage upload RLS usually)
    const { data: { user }, error: authError } = await supabase.auth.signInWithPassword({
        email: process.env.TEST_EMAIL || 'test@example.com', // Assuming I can't login easily without creds
        password: process.env.TEST_PASSWORD || 'password'
    });

    // If we can't login, we might be stuck. But I'll try listing first using the anon key (might allow public read?)
    // Actually, local development usually requires a valid session.
    // I'll try to find a valid session or user ID from previous logs?
    // User ID from previous logs: not easily avail.

    // ALTERNATIVE: Use the existing 'save/route.ts' but modified to test? 
    // No, I'll just check if I can list public bucket? 'exams' might be private.

    console.log("Checking storage metadata capability...");

    // Assuming we have a service role key in env? 
    // Usually local .env has NEXT_PUBLIC_SUPABASE_ANON_KEY.
    // If I cannot auth, I cannot upload.

    // Let's just TRY to list the bucket 'exams' without auth (if RLS is open)
    const { data, error } = await supabase.storage.from('exams').list();

    if (error) {
        console.error('List Error:', error);
    } else {
        console.log('Files:', data);
        if (data && data.length > 0) {
            console.log('First file metadata:', data[0].metadata);
        }
    }
}

testStorageMetadata();
