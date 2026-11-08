import type { SupabaseClient } from '@supabase/supabase-js';

export async function ensurePrivateOriginals(sb: SupabaseClient, create = false) {
    if (create) {
        const listed = await sb.storage.listBuckets();
        if (listed.error || !listed.data) throw Error('Cannot verify original storage');
        if (!listed.data.some(b => b.id === 'hwpx-originals')) {
            const made = await sb.storage.createBucket('hwpx-originals', { public: false, fileSizeLimit: 52428800 });
            if (made.error) throw Error('Cannot create private original storage');
        }
    }
    const checked = await sb.storage.getBucket('hwpx-originals');
    if (checked.error || checked.data?.public !== false) throw Error('Original storage must be private');
}
