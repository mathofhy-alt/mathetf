const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { PGlite } = require('@electric-sql/pglite');
const { applyMigration } = require('./migration-helper.cjs');
const migration = name => fs.readFileSync(path.join(__dirname, '../supabase/migrations', name), 'utf8');

test('release: plans then storage A/B preserve sheet/print server access and deny browser originals', async t => {
    const db = new PGlite();
    t.after(() => db.close());
    await db.exec(`
        create role anon; create role authenticated; create role service_role bypassrls;
        create schema auth; create schema storage;
        create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
        create function auth.jwt() returns jsonb language sql as $$ select jsonb_build_object('email',current_setting('request.jwt.claim.email',true)) $$;
        create function storage.foldername(text) returns text[] language sql as $$ select string_to_array($1,'/') $$;
        grant usage on schema public,auth,storage to anon,authenticated,service_role;
        create table profiles(id uuid primary key);
        create table folders(id uuid primary key,user_id uuid);
        create table user_items(id uuid primary key default gen_random_uuid(),user_id uuid,folder_id uuid,type text,name text,reference_id uuid,details jsonb,created_at timestamptz default now());
        create table question_bank_events(event text,event_id uuid,source text,session_id uuid,user_id uuid,exam_id uuid,question_count int);
        create table feature_usage(id uuid primary key default gen_random_uuid(),user_id uuid,user_email text,feature text,title text,question_count int,created_at timestamptz default now());
        create table pdf_jobs(id uuid primary key,user_id uuid,kind text,title text,stamp boolean,status text default 'pending',created_at timestamptz default now());
        create table qb_usage(id uuid primary key default gen_random_uuid(),user_id uuid,exam_id uuid,created_at timestamptz default now());
        create table purchased_items(id uuid primary key default gen_random_uuid(),user_id uuid,item_type text,item_id text,created_at timestamptz default now());
        create table storage.buckets(id text primary key,name text,public boolean);
        create table storage.objects(bucket_id text,name text,created_at timestamptz default now(),updated_at timestamptz default now());
        create table exam_materials(id uuid primary key,title text,file_path text,description text,uploader_id uuid);
        grant all on all tables in schema public,storage to service_role;
        grant all on storage.objects to anon,authenticated;
        grant select on exam_materials to anon,authenticated;
        alter table storage.objects enable row level security;
        create policy broad on storage.objects for all using (true) with check (true);
        insert into storage.buckets select name,name,true from unnest(array['exams','pdf-jobs','exam-materials','hwpx']) name;
    `);
    await applyMigration(db, migration('20261008_saved_exam_limit.sql'));
    await db.exec(migration('20261008_lock_exams_bucket.sql'));
    await applyMigration(db, migration('20261108_plans_final.sql'));
    const functionDefinitions = async () => (await db.query(`
        select p.oid::regprocedure::text signature, pg_get_functiondef(p.oid) definition, p.proacl::text acl
        from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
        and p.proname in ('save_plan_exam_item','create_plan_bundle','create_exam_pdf_job',
            'backfill_exam_save_proofs','legacy_exam_file_unchanged','claim_bundle_hwp','fail_bundle_hwp')
        order by signature
    `)).rows;
    const before = await functionDefinitions();
    const lockdown = migration('20261108_storage_lockdown.sql');
    const marker = '-- ===== B: 반드시 새 코드 배포 후 실행 =====';
    const [partA, partB] = lockdown.split(marker);
    assert.ok(partA && partB);
    await db.exec(partA);
    await db.exec(partB);
    await db.exec(partB); // policy reapplication must preserve the plan RPCs too
    assert.deepEqual(await functionDefinitions(), before);

    const owner = randomUUID(), reference = randomUUID();
    const locked = `locked/${owner}/${reference}.hml`;
    await db.query('insert into profiles values ($1)', [owner]);
    await db.query("insert into purchased_items(user_id,item_type) values ($1,'QB_SHEET'),($1,'QB_ONCE')", [owner]);
    await db.query("insert into feature_usage(user_id,feature) values ($1,'plan_free_exam'),($1,'plan_free_exam')", [owner]);
    await db.exec('set role service_role');
    const saved = (await db.query(`select save_plan_exam_item($1,null,'1장권 시험지',$2,$3,null,false,50,'sheet',null,999,now()) item`,
        [owner, reference, { question_count: 1, hml_path: locked }])).rows[0].item;
    assert.equal(saved.details.plan, 'sheet');
    assert.equal((await db.query('select hml_path from exam_save_proofs where item_id=$1', [saved.id])).rows[0].hml_path, locked);
    const receipt = randomUUID(), question = randomUUID();
    await db.query("insert into bundle_selections(id,user_id,kind,question_ids) values ($1,$2,'print',$3)", [receipt, owner, [question]]);
    const print = (await db.query(`select create_plan_bundle($1,$2,null,'print','프린트',$3,$4,'once',true,array[]::text[],999,now(),$5) job`,
        [randomUUID(), owner, [question], randomUUID(), receipt])).rows[0].job;
    assert.equal(print.plan_charge, 'once');
    const examPdf = (await db.query("select create_exam_pdf_job($1,$2,$3,'시험지 PDF') job", [randomUUID(), owner, saved.id])).rows[0].job;
    assert.equal(examPdf.kind, 'exam');
    for (const [bucket, name] of [['exams', locked], ['exams', `${owner}/${reference}.hml`], ['pdf-jobs', `${print.id}.pdf`], ['exam-materials', `${owner}/sale.hwp`]]) {
        await db.query('insert into storage.objects(bucket_id,name) values ($1,$2)', [bucket, name]);
    }
    assert.equal((await db.query('select count(*)::int n from storage.objects')).rows[0].n, 4);
    await db.query('insert into exam_materials values ($1,$2,$3,$4,$5)', [randomUUID(), '공개 제목', `${owner}/sale.hwp`, 'private', owner]);
    await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${owner}'`);
    assert.deepEqual((await db.query('select name from storage.objects')).rows, [{ name: `${owner}/${reference}.hml` }]);
    assert.equal((await db.query('select title from exam_materials')).rows[0].title, '공개 제목');
    for (const column of ['file_path', 'description', '*']) await assert.rejects(db.query(`select ${column} from exam_materials`), /permission denied/);
    await assert.rejects(db.query('select * from exam_save_proofs'), /permission denied/);
    await assert.rejects(db.query("insert into storage.objects(bucket_id,name) values ('exams',$1)", [locked]), /row-level security/);
    await db.exec('reset role');
    assert.equal((await db.query("select count(*)::int n from feature_usage where user_id=$1 and feature='plan_sheet_exam'", [owner])).rows[0].n, 1);
    assert.equal((await db.query("select count(*)::int n from feature_usage where user_id=$1 and feature='plan_once_bundle'", [owner])).rows[0].n, 1);
});
