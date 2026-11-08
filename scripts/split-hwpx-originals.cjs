// Deployment helper. Default is read-only. Never run --prune before the new code is live.
// Uses Storage API (not SQL row moves). Images and previews stay in public hwpx.
const { createClient } = require('@supabase/supabase-js');
const { createHash } = require('node:crypto');
require('dotenv').config({ path: '.env.local', quiet: true });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const source = sb.storage.from('hwpx'), target = sb.storage.from('hwpx-originals');
const mode = process.argv.includes('--copy') ? 'copy' : process.argv.includes('--prune') ? 'prune' : 'audit';
if (process.argv.includes('--copy') && process.argv.includes('--prune')) throw Error('Run copy and prune separately.');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
async function bytes(bucket, path) {
    const { data, error } = await bucket.download(path);
    if (error || !data) throw Error('Cannot read a migration object. Stopped without deleting it.');
    return Buffer.from(await data.arrayBuffer());
}
async function allPaths() {
    const paths = [], queue = ['raw_uploads'];
    while (queue.length) {
        const prefix = queue.shift();
        for (let offset = 0; ; offset += 1000) {
            const { data, error } = await source.list(prefix, { limit: 1000, offset, sortBy: { column: 'name', order: 'asc' } });
            if (error || !data) throw Error('Cannot list source objects.');
            for (const file of data) {
                const path = prefix + '/' + file.name;
                if (!file.id) queue.push(path);
                else if (/\.(hml|hwp|hwpx|pdf|zip)$/i.test(file.name)) paths.push(path);
                else throw Error('Unexpected raw_uploads object type. Inspect before continuing.');
            }
            if (data.length < 1000) break;
        }
    }
    return paths;
}
(async () => {
    const paths = await allPaths();
    console.log(JSON.stringify({ mode, originals: paths.length }));
    if (mode === 'audit') return;
    const { data: bucket, error } = await sb.storage.getBucket('hwpx-originals');
    if (error || !bucket || bucket.public) throw Error('Create a PRIVATE hwpx-originals bucket with migration part A first.');
    // Verify all copies before ANY deletion. Retry is safe after a partial failure.
    for (const [i, path] of paths.entries()) {
        const original = await bytes(source, path);
        if (mode === 'copy') {
            const { error } = await target.upload(path, original, { upsert: false, contentType: 'application/octet-stream' });
            if (error && !['409', '400'].includes(String(error.statusCode))) throw Error('Original copy failed; source has not been removed.');
        }
        const copied = await bytes(target, path);
        if (hash(original) !== hash(copied)) throw Error('SHA-256 mismatch. Source has not been removed.');
        if ((i + 1) % 100 === 0) console.log(JSON.stringify({ verified: i + 1, total: paths.length }));
    }
    if (mode === 'prune') {
        // Freeze original ingestion while pruning; each object is rechecked immediately before removal.
        for (const path of paths) {
            if (hash(await bytes(source, path)) !== hash(await bytes(target, path))) throw Error('Source changed. Stopped.');
            const { error } = await source.remove([path]);
            if (error) throw Error('Could not remove a verified public original. Rerun prune after inspection.');
        }
    }
    console.log(JSON.stringify({ mode, verified: paths.length, publicOriginalsRemoved: mode === 'prune' ? paths.length : 0 }));
})().catch(e => { console.error(e.message); process.exitCode = 1; });
