import JSZip from 'jszip';
import type { SupabaseClient } from '@supabase/supabase-js';
import { safeFilename } from './downloads';
import { storageKey } from './storage-key';

export async function materialArchive(sb: SupabaseClient, files: unknown) {
    if (!Array.isArray(files) || !files.length || files.length > 100) throw Error('Invalid files');
    // Validate the entire set before reading anything. Limit memory usage to 100 MiB.
    const entries = files.map(f => {
        const path = storageKey(f?.path);
        if (!path) throw Error('Invalid key');
        return { path, name: safeFilename(typeof f.name === 'string' ? f.name : path.split('/').pop()!) };
    });
    const zip = new JSZip();
    let total = 0;
    for (const [i, entry] of entries.entries()) {
        const result = await sb.storage.from('exam-materials').download(entry.path);
        if (result.error || !result.data) throw Error('File unavailable');
        total += result.data.size;
        if (total > 100 * 1024 * 1024) throw Error('Archive too large');
        zip.file(`${String(i + 1).padStart(3, '0')}_${entry.name}`, await result.data.arrayBuffer());
    }
    return zip.generateAsync({ type: 'nodebuffer', compression: 'STORE' });
}
