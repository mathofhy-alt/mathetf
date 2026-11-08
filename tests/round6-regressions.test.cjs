const { test } = require('node:test');
const a = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { spawn } = require('node:child_process');
const { createInterface } = require('node:readline');
const { PGlite } = require('@electric-sql/pglite');
const { applyMigration } = require('./migration-helper.cjs');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

// Run the actual Python one()/patch() functions. Translate only the PostgREST
// request syntax into bound SQL, so the production RPCs/triggers decide accounting.
async function runWorker(db, onUpload) {
    const child = spawn('python', [path.join(__dirname, 'pdf_worker_harness.py')], {
        cwd: root, env: { ...process.env, PYTHONIOENCODING: 'utf-8' }, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
    });
    const files = new Set(), requests = [];
    let stderr = '', result, failure;
    child.stderr.on('data', data => { stderr += data; });
    const lines = createInterface({ input: child.stdout });
    const handle = async request => {
        if ('result' in request) { result = request.result; return; }
        requests.push(request);
        const { method, path: url, body, headers } = request;
        let data;
        if (url.startsWith('/rest/v1/pdf_jobs')) {
            const params = new URL(url, 'https://test.invalid').searchParams;
            if (method === 'GET') {
                a.equal(params.get('select'), 'id,stamp');
                data = (await db.query("select id,stamp from pdf_jobs where status='pending' order by created_at limit 1")).rows;
            } else {
                a.equal(method, 'PATCH');
                a.equal(headers.Prefer, 'return=representation');
                const values = [], sets = [], where = [];
                for (const [column, value] of Object.entries(body)) {
                    a(['status', 'started_at', 'worker', 'done_at', 'pages', 'sec', 'error'].includes(column));
                    values.push(value === 'now' ? new Date().toISOString() : value);
                    sets.push(`${column}=$${values.length}`);
                }
                for (const [column, filter] of params) {
                    a(['id', 'status', 'worker', 'started_at'].includes(column));
                    a(filter.startsWith('eq.'));
                    values.push(filter.slice(3));
                    where.push(`${column}=$${values.length}`);
                }
                data = (await db.query(`update pdf_jobs set ${sets.join(',')} where ${where.join(' and ')} returning *`, values)).rows;
            }
        } else if (method === 'GET') {
            data = null; // Python harness supplies HML bytes.
        } else if (method === 'POST') {
            files.add(url.split('/').pop());
            await onUpload();
            data = {};
        } else {
            a.equal(method, 'DELETE');
            for (const file of body.prefixes) files.delete(file);
            data = {};
        }
        child.stdin.write(JSON.stringify({ data }) + '\n');
    };
    let pending = Promise.resolve();
    lines.on('line', line => {
        pending = pending.then(() => handle(JSON.parse(line))).catch(error => {
            failure = error;
            child.kill();
        });
    });
    await new Promise((resolve, reject) => {
        child.on('error', reject);
        child.on('close', (code) => code === 0 || failure ? resolve() : reject(new Error(stderr || `Python exit ${code}`)));
    });
    await pending;
    if (failure) throw failure;
    a.equal(result, true);
    return { files, requests };
}

