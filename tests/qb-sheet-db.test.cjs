const {applyMigration}=require('./migration-helper.cjs');
﻿const {test}=require('node:test');
const a=require('node:assert/strict');
const fs=require('node:fs'), path=require('node:path');
const {randomUUID}=require('node:crypto');
const {PGlite}=require('@electric-sql/pglite');
const read=name=>fs.readFileSync(path.join(__dirname,'../supabase/migrations',name),'utf8');

test('sheet purchase, payment and atomic save on isolated PostgreSQL',async t=>{
 const db=new PGlite(); t.after(()=>db.close());
 await db.exec(`create role anon; create role authenticated; create role service_role;
 create table test_clock(at timestamptz); insert into test_clock values ('2026-11-08T14:59:59Z');
 create function test_now() returns timestamptz language sql stable as 'select at from test_clock';
 create table profiles(id uuid primary key,earned_points bigint default 0);
 create table folders(id uuid primary key,user_id uuid);
 create table user_items(id uuid primary key default gen_random_uuid(),user_id uuid,folder_id uuid,type text,name text,reference_id uuid,details jsonb,created_at timestamptz default test_now());
 create table question_bank_events(event text,event_id uuid,source text,session_id uuid,user_id uuid,exam_id uuid,question_count int);
 create table feature_usage(id uuid primary key default gen_random_uuid(),user_id uuid,user_email text,feature text,title text,question_count int,created_at timestamptz default test_now());
 create table pdf_jobs(id uuid primary key,user_id uuid,kind text,title text,stamp boolean,status text,created_at timestamptz default test_now());
 create table qb_usage(id uuid primary key default gen_random_uuid(),user_id uuid,exam_id uuid,created_at timestamptz default test_now());
 create table purchased_items(id uuid primary key default gen_random_uuid(),user_id uuid,payment_id text,item_id text,item_type text,title text,price_paid bigint,created_at timestamptz default test_now());
 create unique index purchase_order_unique on purchased_items(payment_id,item_id);
 create table payment_orders(id uuid primary key default gen_random_uuid(),payment_id text unique,user_id uuid,kind text default 'cart',status text default 'pending',amount bigint,total bigint,used_points bigint,points bigint default 0,items jsonb,name text,completed_at timestamptz);
 create table payment_history(user_id uuid,payment_id text unique,merchant_uid text,amount bigint,points_added bigint,status text);
 create table point_transactions(user_id uuid,type text,amount bigint,description text,related_id uuid);`);
 await db.exec(`create schema storage;
  create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,
    created_at timestamptz default test_now(),updated_at timestamptz default test_now());`);
 const clock=at=>db.query('update test_clock set at=$1',[at]);
 const apply=name=>applyMigration(db,read(name).replace(/\bnow\(\)/g,'public.test_now()'));
 await apply('20261008_saved_exam_limit.sql');
 const oldItem=randomUUID(),edgeItem=randomUUID(),futureItem=randomUUID(),oldOwner=randomUUID();
 for(const [id,created] of [[oldItem,'2026-11-08T14:59:58Z'],[edgeItem,'2026-11-08T14:59:59Z'],[futureItem,'2026-12-01T00:00:00Z']])
  await db.query("insert into user_items(id,user_id,type,reference_id,created_at) values ($1,$2,'saved_exam',$3,$4)",[id,oldOwner,randomUUID(),created]);
 await apply('20261108_plans_final.sql');
 const legacy=randomUUID(), legacyExam=randomUUID();
 await db.query('insert into qb_usage(user_id,exam_id) values ($1,$2)',[legacy,legacyExam]);
 await apply('20261108_plans_final.sql'); // retry the same final artifact
 const member=async()=>{const id=randomUUID();await db.query('insert into profiles(id,earned_points) values ($1,10000)',[id]);return id;};
 const buy=async(user,at='2026-11-01T00:00:00Z',type='QB_SHEET')=>(await db.query('insert into purchased_items(user_id,item_type,created_at) values ($1,$2,$3) returning id',[user,type,at])).rows[0].id;
 const save=async(user,charge='free',details={question_count:50},folder=null)=>{
  const r=await db.query(`select save_plan_exam_item($1,$2,'시험지',$3,$4,null,false,50,$5,'test@example.com',999,'2099-01-01') as item`,[user,folder,randomUUID(),details,charge]);
  return r.rows[0].item;
 };
 const count=async(user,feature)=>(await db.query('select count(*)::int n from feature_usage where user_id=$1 and feature=$2',[user,feature])).rows[0].n;
 const exhaust=async user=>{await save(user);await save(user);};
 const print=async(user,hash=randomUUID())=>{
  const receipt=randomUUID(),question=randomUUID();
  await db.query("insert into bundle_selections(id,user_id,kind,question_ids) values ($1,$2,'print',$3)",[receipt,user,[question]]);
  return (await db.query(`select create_plan_bundle($1,$2,'test@example.com','print','프린트',$3,$4,
   'exam',true,array['plan_exam_bundle'],10,'2026-11-01',$5) as job`,[randomUUID(),user,[question],hash,receipt])).rows[0].job;
 };
 const seedPass=async(user,n=9)=>{
  await buy(user,'2026-11-01T00:00:00Z','QB_EXAM');
  for(let i=0;i<n;i++)await db.query("insert into feature_usage(user_id,feature) values ($1,'plan_exam_bundle')",[user]);
 };
 await t.test('expired legacy teacher saves leave both weekly free slots before exam or sheet credits',async()=>{
  const user=await member();await buy(user,'2026-10-09T14:59:58Z','QB_PASS');
  await buy(user);await buy(user,'2026-11-01T00:00:00Z','QB_EXAM');
  for(let i=0;i<2;i++)await db.query("insert into qb_usage(user_id,exam_id,created_at) values ($1,$2,'2026-11-08T14:00:00Z')",[user,randomUUID()]);
  a.equal((await db.query("select count(*)::int n from plan_usage where user_id=$1 and feature='plan_free_exam'",[user])).rows[0].n,0);
  for(let i=0;i<2;i++)a.equal((await save(user,'sheet')).details.plan,'free');
  a.equal(await count(user,'plan_sheet_exam'),0);a.equal(await count(user,'plan_exam_exam'),0);
  a.equal((await save(user,'sheet')).details.plan,'exam');
 });
 await t.test('legacy teacher history matches all month terms, stacked renewals, gaps and exact half-open boundaries',async()=>{
  const start=Date.parse('2025-01-01T00:00:00Z'),day=86400000;
  const addBuy=async(user,at,itemId)=>db.query("insert into purchased_items(user_id,item_type,item_id,created_at) values ($1,'QB_PASS',$2,$3)",[user,itemId,new Date(at).toISOString()]);
  const visible=async(user,at)=>{
   const exam=randomUUID();await db.query('insert into qb_usage(user_id,exam_id,created_at) values ($1,$2,$3)',[user,exam,new Date(at).toISOString()]);
   return (await db.query("select count(*)::int n from plan_usage where user_id=$1 and title=$2 and feature='plan_free_exam'",[user,exam])).rows[0].n;
  };
  for(const [suffix,days] of [['030',30],['090',90],['180',180],['360',360],['999',30],[null,30]]) {
   const user=await member();await addBuy(user,start,suffix&&`7b0c6f2e-30da-4a5e-9c11-000000000${suffix}`);
   a.equal(await visible(user,start-1),1);a.equal(await visible(user,start),0);
   a.equal(await visible(user,start+days*day-1),0);a.equal(await visible(user,start+days*day),1);
  }
  const user=await member();await addBuy(user,start,null);await addBuy(user,start+10*day,null);
  await addBuy(user,start+70*day,null);
  for(const [offset,expected] of [[45,0],[60,1],[65,1],[70,0],[99,0],[100,1]])a.equal(await visible(user,start+offset*day),expected);
  // Explicit modern receipts remain authoritative, and qb_usage duplicates are never counted again.
  const exam=randomUUID();await db.query("insert into feature_usage(user_id,feature,title,created_at) values ($1,'plan_teacher_exam',$2,'2025-01-02')",[user,exam]);
  await db.query("insert into qb_usage(user_id,exam_id,created_at) values ($1,$2,'2025-01-02')",[user,exam]);
  const rows=(await db.query('select feature from plan_usage where user_id=$1 and title=$2',[user,exam])).rows;
  a.deepEqual(rows.map(r=>r.feature),['plan_teacher_exam']);
 });
 await t.test('only predeployment exams get legacy proofs once; backdating a new forged item cannot gain a proof on reapply',async()=>{
  const proof=async id=>(await db.query('select * from exam_save_proofs where item_id=$1',[id])).rows;
  a.equal((await proof(oldItem)).length,1);a.equal((await proof(edgeItem)).length,0);a.equal((await proof(futureItem)).length,0);
  const backdated=randomUUID();
  await db.query("insert into user_items(id,user_id,type,reference_id,details,created_at) values ($1,$2,'saved_exam',$3,'{\"server_saved\":true,\"plan\":\"teacher\"}','2000-01-01')",[backdated,oldOwner,randomUUID()]);
  await apply('20261108_plans_final.sql');
  a.equal((await proof(backdated)).length,0);a.equal((await proof(oldItem)).length,1);
  for(const role of ['anon','authenticated'])for(const privilege of ['SELECT','INSERT','UPDATE','DELETE'])
   a.equal((await db.query('select has_table_privilege($1,$2,$3) allowed',[role,'exam_save_proofs',privilege])).rows[0].allowed,false);
  await db.exec('set role authenticated');
  try{await a.rejects(db.query('insert into exam_save_proofs(item_id,user_id,reference_id) values ($1,$2,$3)',[randomUUID(),oldOwner,randomUUID()]),/permission denied/);}
  finally{await db.exec('reset role');}
 });
 await t.test('successful save atomically proves item, owner and locked source; failed saves leave no proof',async()=>{
  const user=await member(),source=`locked/${user}/${randomUUID()}.hml`;
  const item=await save(user,'free',{question_count:1,hml_path:source});
  const proofs=await db.query('select * from exam_save_proofs where item_id=$1',[item.id]);
  a.equal(proofs.rows.length,1);a.equal(proofs.rows[0].user_id,user);a.equal(proofs.rows[0].reference_id,item.reference_id);a.equal(proofs.rows[0].hml_path,source);
  await save(user);
  await a.rejects(save(user),/PLAN_LIMIT/);
  a.equal((await db.query('select count(*)::int n from exam_save_proofs where user_id=$1',[user])).rows[0].n,2);
 });
 await t.test('upgrade tags preexisting legacy proofs even if member changed item date, while new locked proofs remain server proofs',async()=>{
  const orphan=randomUUID();
  await db.query('insert into exam_save_proofs(item_id,user_id,reference_id) values ($1,$2,$3)',[orphan,oldOwner,randomUUID()]);
  await db.query('update exam_save_proofs set legacy_cutoff=null where item_id=$1',[oldItem]);
  await db.query("update user_items set created_at='2099-01-01' where id=$1",[oldItem]);
  const user=await member();const item=await save(user,'free',{question_count:1,hml_path:`locked/${user}/${randomUUID()}.hml`});
  await apply('20261108_plans_final.sql');
  a.equal(Date.parse((await db.query('select legacy_cutoff from exam_save_proofs where item_id=$1',[oldItem])).rows[0].legacy_cutoff),Date.parse('2026-11-08T14:59:59Z'));
  a.equal(Date.parse((await db.query('select legacy_cutoff from exam_save_proofs where item_id=$1',[orphan])).rows[0].legacy_cutoff),Date.parse('2026-11-08T14:59:59Z'));
  a.equal((await db.query('select legacy_cutoff from exam_save_proofs where item_id=$1',[item.id])).rows[0].legacy_cutoff,null);
 });
 await t.test('server-only backfill covers old saves between SQL and code deployment, is repeatable and preserves each cutoff',async()=>{
  const user=await member();
  await clock('2026-11-08T15:00:00Z');
  await db.exec('set role service_role');
  const late=(await db.query("select save_exam_item($1,null,'옛 서버 저장',$2,'{}',null,false,20) item",[user,randomUUID()])).rows[0].item;
  await db.exec('reset role');
  a.equal((await db.query('select item_id from exam_save_proofs where item_id=$1',[late.id])).rows.length,0);
  const forged=randomUUID();
  await db.exec('grant insert on user_items to authenticated;set role authenticated');
  try{await db.query("insert into user_items(id,user_id,type,reference_id,created_at) values ($1,$2,'saved_exam',$3,'2000-01-01')",[forged,user,randomUUID()]);}
  finally{await db.exec('reset role');}
  await clock('2026-11-08T15:00:01Z');
  const boundary=(await db.query("select save_exam_item($1,null,'cutoff 경계',$2,'{}',null,false,20) item",[user,randomUUID()])).rows[0].item;
  const run=async cutoff=>(await db.query('select backfill_exam_save_proofs($1) n',[cutoff])).rows[0].n;
  a(Number(await run('2026-11-08T15:00:01Z'))>=1);
  a.equal(Number(await run(null)),0);
  a.equal((await db.query('select item_id from exam_save_proofs where item_id=$1',[forged])).rows.length,0);
  a.equal((await db.query('select item_id from exam_save_backfill_candidates where item_id=$1',[forged])).rows.length,0);
  a.equal((await db.query('select item_id from exam_save_proofs where item_id=$1',[boundary.id])).rows.length,0);
  const proof=(await db.query('select * from exam_save_proofs where item_id=$1',[late.id])).rows[0];
  a.equal(Date.parse(proof.legacy_cutoff),Date.parse('2026-11-08T15:00:01Z'));
  await clock('2026-11-08T15:00:02Z');await run('2026-11-08T15:00:02Z');
  a.equal(Date.parse((await db.query('select legacy_cutoff from exam_save_proofs where item_id=$1',[late.id])).rows[0].legacy_cutoff),Date.parse(proof.legacy_cutoff));
  await a.rejects(run('2099-01-01'),/INVALID_CUTOFF/);
  for(const role of ['anon','authenticated'])for(const fn of ['backfill_exam_save_proofs(timestamptz)','legacy_exam_file_unchanged(uuid,uuid,uuid,text)'])
   a.equal((await db.query('select has_function_privilege($1,$2,\'execute\') allowed',[role,fn])).rows[0].allowed,false);
  for(const role of ['anon','authenticated'])for(const privilege of ['SELECT','INSERT','UPDATE','DELETE'])
   a.equal((await db.query('select has_table_privilege($1,$2,$3) allowed',[role,'exam_save_backfill_candidates',privilege])).rows[0].allowed,false);
  a.equal((await db.query("select has_function_privilege('service_role','backfill_exam_save_proofs(timestamptz)','execute') allowed")).rows[0].allowed,true);
  await db.exec('set role authenticated');
  try{await a.rejects(db.query('select backfill_exam_save_proofs()'),/permission denied/);}finally{await db.exec('reset role');}
  await clock('2026-11-08T14:59:59Z');
 });
 await t.test('legacy authorization requires an existing original unchanged since its proof cutoff, including delete and reupload',async()=>{
  const p=(await db.query('select * from exam_save_proofs where item_id=$1',[oldItem])).rows[0];
  const name=`${p.user_id}/${p.reference_id}.hml`;
  const allowed=async(user=p.user_id,ref=p.reference_id)=>(await db.query('select legacy_exam_file_unchanged($1,$2,$3,null) ok',[oldItem,user,ref])).rows[0].ok;
  a.equal(await allowed(),false);
  await db.query("insert into storage.objects(bucket_id,name,created_at,updated_at) values ('exams',$1,$2,$2)",[name,p.legacy_cutoff]);
  a.equal(await allowed(),true);a.equal(await allowed(randomUUID()),false);a.equal(await allowed(p.user_id,randomUUID()),false);
  await db.query("update storage.objects set updated_at=$1::timestamptz+interval '1 microsecond' where name=$2",[p.legacy_cutoff,name]);
  a.equal(await allowed(),false);
  await clock('2026-11-08T15:01:00Z');
  await db.query('select backfill_exam_save_proofs($1)',['2026-11-08T15:01:00Z']);
  a.equal(await allowed(),false); // Re-running with a later cutoff never reauthorizes a changed original.
  await clock('2026-11-08T14:59:59Z');
  await db.query('delete from storage.objects where name=$1',[name]);a.equal(await allowed(),false);
  await db.query("insert into storage.objects(bucket_id,name,created_at,updated_at) values ('exams',$1,$2::timestamptz+interval '1 second',$2::timestamptz+interval '1 second')",[name,p.legacy_cutoff]);
  a.equal(await allowed(),false);
  await db.query('delete from storage.objects where name=$1',[name]);
 });
 await t.test('actual exams storage policies deny member reads and writes to every locked upload before and after commit',async()=>{
  await db.exec(`create schema auth;
   create function auth.uid() returns uuid language sql stable as 'select current_setting(''test.member'')::uuid';
   create function storage.foldername(text) returns text[] language sql immutable as 'select string_to_array($1,''/'')';
   create table storage.buckets(id text primary key,public boolean);insert into storage.buckets values ('exams',true);
   alter table storage.objects enable row level security;
   grant usage on schema auth,storage to authenticated;grant select,insert,update,delete on storage.objects to authenticated;
   grant select on test_clock to authenticated;`);
  await apply('20261008_lock_exams_bucket.sql');
  const user=await member(),ref=randomUUID(),locked=`locked/${user}/${ref}.hml`,normal=`${user}/${ref}.hml`;
  await db.query("select set_config('test.member',$1,false)",[user]);
  await db.query("insert into storage.objects(bucket_id,name) values ('exams',$1),('exams',$2)",[locked,normal]);
  const check=async()=>{
   await db.exec('set role authenticated');
   try{
    const visible=(await db.query("select name from storage.objects where bucket_id='exams'")).rows.map(r=>r.name);
    a.deepEqual(visible,[normal]);
    await a.rejects(db.query("insert into storage.objects(bucket_id,name) values ('exams',$1)",[locked+'.json']),/row-level security/);
    a.equal((await db.query("update storage.objects set name=$1 where name=$1 returning name",[locked])).rows.length,0);
   }finally{await db.exec('reset role');}
  };
  await check();await save(user,'free',{question_count:1,hml_path:locked});await check();
  a.equal((await db.query("select public from storage.buckets where id='exams'")).rows[0].public,false);
 });
 await t.test('migration preserves legacy successful weekly saves without duplicating on reapply',async()=>{
  a.equal((await db.query("select count(*)::int n from plan_usage where user_id=$1 and feature='plan_free_exam'",[legacy])).rows[0].n,1);
  a.equal(await count(legacy,'plan_free_exam'),0); // original table is read, never copied
  await save(legacy);await a.rejects(save(legacy),/PLAN_LIMIT/);
 });
 await t.test('legacy code writes after migration remain visible without copies and new saves deduplicate qb_usage',async()=>{
  const user=await member();
  for(let i=0;i<2;i++)await db.query('insert into qb_usage(user_id,exam_id) values ($1,$2)',[user,randomUUID()]);
  await a.rejects(save(user),/PLAN_LIMIT/);
  a.equal((await db.query('select count(*)::int n from plan_usage where user_id=$1',[user])).rows[0].n,2);
  a.equal(await count(user,'plan_free_exam'),0);
 });
 await t.test('request ID commits atomically, retry does not charge again, changed fingerprint and other users cannot replay',async()=>{
  const user=await member(),rid=randomUUID();await exhaust(user);await buy(user);await buy(user);
  const details={question_count:3,request_id:rid,request_fingerprint:'same'};
  const first=await save(user,'sheet',details);
  const replay=await save(user,'sheet',details);a.equal(replay.id,first.id);
  a.equal(await count(user,'plan_sheet_exam'),1);
  a.equal((await db.query('select count(*)::int n from qb_usage where user_id=$1',[user])).rows[0].n,3);
  await a.rejects(save(user,'sheet',{...details,request_fingerprint:'different'}),/REQUEST_MISMATCH/);
  const other=await member();a.notEqual((await save(other,'free',details)).id,first.id);
 });
 await t.test('refunded print cannot resurrect after the last shared credit is reused by an exam',async()=>{
  const user=await member();await exhaust(user);await seedPass(user);
  const job=await print(user); // HWP was reserved; model a PDF-only pending reservation instead
  await db.query("update pdf_jobs set hwp_ready=false,status='error' where id=$1",[job.id]);
  await save(user,'exam');
  await a.rejects(db.query('select claim_bundle_hwp($1,$2)',[user,job.id]),/BUNDLE_UNAVAILABLE/);
  a.equal(await count(user,'plan_exam_exam')+await count(user,'plan_exam_bundle'),11); // 1 refunded job remains in history
  await a.rejects(save(user,'exam'),/PLAN_LIMIT/);
 });
 await t.test('done PDF followed by failed restoration permanently keeps its shared charge',async()=>{
  const user=await member();await exhaust(user);await seedPass(user);
  const job=await print(user);
  await db.query("update pdf_jobs set hwp_ready=false,status='done' where id=$1",[job.id]);
  await db.query("update pdf_jobs set status='pending' where id=$1",[job.id]);
  await db.query("update pdf_jobs set status='error' where id=$1",[job.id]);
  a.equal((await db.query('select pdf_delivered from pdf_jobs where id=$1',[job.id])).rows[0].pdf_delivered,true);
  await a.rejects(save(user,'exam'),/PLAN_LIMIT/);
 });
 await t.test('free goes before sheet even with stale sheet selection; FIFO purchase credit is consumed',async()=>{
  const user=await member();const first=await buy(user),second=await buy(user,'2026-11-02T00:00:00Z');
  a.equal((await save(user,'sheet')).details.plan,'free');
  a.equal((await save(user,'sheet')).details.plan,'free');
  const item=await save(user);
  a.equal(item.details.plan,'sheet');a.equal(item.details.pdf_only,false);
  a.equal(Date.parse(item.details.redownload_until)-Date.parse('2026-11-08T14:59:59Z'),30*86400000);
  const spent=(await db.query("select qb_sheet_purchase_id id from feature_usage where user_id=$1 and feature='plan_sheet_exam'",[user])).rows;
  a.equal(spent[0].id,first);await save(user);
  a.equal(await count(user,'plan_sheet_exam'),2);await a.rejects(save(user),/PLAN_LIMIT/);
  a.notEqual(first,second);
 });
 await t.test('last sheet cannot be spent twice by competing saves',async()=>{
  const user=await member();await exhaust(user);await buy(user);
  const r=await Promise.allSettled([save(user),save(user)]);
  a.equal(r.filter(x=>x.status==='fulfilled').length,1);
  a.match(r.find(x=>x.status==='rejected').reason.message,/PLAN_LIMIT/);
 });
 await t.test('exact 30-day expiry discards only the expired unused purchase',async()=>{
  const user=await member();await exhaust(user);
  await buy(user,'2026-10-09T14:59:59Z'); // exactly 30 days
  await a.rejects(save(user),/PLAN_LIMIT/);
  const live=await buy(user,'2026-10-09T15:00:00Z');
  await save(user);a.equal((await db.query("select qb_sheet_purchase_id id from feature_usage where user_id=$1 and feature='plan_sheet_exam'",[user])).rows[0].id,live);
 });
 await t.test('teacher saves do not spend free quota or a sheet; print-only once cannot pay for exams',async()=>{
  const user=await member();await buy(user);await save(user,'teacher',{question_count:100});
  a.equal(await count(user,'plan_free_exam'),0);a.equal(await count(user,'plan_sheet_exam'),0);
  a.equal((await save(user)).details.plan,'free');
  await a.rejects(save(user,'once'),/INVALID_PLAN/);
  await a.rejects(save(user,'free',{question_count:51}),/INVALID_QUESTIONS/);
 });
 await t.test('failed save and failed usage insert both roll back credit and stored item',async()=>{
  const user=await member();await exhaust(user);await buy(user);
  await a.rejects(save(user,'sheet',{question_count:50},randomUUID()),/Invalid folder/);
  a.equal(await count(user,'plan_sheet_exam'),0);
  await db.exec("alter table feature_usage add constraint reject_sheet check(feature<>'plan_sheet_exam') not valid");
  await a.rejects(save(user),/reject_sheet/);
  a.equal((await db.query('select count(*)::int n from user_items where user_id=$1',[user])).rows[0].n,2);
  await db.exec('alter table feature_usage drop constraint reject_sheet');
  await save(user);a.equal(await count(user,'plan_sheet_exam'),1);
 });
 await t.test('deleting a saved exam does not restore its sheet',async()=>{
  const user=await member();await exhaust(user);await buy(user);const item=await save(user);
  await db.query('delete from user_items where id=$1',[item.id]);
  await a.rejects(save(user),/PLAN_LIMIT/);
 });
 await t.test('free then exam pass then sheet is chosen under the lock even with stale charge and forged limits',async()=>{
  const user=await member();await seedPass(user);const sheet=await buy(user);
  a.equal((await save(user,'sheet')).details.plan,'free');
  a.equal((await save(user,'exam')).details.plan,'free');
  const item=await save(user,'sheet');a.equal(item.details.plan,'exam');a.equal(item.details.pdf_only,false);
  a.equal(await count(user,'plan_sheet_exam'),0);
  a.equal((await save(user,'exam')).details.plan,'sheet');
  a.equal((await db.query("select qb_sheet_purchase_id id from feature_usage where user_id=$1 and feature='plan_sheet_exam'",[user])).rows[0].id,sheet);
  await a.rejects(save(user,'exam'),/PLAN_LIMIT/);
 });
 await t.test('exam and print share the last credit in either order and competing requests cannot double spend',async()=>{
  for(const order of ['exam-first','print-first','race-exam-first','race-print-first']){
   const user=await member();await exhaust(user);await seedPass(user);
   if(order==='exam-first'){
    await save(user,'exam');await a.rejects(print(user),/PLAN_LIMIT/);
   }else if(order==='print-first'){
    await print(user);await a.rejects(save(user,'exam'),/PLAN_LIMIT/);
   }else{
    const r=await Promise.allSettled(order==='race-exam-first'?[save(user,'exam'),print(user)]:[print(user),save(user,'exam')]);
    a.equal(r.filter(x=>x.status==='fulfilled').length,1,order);
    a.match(r.find(x=>x.status==='rejected').reason.message,/PLAN_LIMIT/);
   }
   a.equal(await count(user,'plan_exam_exam')+await count(user,'plan_exam_bundle'),10);
  }
 });
 await t.test('exam-pass save keeps 50-question limit and rolls back shared credit when storage or usage fails',async()=>{
  const user=await member();await exhaust(user);await seedPass(user);
  await a.rejects(save(user,'exam',{question_count:51}),/INVALID_QUESTIONS/);
  await a.rejects(save(user,'exam',{question_count:50},randomUUID()),/Invalid folder/);
  await db.exec("alter table feature_usage add constraint reject_exam check(feature<>'plan_exam_exam') not valid");
  await a.rejects(save(user,'exam'),/reject_exam/);
  a.equal(await count(user,'plan_exam_exam'),0);
  a.equal((await db.query('select count(*)::int n from user_items where user_id=$1',[user])).rows[0].n,2);
  await db.exec('alter table feature_usage drop constraint reject_exam');
  await print(user);await a.rejects(save(user,'exam'),/PLAN_LIMIT/);
 });
 await t.test('exam-pass renewal stacks shared allowance and lapse or exact expiry discards old allowance',async()=>{
  const user=await member();await exhaust(user);await seedPass(user,10);
  await buy(user,'2026-11-05T00:00:00Z','QB_EXAM');
  a.equal((await save(user,'exam')).details.plan,'exam');
  const expired=await member();await exhaust(expired);
  await buy(expired,'2026-10-25T14:59:59Z','QB_EXAM');
  await a.rejects(save(expired,'exam'),/PLAN_LIMIT/);
  const lapsed=await member();await exhaust(lapsed);
  await buy(lapsed,'2026-10-10T00:00:00Z','QB_EXAM');
  await buy(lapsed,'2026-11-01T00:00:00Z','QB_EXAM');
  for(let i=0;i<10;i++)await db.query("insert into feature_usage(user_id,feature,created_at) values ($1,'plan_exam_exam','2026-10-11')",[lapsed]);
  for(let i=0;i<10;i++)a.equal((await save(lapsed,'exam')).details.plan,'exam');
  await a.rejects(save(lapsed,'exam'),/PLAN_LIMIT/);
 });
 await t.test('failed print PDF refunds shared credit only if HWP has not been delivered',async()=>{
  const user=await member();await exhaust(user);await seedPass(user);
  const job=await print(user);
  a.equal(job.hwp_ready,false);
  await db.query('select claim_bundle_hwp($1,$2)',[user,job.id]);
  await db.query("update pdf_jobs set status='error' where id=$1",[job.id]);
  await a.rejects(save(user,'exam'),/PLAN_LIMIT/);
  await db.query('update pdf_jobs set hwp_ready=false where id=$1',[job.id]);
  a.equal((await save(user,'exam')).details.plan,'exam');
 });
 await t.test('KST Monday reset grants two free saves ahead of a retained sheet',async()=>{
  const user=await member();await exhaust(user);await buy(user);
  await clock('2026-11-08T15:00:00Z');
  a.equal((await save(user,'sheet')).details.plan,'free');
  a.equal((await save(user,'sheet')).details.plan,'free');
  a.equal((await save(user)).details.plan,'sheet');
 });
 await t.test('stored exam stays in the same cabinet after sheet purchase expires',async()=>{
  const user=await member();await exhaust(user);await buy(user);const item=await save(user);
  await clock('2026-12-01T00:00:00Z');
  const stored=(await db.query('select * from user_items where id=$1 and user_id=$2',[item.id,user])).rows[0];
  a.equal(stored.type,'saved_exam');a.equal(stored.details.pdf_only,false);
  a.equal((await db.query('select id from user_items where id=$1 and user_id=$2',[item.id,randomUUID()])).rows.length,0);
 });
 await t.test('actual completion RPC accepts QB_SHEET with full points and is idempotent; separate purchases stack',async()=>{
  await apply('20260926_retire_seller_settlements.sql');
  const user=await member();
  const order=async()=>{
   const payment='order-'+randomUUID().replaceAll('-','');
   await db.query(`insert into payment_orders(payment_id,user_id,amount,total,used_points,items,name) values ($1,$2,0,2900,2900,$3,'시험지 1장권')`,[payment,user,JSON.stringify([{item_id:'7b0c6f2e-30da-4a5e-9c11-000000000050',item_type:'QB_SHEET',title:'시험지 1장권',price:2900}])]);
   await db.query('select complete_payment_order($1,$2)',[payment,user]);
   await db.query('select complete_payment_order($1,$2)',[payment,user]);
  };
  await order();await order();
  a.equal((await db.query("select count(*)::int n from purchased_items where user_id=$1 and item_type='QB_SHEET'",[user])).rows[0].n,2);
  a.equal(Number((await db.query('select earned_points from profiles where id=$1',[user])).rows[0].earned_points),4200);
 });
 await t.test('save RPC remains service-only',async()=>{
  a.equal((await db.query("select has_function_privilege('authenticated','save_plan_exam_item(uuid,uuid,text,uuid,jsonb,uuid,boolean,integer,text,text,integer,timestamptz)','execute') ok")).rows[0].ok,false);
 });
});
