// Read-only audit: no SQL, writes, object downloads, credentials or full paths in output.
const fs = require('node:fs');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local', quiet: true });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const names = ['exam-materials', 'hwpx', 'mock-materials', 'exam-previews', 'exam-free-problems', 'question-assets', 'exam-analysis', 'pdf-jobs', 'exams'];
(async () => {
  const { data, error } = await sb.storage.listBuckets();
  if (error) throw Error('Bucket inventory failed: ' + error.message);
  const result = { at: new Date().toISOString(), mode: 'read-only, metadata only', buckets: [] };
  for (const name of names) {
    const bucket = data.find(b => b.id === name);
    if (!bucket) { result.buckets.push({ name, exists: false }); continue; }
    const queue = [''], extensions = {}, prefixes = {}, samples = [];
    let objects = 0, requests = 0;
    while (queue.length && requests < 80) {
      const prefix = queue.shift();
      for (let offset = 0; requests < 80; offset += 1000) {
        const { data: files, error } = await sb.storage.from(name).list(prefix, { limit: 1000, offset, sortBy: { column: 'name', order: 'asc' } });
        requests++;
        if (error) throw Error(name + ' list failed: ' + error.message);
        for (const f of files) {
          const path = prefix ? prefix + '/' + f.name : f.name;
          if (!f.id) { queue.push(path); continue; }
          objects++;
          const ext = f.name.split('.').pop().toLowerCase();
          extensions[ext] = (extensions[ext] || 0) + 1;
          const group = prefix ? prefix.split('/')[0] : '(root)';
          // User UUID prefixes are counted together.
          const key = /^[0-9a-f-]{36}$/i.test(group) ? '(user folders)' : group;
          prefixes[key] = (prefixes[key] || 0) + 1;
          if (samples.length < 3) samples.push({ extension: ext, bytes: f.metadata?.size, contentType: f.metadata?.mimetype });
        }
        if (files.length < 1000) break;
      }
    }
    result.buckets.push({ name, exists: true, public: bucket.public, objectsSeen: objects, complete: !queue.length && requests < 80, requests, extensions, prefixes, samples });
  }
  const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const probe = await anon.from('exam_materials').select('file_path').limit(1);
  result.anonymousFilePathSelectable = !probe.error;
  result.anonymousFilePathPresent = Boolean(probe.data?.[0]?.file_path);
  // The large image prefix may exhaust the sampling budget before raw_uploads.
  // Inspect that source prefix independently, without fetching any file bodies.
  const targeted = { objectsSeen: 0, extensions: {}, complete: false };
  for (let offset = 0; offset < 20000; offset += 1000) {
    const { data: files, error } = await sb.storage.from('hwpx').list('raw_uploads', { limit: 1000, offset, sortBy: { column: 'name', order: 'asc' } });
    if (error) throw Error('Source metadata audit failed: ' + error.message);
    for (const file of files) if (file.id) {
      targeted.objectsSeen++;
      const ext = file.name.split('.').pop().toLowerCase();
      targeted.extensions[ext] = (targeted.extensions[ext] || 0) + 1;
    }
    if (files.length < 1000) { targeted.complete = true; break; }
  }
  result.hwpxTargeted = { raw_uploads: targeted };
  fs.writeFileSync('C:/selfmade/다운로드수리/storage_audit.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
})().catch(e => { console.error(e.message); process.exitCode = 1; });
