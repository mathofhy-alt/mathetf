const {applyMigration}=require('./migration-helper.cjs');
const { test } = require('node:test');
const a = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { PGlite } = require('@electric-sql/pglite');

test('deployment artifact defines only the final save RPC; both triggers are atomic and concurrent indexes are separate requests',()=>{
    const {migrationRequests}=require('./migration-helper.cjs');
    const dir=path.join(__dirname,'../supabase/migrations');
    const sql=fs.readFileSync(path.join(dir,'20261108_plans_final.sql'),'utf8');
    a.equal(fs.existsSync(path.join(dir,'20261108_plan_print_keep.sql')),false);
    a.equal(fs.existsSync(path.join(dir,'20261108_qb_sheet.sql')),false);
    const requests=migrationRequests(sql);
    a.deepEqual(requests.map(r=>r.name),['CORE','INDEX_1','INDEX_2','INDEX_3','INDEX_4']);
    const core=requests[0].query;
    a.equal((sql.match(/create or replace function public.save_plan_exam_item\(/g)||[]).length,1);
    a.match(core,/begin;\s*set local lock_timeout = '3s';/);
    a.match(core,/commit;\s*$/);a.doesNotMatch(core,/index concurrently/i);
    a.equal((core.match(/(?:drop|create) trigger /g)||[]).length,4);
    a.equal((core.match(/^commit;/gm)||[]).length,1);
    for(const {query} of requests.slice(1)) {
        a.match(query.trim(),/^create (?:unique )?index concurrently[^;]+;$/i);
        a.doesNotMatch(query,/\bbegin\b|\bcommit\b/i);
    }
});

test('bundle migration and atomic RPC on isolated PostgreSQL (no network)', async t => {
    const db = new PGlite();
    t.after(() => db.close());
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create table pdf_jobs(id uuid primary key, user_id uuid not null, kind text, title text, stamp boolean default true,
        status text default 'pending', created_at timestamptz default now());
      create table feature_usage(id uuid primary key default gen_random_uuid(), user_id uuid, user_email text,
        feature text, title text, question_count int, created_at timestamptz default now());
      create table profiles(id uuid primary key);
      create table qb_usage(id uuid primary key default gen_random_uuid(),user_id uuid,exam_id uuid,created_at timestamptz default now());
      create table purchased_items(id uuid primary key default gen_random_uuid(),user_id uuid,item_type text,item_id text,created_at timestamptz default now());
      create table folders(id uuid primary key, user_id uuid);
      create table user_items(id uuid primary key default gen_random_uuid(), user_id uuid, folder_id uuid, type text, name text, reference_id uuid, details jsonb, created_at timestamptz default now());
      create table question_bank_events(event text,event_id uuid,source text,session_id uuid,user_id uuid,exam_id uuid,question_count int);`);
    await db.exec(fs.readFileSync(path.join(__dirname, '../supabase/migrations/20261008_saved_exam_limit.sql'), 'utf8'));
    const migration = fs.readFileSync(path.join(__dirname, '../supabase/migrations/20261108_plans_final.sql'), 'utf8');
    const core=require('./migration-helper.cjs').migrationRequests(migration)[0].query;
    await a.rejects(db.exec(core.replace(/commit;\s*$/, 'select 1/0;\ncommit;')),/division by zero/);
    await db.exec('rollback');
    a.equal((await db.query("select count(*)::int n from information_schema.columns where table_name='pdf_jobs' and column_name='retain_until'")).rows[0].n,0);
    a.equal((await db.query("select to_regprocedure('public.save_plan_exam_item(uuid,uuid,text,uuid,jsonb,uuid,boolean,integer,text,text,integer,timestamptz)') f")).rows[0].f,null);
    await applyMigration(db,migration);
    await applyMigration(db,migration); // deploy/retry must be safe
    const member = randomUUID(), question = randomUUID();
    const provisioned = new Map();
    const buy = (user,type) => db.query('insert into purchased_items(user_id,item_type) values ($1,$2)',[user,type]);
    async function request(overrides = {}) {
        const o = { id: randomUUID(), user: member, kind: 'print', hash: 'set-a', charge: 'once', hwp: false, features: ['plan_once_bundle'], limit: 1, since: null, ...overrides };
        // 최초 요청 전에 실제 구매·사용 fixture를 만든다. p_limit만으로 이용권을 만들지 않는다.
        if(o.kind==='print' && !provisioned.has(o.user)) {
            provisioned.set(o.user,(async()=>{
            if(o.charge==='once'||o.charge==='exam') {
                for(let i=0;i<2;i++)await db.query("insert into feature_usage(user_id,feature) values ($1,'plan_free_bundle')",[o.user]);
                await buy(o.user,o.charge==='once'?'QB_ONCE':'QB_EXAM');
                if(o.charge==='exam')for(let i=0;i<10-o.limit;i++)await db.query("insert into feature_usage(user_id,feature) values ($1,'plan_exam_bundle')",[o.user]);
            }
            })());
        }
        await provisioned.get(o.user);
        const receipt = randomUUID();
        await db.query('insert into bundle_selections(id,user_id,kind,question_ids) values ($1,$2,$3,$4)',[receipt,o.user,o.kind,[question]]);
        const r = await db.query(`select create_plan_bundle($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) as job`,
            [o.id, o.user, 'test@example.com', o.kind, '프린트', [question], o.hash, o.charge, o.hwp, o.features, o.limit, o.since, receipt]);
        return r.rows[0].job;
    }
    const count = async () => (await db.query('select count(*)::int as n from feature_usage where title is not null')).rows[0].n;
    await t.test('PDF then HWP then PDF uses one job and one credit', async () => {
        const first = await request();
        const hwp = await request({ hwp: true });
        a.equal(first.id, hwp.id); a.equal(hwp.hwp_ready, false);
        const confirmed=await db.query('select claim_bundle_hwp($1,$2) as job',[member,first.id]);
        a.equal(confirmed.rows[0].job.hwp_ready,true);
        a.match(first.receipt_id,/^[0-9a-f-]{36}$/);
        a.equal((await request()).id, first.id); a.equal(await count(), 1);
        a.equal(Date.parse(first.retain_until) - Date.parse(first.created_at), 30 * 86400000);
    });
    await t.test('stale remaining-count snapshot cannot spend a second credit', async () => {
        await a.rejects(request({ hash: 'set-b' }), /PLAN_LIMIT/); a.equal(await count(), 1);
    });
    await t.test('instructor reservation skips an old free job under the lock and creates a logo-free job without usage',async()=>{
        const user=randomUUID(),before=await count();
        const free=await request({user,charge:'free',features:['plan_free_bundle'],limit:2});
        const teacher=await request({user,charge:'teacher',features:[],limit:0});
        a.notEqual(teacher.id,free.id);a.equal(teacher.stamp,false);a.equal(teacher.plan_charge,'teacher');
        a.equal((await request({user,charge:'teacher',features:[],limit:0})).id,teacher.id);
        a.equal(await count(),before+1);
        // Keep the shared fixture's absolute usage assertions independent of this regression.
        await db.query('delete from feature_usage where user_id=$1',[user]);
    });
    await t.test('HWP reservation is not delivery; preparation failure refunds, confirmed HWP or PDF survives later failures',async()=>{
        for(const mode of ['unprovided','hwp','pdf']){
            const user=randomUUID();const job=await request({user,hwp:true});a.equal(job.hwp_ready,false);
            if(mode==='hwp')await db.query('select claim_bundle_hwp($1,$2)',[user,job.id]);
            if(mode==='pdf')await db.query("update pdf_jobs set status='done' where id=$1",[job.id]);
            await db.query('select fail_bundle_hwp($1,$2)',[user,job.id]);
            const stored=(await db.query('select * from pdf_jobs where id=$1',[job.id])).rows[0];
            if(mode==='unprovided'){
                a.equal(stored.status,'error');a.equal(stored.hwp_ready,false);
                await a.rejects(db.query('select claim_bundle_hwp($1,$2)',[user,job.id]),/BUNDLE_UNAVAILABLE/);
                a.notEqual((await request({user,hwp:true})).id,job.id);
            }else{
                a.equal(stored.hwp_ready,mode==='hwp');
                await a.rejects(request({user,hash:'another'}),/PLAN_LIMIT/);
            }
            await db.query('delete from feature_usage where user_id=$1',[user]);
        }
        for(const name of ['claim_bundle_hwp','fail_bundle_hwp'])
            a.equal((await db.query("select has_function_privilege('authenticated',$1,'execute') allowed",[`${name}(uuid,uuid)`])).rows[0].allowed,false);
    });
    await t.test('two submitted requests for the same new HWP set consume once', async () => {
        const user = randomUUID();
        const [one, two] = await Promise.all([request({ user, hwp: true }), request({ user, hwp: true })]);
        a.equal(one.id, two.id); a.equal(await count(), 2);
    });
    await t.test('HWP survives PDF conversion failure without refund and can reuse', async () => {
        const first = await request();
        await db.query("update pdf_jobs set status='error' where id=$1", [first.id]);
        a.equal((await request({ hwp: true })).id, first.id);
        await a.rejects(request({ hash: 'set-c' }), /PLAN_LIMIT/);
    });
    await t.test('PDF failure before HWP releases credit', async () => {
        const user = randomUUID();
        const failed = await request({ user });
        await db.query("update pdf_jobs set status='error' where id=$1", [failed.id]);
        const retried = await request({ user, hwp: true });
        a.notEqual(retried.id, failed.id);
    });
    await t.test('expired original remains unavailable but a valid receipt can spend a new credit on the same set', async () => {
        await db.query("update pdf_jobs set retain_until=now()-interval '1 second' where user_id=$1", [member]);
        const old=(await db.query('select id from pdf_jobs where user_id=$1',[member])).rows[0].id;
        await a.rejects(db.query('select claim_bundle_hwp($1,$2)',[member,old]),/BUNDLE_UNAVAILABLE/);
        await a.rejects(request({hwp:true}),/PLAN_LIMIT/);
        await buy(member,'QB_ONCE');
        const fresh=await request({ hwp: true, limit: 2 });
        a.notEqual(fresh.id,old);a.equal(fresh.plan_charge,'once');
        a.equal((await request({hwp:true,limit:2})).id,fresh.id);
        a.equal((await db.query("select count(*)::int n from feature_usage where user_id=$1 and feature='plan_once_bundle'",[member])).rows[0].n,2);
    });
    await t.test('new valid print receipts allow instructor jobs past expired once, exam and teacher jobs without charging',async()=>{
        const before=await count();
        for(const charge of ['once','exam','teacher'])for(const hwp of [false,true]){
            const user=randomUUID();
            const old=await request({user,charge,features:charge==='teacher'?[]:[`plan_${charge}_bundle`]});
            await db.query("update pdf_jobs set retain_until=now()-interval '1 second',status='done' where id=$1",[old.id]);
            const usage=(await db.query('select count(*)::int n from feature_usage where user_id=$1',[user])).rows[0].n;
            const fresh=await request({user,charge:'teacher',hwp,features:[],limit:0});
            a.notEqual(fresh.id,old.id);a.notEqual(fresh.receipt_id,old.receipt_id);
            a.equal(fresh.plan_charge,'teacher');a.equal(fresh.stamp,false);
            a.equal(Date.parse(fresh.retain_until)-Date.parse(fresh.created_at),30*86400000);
            a.equal((await request({user,charge:'teacher',hwp,features:[],limit:0})).id,fresh.id);
            a.equal((await db.query('select count(*)::int n from feature_usage where user_id=$1',[user])).rows[0].n,usage);
            await db.query('delete from feature_usage where user_id=$1',[user]);
        }
        a.equal(await count(),before);
    });
    await t.test('expired paid print with a new exam or once entitlement creates one new charged job and preserves old history',async()=>{
        for(const charge of ['once','exam']) {
            const user=randomUUID(),features=[`plan_${charge}_bundle`];
            const old=await request({user,charge,features});
            await db.query("update pdf_jobs set retain_until=now()-interval '1 second',status='done' where id=$1",[old.id]);
            await a.rejects(request({user,charge,features}),/PLAN_LIMIT/);
            await buy(user,charge==='once'?'QB_ONCE':'QB_EXAM');
            const fresh=await request({user,charge,features,limit:2});
            a.notEqual(fresh.id,old.id);a.notEqual(fresh.receipt_id,old.receipt_id);
            a.equal(fresh.plan_charge,charge);a.equal(Date.parse(fresh.retain_until)-Date.parse(fresh.created_at),30*86400000);
            a.equal((await request({user,charge,features,limit:2,hwp:true})).id,fresh.id);
            a.equal((await db.query('select count(*)::int n from pdf_jobs where user_id=$1',[user])).rows[0].n,2);
            a.equal((await db.query('select count(*)::int n from feature_usage where user_id=$1 and title is not null',[user])).rows[0].n,2);
            await db.query('delete from feature_usage where user_id=$1',[user]);
        }
    });
    await t.test('free sets never grant HWP; once is rejected for prediction', async () => {
        await a.rejects(request({ user: randomUUID(), charge: 'free', hwp: true }), /INVALID_BUNDLE/);
        await a.rejects(request({ user: randomUUID(), kind: 'predict' }), /INVALID_BUNDLE/);
    });
    await t.test('exam pass predictions have no counter, logo or effect on shared exam and print credits', async () => {
        const user = randomUUID();
        const before=await count();
        const print = await request({ user, charge: 'exam', features: ['plan_exam_bundle'] });
        const predict = await request({ user, charge: 'exam', kind: 'predict', features: [], limit:0 });
        a.notEqual(print.id, predict.id); a.equal(predict.retain_until, null);
        a.equal(predict.stamp,false);
        for(let i=0;i<12;i++) await request({user,charge:'exam',kind:'predict',hash:`predict-${i}`,features:[],limit:0});
        a.equal(await count(),before+1);
        await a.rejects(request({user,charge:'exam',kind:'predict',hwp:true}),/INVALID_BUNDLE/);
        a.notEqual((await request({ user: randomUUID() })).id, print.id);
    });
    await t.test('exam and print saves share the last pass credit in both request orders', async () => {
        const save = (user,charge='free') => db.query(`select save_plan_exam_item($1,null,'시험지',$2,'{"question_count":1}',null,false,20,$3,'test@example.com',10,null)`, [user,randomUUID(),charge]);
        const first = randomUUID(), second = randomUUID();
        for(const user of [first,second]) {
            await save(user);await save(user);
            await db.query("insert into purchased_items(user_id,item_type) values ($1,'QB_EXAM')",[user]);
            for(let i=0;i<9;i++)await db.query("insert into feature_usage(user_id,feature) values ($1,'plan_exam_bundle')",[user]);
            for(let i=0;i<2;i++)await db.query("insert into feature_usage(user_id,feature) values ($1,'plan_free_bundle')",[user]);
            provisioned.set(user,Promise.resolve());
        }
        await save(first,'exam');
        await a.rejects(request({user:first,charge:'exam',features:['plan_exam_bundle'],limit:10}),/PLAN_LIMIT/);
        await a.rejects(save(first,'once'),/INVALID_PLAN/);
        await request({ user:second,charge:'exam',features:['plan_exam_bundle'],limit:10 });
        await a.rejects(save(second,'exam'),/PLAN_LIMIT/);
        await a.rejects(save(second), /PLAN_LIMIT/);
        await save(second,'teacher');
        a.equal((await db.query('select id from user_items where user_id=$1',[second])).rows.length,3);
    });
    await t.test('usage failure rolls back job creation', async () => {
        await db.exec("alter table feature_usage add constraint reject_title check(user_email <> 'test@example.com') not valid");
        const id = randomUUID();
        await a.rejects(request({ id, user: randomUUID() }), /reject_title/);
        a.equal((await db.query('select id from pdf_jobs where id=$1', [id])).rows.length, 0);
    });
    await t.test('RPC independently rejects missing, foreign, wrong-kind and mixed receipt requests', async () => {
        const user=randomUUID(),other=randomUUID(),q2=randomUUID(),r1=randomUUID(),r2=randomUUID();
        await db.query("insert into bundle_selections(id,user_id,kind,question_ids) values ($1,$2,'print',$3),($4,$2,'predict',$5)",[r1,user,[question],r2,[question,q2]]);
        const call=(owner,kind,ids,receipt)=>db.query(`select create_plan_bundle($1,$2,null,$3,'receipt',$4,$5,'teacher',false,array[]::text[],0,null,$6)`,
            [randomUUID(),owner,kind,ids,randomUUID(),receipt]);
        for(const args of [[user,'print',[question],null],[other,'print',[question],r1],
            [user,'print',[question,q2],r1],[user,'print',[question],r2]])
            await a.rejects(call(...args),/INVALID_RECEIPT/);
        a.equal((await db.query('select count(*)::int n from pdf_jobs where user_id in ($1,$2)',[user,other])).rows[0].n,0);
        // A proper subset remains predict and stores that exact receipt.
        await call(user,'predict',[q2],r2);
        a.equal((await db.query('select receipt_id from pdf_jobs where user_id=$1',[user])).rows[0].receipt_id,r2);
    });
    await t.test('RPC is unavailable to anonymous and authenticated roles', async () => {
        const result = await db.query(`select has_function_privilege('authenticated', 'create_plan_bundle(uuid,uuid,text,text,text,uuid[],text,text,boolean,text[],integer,timestamptz,uuid)', 'execute') as allowed`);
        a.equal(result.rows[0].allowed, false);
    });
});

test('prediction PDF day/week quotas are atomic at Korean calendar boundaries (isolated DB clock)', async t => {
    const db=new PGlite();
    t.after(()=>db.close());
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create table test_clock(at timestamptz);
      insert into test_clock values ('2026-11-02T14:59:59.999Z');
      create function public.test_now() returns timestamptz language sql stable as 'select at from test_clock';
      create table pdf_jobs(id uuid primary key,user_id uuid not null,kind text,title text,stamp boolean default true,
        status text default 'pending',created_at timestamptz default public.test_now());
      create table feature_usage(id uuid primary key default gen_random_uuid(),user_id uuid,user_email text,
        feature text,title text,question_count int,created_at timestamptz default public.test_now());
      create table qb_usage(id uuid primary key default gen_random_uuid(),user_id uuid,exam_id uuid,created_at timestamptz default public.test_now());
      create table purchased_items(id uuid primary key default gen_random_uuid(),user_id uuid,item_type text,item_id text,created_at timestamptz default public.test_now());
      create table user_items(id uuid,user_id uuid,type text,reference_id uuid,details jsonb,created_at timestamptz default public.test_now());`);
    // Only replace the clock source; execute the production quota SQL and locking unchanged.
    const migration=fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261108_plans_final.sql'),'utf8');
    await applyMigration(db,migration.replace(/\bnow\(\)/g,'public.test_now()'));
    const user=randomUUID(), question=randomUUID();
    const clock=at=>db.query('update test_clock set at=$1',[at]);
    async function receive(hash,member=user) {
        const receipt=randomUUID();
        await db.query("insert into bundle_selections(id,user_id,kind,question_ids) values ($1,$2,'predict',$3)",[receipt,member,[question]]);
        const r=await db.query(`select create_plan_bundle($1,$2,'test@example.com','predict','예상문제',$3,$4,'free',false,
          array['plan_free_predict'],999,'2099-01-01',$5) as job`,[randomUUID(),member,[question],hash,receipt]);
        return r.rows[0].job;
    }
    await t.test('one PDF bundle counts once; repeat download and print trial remain independent',async()=>{
        const first=await receive('monday');
        a.equal(first.stamp,true); a.equal((await receive('monday')).id,first.id);
        await db.query("insert into feature_usage(user_id,feature) values ($1,'plan_free_bundle')",[user]);
        await a.rejects(receive('second-today'),/PLAN_LIMIT/);
        a.equal((await db.query("select count(*)::int n from feature_usage where feature='plan_free_predict'")).rows[0].n,1);
    });
    await t.test('daily limit resets exactly at KST midnight and cannot be bypassed with stale limits',async()=>{
        await clock('2026-11-02T15:00:00Z');
        await receive('tuesday');
        await a.rejects(receive('tuesday-extra'),/PLAN_LIMIT/);
        await clock('2026-11-03T15:00:00Z');
        await receive('wednesday');
    });
    await t.test('three days exhaust the week on an unused day, with repeats still permitted',async()=>{
        await clock('2026-11-04T15:00:00Z');
        await a.rejects(receive('thursday'),/PLAN_LIMIT/);
        a.equal((await receive('monday')).stamp,true);
        await clock('2026-11-08T14:59:59.999Z');
        await a.rejects(receive('sunday'),/PLAN_LIMIT/);
    });
    await t.test('Monday 00:00 KST resets both counters',async()=>{
        await clock('2026-11-08T15:00:00Z');
        await receive('next-week');
        await a.rejects(receive('next-week-extra'),/PLAN_LIMIT/);
    });
    await t.test('failed PDF releases day/week usage and can be requested again',async()=>{
        const member=randomUUID();
        const first=await receive('failed',member);
        await db.query("update pdf_jobs set status='error' where id=$1",[first.id]);
        a.notEqual((await receive('failed',member)).id,first.id);
        await a.rejects(receive('after-retry',member),/PLAN_LIMIT/);
    });
    await t.test('two different PDF requests cannot consume the last daily slot twice',async()=>{
        const member=randomUUID();
        const results=await Promise.allSettled([receive('race-a',member),receive('race-b',member)]);
        a.equal(results.filter(r=>r.status==='fulfilled').length,1);
        a.match(results.find(r=>r.status==='rejected').reason.message,/PLAN_LIMIT/);
    });
});