test('HWP refund during real worker conversion cannot revive a once charge after retry (PGlite, no network)', { timeout: 60000 }, async t => {
    const db = new PGlite();
    t.after(() => db.close());
    await db.exec(`create role anon;create role authenticated;create role service_role;
      create table profiles(id uuid primary key);
      create table folders(id uuid primary key,user_id uuid);
      create table user_items(id uuid primary key default gen_random_uuid(),user_id uuid,folder_id uuid,type text,name text,reference_id uuid,details jsonb,created_at timestamptz default now());
      create table question_bank_events(event text,event_id uuid,source text,session_id uuid,user_id uuid,exam_id uuid,question_count int);
      create table feature_usage(id uuid primary key default gen_random_uuid(),user_id uuid,user_email text,feature text,title text,question_count int,created_at timestamptz default now());
      create table qb_usage(id uuid primary key default gen_random_uuid(),user_id uuid,exam_id uuid,created_at timestamptz default now());
      create table purchased_items(id uuid primary key default gen_random_uuid(),user_id uuid,item_type text,item_id text,created_at timestamptz default now());`);
    await db.exec(read('supabase/migrations/20261025_pdf_jobs.sql'));
    await applyMigration(db, read('supabase/migrations/20261008_saved_exam_limit.sql'));
    await applyMigration(db, read('supabase/migrations/20261108_plans_final.sql'));
    const user = randomUUID(), ids = [randomUUID()], hash = randomUUID(), receipt = randomUUID();
    await db.query("insert into bundle_selections(id,user_id,kind,question_ids) values ($1,$2,'print',$3)", [receipt, user, ids]);
    const buy = () => db.query("insert into purchased_items(user_id,item_type) values ($1,'QB_ONCE')", [user]);
    const request = async (setHash = hash) => (await db.query(`select create_plan_bundle($1,$2,null,'print','test',$3,$4,'once',true,array['plan_once_bundle'],1,null,$5) job`,
        [randomUUID(), user, ids, setHash, receipt])).rows[0].job;
    const used = async () => (await db.query(`select count(*)::int n from plan_usage u where u.user_id=$1 and u.feature='plan_once_bundle'
      and not exists(select 1 from pdf_jobs f where f.id::text=u.title and f.user_id=$1 and f.status='error' and not f.hwp_ready and not f.pdf_delivered)`, [user])).rows[0].n;
    await db.query("insert into feature_usage(user_id,feature) values ($1,'plan_free_bundle'),($1,'plan_free_bundle')", [user]);
    await buy();
    const original = await request();
    let retry;
    const { files, requests } = await runWorker(db, async () => {
        a.equal((await db.query('select status from pdf_jobs where id=$1', [original.id])).rows[0].status, 'working');
        await db.query('select fail_bundle_hwp($1,$2)', [user, original.id]);
        a.equal(await used(), 0);
        retry = await request();
        a.notEqual(retry.id, original.id);
        await db.query("update pdf_jobs set status='done' where id=$1", [retry.id]);
        a.equal(await used(), 1);
    });
    const old = (await db.query('select * from pdf_jobs where id=$1', [original.id])).rows[0];
    t.diagnostic(`late A: status=${old.status}, pdf_delivered=${old.pdf_delivered}, active once uses=${await used()}`);
    a.equal(old.status, 'error');
    a.equal(old.pdf_delivered, false);
    a.equal(old.hwp_ready, false);
    a.equal(await used(), 1);
    a.deepEqual([...files], []);
    const completion = requests.find(r => r.method === 'PATCH' && r.body.status === 'done');
    const filters = new URL(completion.path, 'https://test.invalid').searchParams;
    a.equal(filters.get('status'), 'eq.working');
    a.equal(filters.get('worker'), 'eq.test-worker');
    a(filters.get('started_at').startsWith('eq.'));
    a.equal((await request()).id, retry.id); // Same set remains a free re-download.
    await a.rejects(request(randomUUID()), /PLAN_LIMIT/);
    await buy(); // A second purchase must grant a usable ticket, not cover old A again.
    const nextReceipt = randomUUID();
    await db.query("insert into bundle_selections(id,user_id,kind,question_ids) values ($1,$2,'print',$3)", [nextReceipt, user, ids]);
    const fresh = (await db.query(`select create_plan_bundle($1,$2,null,'print','new set',$3,$4,'once',true,array['plan_once_bundle'],2,null,$5) job`,
        [randomUUID(), user, ids, randomUUID(), nextReceipt])).rows[0].job;
    a.equal(fresh.plan_charge, 'once');
    a.equal(await used(), 2);
    // Reverse ordering: completion wins, so a later HWP failure cannot refund a delivered PDF.
    const completed = await runWorker(db, async () => {});
    a.deepEqual([...completed.files], [fresh.id + '.pdf']);
    await db.query('select fail_bundle_hwp($1,$2)', [user, fresh.id]);
    const delivered = (await db.query('select status,pdf_delivered from pdf_jobs where id=$1', [fresh.id])).rows[0];
    a.deepEqual(delivered, { status: 'done', pdf_delivered: true });
    a.equal(await used(), 2);
});
