require('./register.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createClient } = require('@supabase/supabase-js');
const { PGlite } = require('@electric-sql/pglite');
const { materialDownload, purchaseIsCurrent, downloadRedirect, safeFilename } = require('../src/lib/downloads.ts');
const { MATERIAL_COLUMNS } = require('../src/lib/material-columns.ts');

const item = '00000000-0000-4000-8000-000000000001';
const owner = '00000000-0000-4000-8000-000000000002';
const other = '00000000-0000-4000-8000-000000000003';
const now = Date.parse('2026-11-08T12:00:00Z');
const user = { id: owner, email: 'test@example.invalid' };
const material = { id: item, school: '한글학교', exam_year: 2026, grade: 1, semester: 2, exam_type: '중간고사', content_type: '문제+해설', file_type: 'HWP', file_path: 'private/source.hwpx' };
const paid = { user_id: owner, item_id: item, created_at: new Date(now - 86400_000).toISOString(), payment_id: 'paid-test', price_paid: 2000 };

function backend({ purchases = [paid], legacy = [], row = material, failure = null, history = [{ user_id: owner, payment_id: paid.payment_id, status: 'PAID' }], orders = [] } = {}) {
    const calls = [];
    const sb = createClient('http://storage.local.invalid', 'local-only-key', {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { fetch: async (input, init) => {
            const url = new URL(input); calls.push({ url, method: init?.method, body: init?.body });
            const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
            if (url.pathname.startsWith('/storage/v1/object/sign/')) return failure === 'sign' ? json({ message: 'private path must not be shown' }, 500) : json({ signedURL: '/object/sign/exam-materials/private/source.hwpx?token=test' });
            const table = url.pathname.split('/').pop();
            if (table === failure) return json({ message: 'database error' }, 500);
            let rows = table === 'purchased_items' ? purchases : table === 'purchases' ? legacy : table === 'payment_history' ? history : table === 'payment_orders' ? orders : row ? [row] : [];
            for (const [key, value] of url.searchParams) if (value.startsWith('eq.')) rows = rows.filter(r => String(r[key]) === value.slice(3));
            return json(table === 'exam_materials' ? rows[0] || null : rows);
        } },
    });
    return { sb, calls };
}

test('unauthenticated download is denied before any data access', async () => {
    const { sb, calls } = backend();
    const r = await materialDownload(sb, null, item, now);
    assert.equal(r.status, 401); assert.match(await r.text(), /로그인 후/); assert.equal(calls.length, 0);
});

test('another member cannot download a purchase owned by someone else', async () => {
    const { sb, calls } = backend({ purchases: [{ ...paid, user_id: other }] });
    const r = await materialDownload(sb, user, item, now);
    assert.equal(r.status, 403); assert.match(await r.text(), /구매 내역이 없습니다/);
    assert.equal(calls.filter(c => c.url.pathname.includes('/storage/')).length, 0);
    for (const c of calls) assert.equal(c.url.searchParams.get('user_id'), 'eq.' + owner);
});

test('paid purchases expire exactly after 30 days; malformed/future timestamps fail closed', async () => {
    for (const date of [now - 30 * 86400_000, now - 31 * 86400_000, now + 1, NaN]) {
        const { sb } = backend({ purchases: [{ ...paid, created_at: Number.isFinite(date) ? new Date(date).toISOString() : 'invalid' }] });
        assert.equal((await materialDownload(sb, user, item, now)).status, 410);
    }
    assert.equal(purchaseIsCurrent({ created_at: new Date(now - 30 * 86400_000 + 1).toISOString() }, now), true);
});

test('typing grants never expire but still require ownership', async () => {
    const old = { ...paid, created_at: '2020-01-01T00:00:00Z', payment_id: 'typing-report-id', price_paid: 0 };
    assert.equal((await materialDownload(backend({ purchases: [old] }).sb, user, item, now)).status, 302);
    assert.equal((await materialDownload(backend({ purchases: [{ ...old, user_id: other }] }).sb, user, item, now)).status, 403);
});

test('new purchases and legacy point purchases both download with a 120-second signed attachment', async () => {
    for (const setup of [{}, { purchases: [], legacy: [{ user_id: owner, exam_id: item, created_at: paid.created_at }] }]) {
        const { sb, calls } = backend(setup);
        const r = await materialDownload(sb, user, item, now);
        assert.equal(r.status, 302);
        const filename = '한글학교_2026_1_2_중간고사_문제+해설.hwpx';
        const location = new URL(r.headers.get('location'));
        assert.equal(location.searchParams.get('download'), filename);
        assert.equal(location.searchParams.get('token'), 'test');
        assert.match(r.headers.get('content-disposition'), /^attachment; filename="download.hwpx"; filename\*=UTF-8''/);
        assert.equal(decodeURIComponent(r.headers.get('content-disposition').split("UTF-8''")[1]), filename);
        assert.equal(r.headers.get('cache-control'), 'private, no-store');
        const signing = calls.find(c => c.url.pathname.includes('/storage/'));
        assert.equal(JSON.parse(signing.body).expiresIn, 120);
    }
});

test('a current repurchase is accepted even if an older purchase expired', async () => {
    const { sb } = backend({ purchases: [{ ...paid, created_at: '2020-01-01' }, paid] });
    assert.equal((await materialDownload(sb, user, item, now)).status, 302);
});

test('administrator bypasses purchase/expiry checks; regular DB-source and raw-report downloads are refused', async () => {
    assert.equal((await materialDownload(backend({ purchases: [] }).sb, { ...user, email: 'mathofhy@naver.com' }, item, now)).status, 302);
    for (const extra of [{ file_type: 'DB' }, { content_type: '개인DB' }, { content_type: '원본제보' }]) {
        assert.equal((await materialDownload(backend({ row: { ...material, ...extra } }).sb, user, item, now)).status, 403);
    }
});

test('upstream and missing-file failures expose no private storage paths', async () => {
    for (const setup of [{ failure: 'purchased_items' }, { failure: 'purchases' }, { failure: 'sign' }, { row: null }]) {
        const r = await materialDownload(backend(setup).sb, user, item, now);
        assert.ok([404, 503].includes(r.status));
        const body = await r.text(); assert.doesNotMatch(body, /private\/source|database error|token=/);
    }
});

test('filenames preserve Korean and query punctuation without response-header injection', () => {
    const name = '한글+해설&#\r\n"/문제.hwpx';
    const response = downloadRedirect('https://storage.invalid/file?token=test', name);
    assert.equal(new URL(response.headers.get('location')).searchParams.get('download'), safeFilename(name));
    assert.doesNotMatch(response.headers.get('content-disposition'), /[\r\n]/);
    assert.ok(safeFilename('가'.repeat(300) + '.hwpx').endsWith('.hwpx'));
});

test('lockdown migration denies table/path/view leakage, browser storage reads/writes, and keeps public metadata and owner exams', async () => {
    const db = new PGlite();
    try {
        await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
            CREATE SCHEMA auth; CREATE SCHEMA storage;
            CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
            CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS $$ SELECT jsonb_build_object('email',current_setting('request.jwt.claim.email',true)) $$;
            CREATE FUNCTION storage.foldername(text) RETURNS text[] LANGUAGE sql AS $$ SELECT string_to_array($1,'/') $$;
            GRANT USAGE ON SCHEMA public,storage,auth TO anon,authenticated,service_role;
            CREATE TABLE storage.buckets(id text primary key,name text,public boolean);
            CREATE TABLE storage.objects(id int,bucket_id text,name text);
            CREATE TABLE public.exam_materials(id uuid primary key,title text,file_path text,description text,uploader_id uuid);
            ALTER TABLE public.exam_materials ENABLE ROW LEVEL SECURITY;
            CREATE POLICY metadata ON public.exam_materials FOR SELECT USING (true);
            CREATE POLICY insert_own ON public.exam_materials FOR INSERT WITH CHECK (auth.uid()=uploader_id);
            CREATE POLICY update_own ON public.exam_materials FOR UPDATE USING (auth.uid()=uploader_id);
            CREATE VIEW public.leaky_materials AS SELECT file_path,description FROM public.exam_materials;
            GRANT ALL ON public.exam_materials TO anon,authenticated;
            GRANT SELECT ON public.leaky_materials TO anon,authenticated;
            GRANT SELECT(file_path,description) ON public.exam_materials TO anon,authenticated;
            GRANT ALL ON storage.objects TO anon,authenticated,service_role;
            ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
            CREATE POLICY broad ON storage.objects FOR ALL USING (true) WITH CHECK (true);
            CREATE POLICY "Authenticated users can select" ON storage.objects FOR SELECT USING (bucket_id='exam-materials');
            CREATE POLICY "Authenticated users can upload" ON storage.objects FOR INSERT WITH CHECK (bucket_id='exam-materials');
            INSERT INTO storage.buckets VALUES ('hwpx','hwpx',true),('exam-materials','exam-materials',true),('mock-materials','mock-materials',true),('pdf-jobs','pdf-jobs',true),('exams','exams',true);
            INSERT INTO public.exam_materials VALUES ('${item}','Title','secret.hwp','{"files":["secret.hwp"]}','${owner}');
            INSERT INTO storage.objects VALUES (1,'exam-materials','secret.hwp'),(2,'mock-materials','mock.hwp'),(3,'pdf-jobs','job.pdf'),(4,'exams','${owner}/own.hml'),(5,'exams','${other}/other.hml'),(6,'hwpx','auto_captures/public.webp');`);
        const migration = fs.readFileSync(path.join(__dirname, '../supabase/migrations/20261108_storage_lockdown.sql'), 'utf8');
        await db.exec(migration);
        await db.exec(migration); // repeatable policy/column/bucket changes
        assert.equal((await db.query("SELECT public FROM storage.buckets WHERE id='hwpx'")).rows[0].public, true);
        assert.equal((await db.query("SELECT count(*)::int n FROM storage.buckets WHERE id<>'hwpx' AND public")).rows[0].n, 0);
        for (const role of ['anon','authenticated']) {
            await db.exec(`SET ROLE ${role}; SET request.jwt.claim.sub='${role === 'anon' ? '' : owner}';`);
            assert.deepEqual((await db.query('SELECT id,title FROM public.exam_materials')).rows, [{ id: item, title: 'Title' }]);
            for (const sql of ['SELECT file_path FROM exam_materials','SELECT description FROM exam_materials','SELECT * FROM exam_materials','SELECT * FROM leaky_materials']) await assert.rejects(db.query(sql), /permission denied/);
            assert.deepEqual((await db.query('SELECT id FROM storage.objects ORDER BY id')).rows, role === 'anon' ? [{ id: 6 }] : [{ id: 4 }, { id: 6 }]);
            for (const bucket of ['exam-materials','mock-materials','hwpx-originals','pdf-jobs']) await assert.rejects(db.query('INSERT INTO storage.objects VALUES (10,$1,$2)', [bucket, 'evil.hwp']), /row-level security/);
            assert.deepEqual((await db.query("UPDATE storage.objects SET name='bad' WHERE bucket_id='exam-materials' RETURNING id")).rows, []);
            await assert.rejects(db.query("INSERT INTO storage.objects VALUES (10,'exams',$1)", [other + '/stolen.hml']), /row-level security/);
            await db.exec('RESET ROLE;');
        }
        await db.exec(`SET ROLE authenticated; SET request.jwt.claim.sub='${owner}';`);
        await assert.rejects(db.query('INSERT INTO exam_materials VALUES ($1,$2,$3,NULL,$4)', [other, 'evil', other + '/stolen.hwp', owner]), /row-level security/);
        // All member INSERT/UPDATEs are denied, even canonical owned keys.
        await assert.rejects(db.query('INSERT INTO exam_materials VALUES ($1,$2,$3,NULL,$4)', [other, 'signed upload', owner + '/uploaded.hwp', owner]), /row-level security/);
        assert.deepEqual((await db.query('UPDATE exam_materials SET title=$1 WHERE id=$2 RETURNING id', ['tampered', item])).rows, []);
        const { storageKey } = require('../src/lib/storage-key.ts');
        for (const key of [owner + '/uploaded.hwp', 'raw_uploads/file.hwpx', '한글 폴더/[자료](1)+2.pdf', owner+'/../../hwpx-originals/file.hml', owner+'/%2e%2e/secret', owner+'/%252e%252e/secret', '/secret.hml', 'hwpx-originals/raw_uploads/x.hml', owner+'\\..\\evil.hwp', owner+'//x.hwp', owner+'/./x.hwp', owner+'/x?.hwp', owner+'/x#.hwp', owner+'/ x.hwp']) {
            assert.equal((await db.query('SELECT public.safe_storage_key($1) ok', [key])).rows[0].ok, storageKey(key) !== null, key);
        }
        await db.exec("SET request.jwt.claim.email='mathofhy@naver.com';");
        await db.query('INSERT INTO exam_materials VALUES ($1,$2,$3,NULL,$4)', [other, 'admin upload', owner+'/uploaded.hwp', owner]);
        for (const key of [owner+'/../../hwpx-originals/secret.hml', owner+'/%2e%2e/secret', owner+'\\..\\evil.hwp', '/secret.hml', 'exam-materials/'+owner+'/x.hwp']) {
            await assert.rejects(db.query('UPDATE exam_materials SET file_path=$1 WHERE id=$2', [key, other]), /row-level security/);
        }
        await db.exec('RESET ROLE; SET ROLE service_role;');
        assert.equal((await db.query('SELECT file_path FROM exam_materials')).rows[0].file_path, 'secret.hwp');
        assert.equal((await db.query('SELECT count(*)::int n FROM storage.objects')).rows[0].n, 6);
    } finally { await db.close(); }
});

test('public query columns omit private paths and descriptions', () => {
    assert.doesNotMatch(MATERIAL_COLUMNS, /file_path|description|\*/);

});

test('signed upload transport uses the token endpoint without a normal objects INSERT request', async () => {
    const calls = [];
    const sb = createClient('http://storage.local.invalid','local-anon', {
        auth: { persistSession: false },
        global: { fetch: async (url, init) => {
            calls.push({ url: new URL(url), method: init.method });
            return new Response(JSON.stringify({ Key: 'exam-materials/user/test.pdf' }), { headers: { 'Content-Type': 'application/json' } });
        } },
    });
    const { error } = await sb.storage.from('exam-materials').uploadToSignedUrl('user/test.pdf', 'server-issued-token', new Blob(['local-test']), { contentType: 'application/pdf' });
    assert.equal(error, null); assert.equal(calls.length, 1);
    assert.equal(calls[0].url.pathname, '/storage/v1/object/upload/sign/exam-materials/user/test.pdf');
    assert.equal(calls[0].url.searchParams.get('token'), 'server-issued-token');
    assert.equal(calls[0].method, 'PUT');
});

test('original split tool defaults to read-only, copies with verification and refuses pruning corrupt copies', async () => {
    const vm = require('node:vm');
    const source = fs.readFileSync(path.join(__dirname,'../scripts/split-hwpx-originals.cjs'),'utf8');
    async function run(mode, corrupt = false) {
        const events = [];
        const originals = new Map([['raw_uploads/first.hml', Buffer.from('first')],['raw_uploads/second.hwpx',Buffer.from('second')]]);
        const copies = new Map(mode === '--prune' ? [...originals].map(([key,value]) => [key, corrupt && key.includes('second') ? Buffer.from('corrupt') : value]) : []);
        const client = { storage: {
            getBucket: async () => ({ data: { public: false } }),
            from: name => ({
                list: async () => ({ data: [...originals.keys()].map(key => ({ id: key, name: key.split('/').pop() })) }),
                download: async key => { events.push(`read:${name}:${key}`); return { data: new Blob([(name === 'hwpx' ? originals : copies).get(key)]) }; },
                upload: async (key, bytes) => { events.push('copy:' + key); copies.set(key, bytes); return {}; },
                remove: async ([key]) => { events.push('remove:' + key); originals.delete(key); return {}; },
            }),
        } };
        const process = { argv: ['node','script',...(mode ? [mode] : [])], env: { NEXT_PUBLIC_SUPABASE_URL:'local',SUPABASE_SERVICE_ROLE_KEY:'local' },exitCode:0 };
        await vm.runInNewContext(source, {
            require: name => name === '@supabase/supabase-js' ? { createClient: () => client } : name === 'dotenv' ? { config(){} } : require(name),
            process, Buffer, console: { log(){}, error(){} },
        });
        return { events, originals, copies, process };
    }
    const audit = await run(); assert.equal(audit.events.length,0); assert.equal(audit.originals.size,2);
    const copy = await run('--copy'); assert.equal(copy.copies.size,2); assert.equal(copy.originals.size,2); assert.equal(copy.process.exitCode,0);
    const prune = await run('--prune'); assert.equal(prune.originals.size,0); assert.equal(prune.copies.size,2);
    assert.ok(prune.events.indexOf('read:hwpx-originals:raw_uploads/second.hwpx') < prune.events.indexOf('remove:raw_uploads/first.hml'));
    const corrupt = await run('--prune',true); assert.equal(corrupt.process.exitCode,1); assert.equal(corrupt.originals.size,2); assert.ok(!corrupt.events.some(e => e.startsWith('remove:')));
});


test('canonical storage keys reject SDK traversal before signing, including for admins', async () => {
    const { storageKey } = require('../src/lib/storage-key.ts');
    const bad = ['../other.hwp', owner+'/../../hwpx-originals/secret.hml', owner+'/\\..\\secret.hwp', owner+'/%2e%2e/x.hwp', owner+'/%252e%252e/x.hwp', '/'+owner+'/x.hwp', 'exam-materials/'+owner+'/x.hwp', 'HWPX-ORIGINALS/raw_uploads/x.hml', owner+'//x.hwp', owner+'/x?.hwp', owner+'/x#.hwp', owner+'/x:hwp', owner+'/./x.hwp'];
    for (const key of bad) {
        assert.equal(storageKey(key), null, key);
        for (const who of [user, { ...user, email: 'mathofhy@naver.com' }]) {
            const { sb, calls } = backend({ row: { ...material, file_path: key } });
            assert.equal((await materialDownload(sb, who, item, now)).status, 400, key);
            assert.equal(calls.filter(c => c.url.pathname.startsWith('/storage/')).length, 0);
        }
    }
});

test('cancelled/refunded/unknown payments fail closed and cannot fall back to a legacy row', async () => {
    for (const status of ['CANCELLED', 'REFUNDED', 'PARTIAL_CANCELLED', 'FAILED', 'READY', null]) {
        const { sb, calls } = backend({ history: [{ user_id: owner, payment_id: paid.payment_id, status }], legacy: [{ user_id: owner, exam_id: item, created_at: paid.created_at }] });
        assert.equal((await materialDownload(sb, user, item, now)).status, 403, status);
        assert.equal(calls.filter(c => c.url.pathname.startsWith('/storage/')).length, 0);
    }
    for (const setup of [{ history: [] }, { failure: 'payment_history' }, { failure: 'payment_orders' }]) {
        assert.ok([403,503].includes((await materialDownload(backend(setup).sb, user, item, now)).status));
    }
    const payment = { ...paid, payment_id: 'order-local' };
    const history = [{ user_id: owner, payment_id: payment.payment_id, status: 'PAID' }];
    for (const status of ['pending','cancelled',null,'completed']) {
        const orders = [{ user_id: owner, payment_id: payment.payment_id, status }];
        assert.equal((await materialDownload(backend({ purchases: [payment], history, orders }).sb,user,item,now)).status, status==='completed'?302:403);
    }
    assert.equal((await materialDownload(backend({ purchases: [payment], history, orders: [] }).sb,user,item,now)).status,403);
    assert.equal((await materialDownload(backend({ purchases: [{ ...paid, payment_id: 'typing-test', price_paid: 20 }] }).sb,user,item,now)).status,403);
});

test('a separately paid repurchase survives an old cancelled payment; status checks are owner scoped', async () => {
    const purchases = [{ ...paid, payment_id: 'old-payment' }, paid];
    const history = [{ user_id: owner, payment_id: 'old-payment', status: 'CANCELLED' },{ user_id: owner, payment_id: paid.payment_id, status: 'PAID' }];
    const { sb, calls } = backend({ purchases, history });
    assert.equal((await materialDownload(sb,user,item,now)).status,302);
    for (const c of calls.filter(c => /payment_history|payment_orders/.test(c.url.pathname))) assert.equal(c.url.searchParams.get('user_id'),'eq.'+owner);
});
