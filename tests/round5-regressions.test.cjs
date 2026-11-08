const {test}=require('node:test'),a=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const {randomUUID}=require('node:crypto'),{PGlite}=require('@electric-sql/pglite');
const React=require('react');
const {applyMigration}=require('./migration-helper.cjs');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
function load(file,deps={},globals={}) {
 const mod={exports:{}};
 const code=ts.transpileModule(read('src/'+file),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 vm.runInNewContext(code,{module:mod,exports:mod.exports,Buffer,Date,Set,Map,console,require:n=>n in deps?deps[n]:n.startsWith('@/')?(()=>{throw Error('Unexpected '+n);})():require(n),...globals});
 return mod.exports;
}

test('round5 actual SQL reselects print payment under the shared lock and admits one exam PDF job',async t=>{
 const db=new PGlite();t.after(()=>db.close());
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create table test_clock(at timestamptz);insert into test_clock values ('2026-11-08T14:59:59Z');
 create function test_now() returns timestamptz language sql stable as 'select at from test_clock';
 create table profiles(id uuid primary key);
 create table folders(id uuid primary key,user_id uuid);
 create table user_items(id uuid primary key default gen_random_uuid(),user_id uuid,folder_id uuid,type text,name text,reference_id uuid,details jsonb,created_at timestamptz default test_now());
 create table question_bank_events(event text,event_id uuid,source text,session_id uuid,user_id uuid,exam_id uuid,question_count int);
 create table feature_usage(id uuid primary key default gen_random_uuid(),user_id uuid,user_email text,feature text,title text,question_count int,created_at timestamptz default test_now());
 create table pdf_jobs(id uuid primary key,user_id uuid,kind text,title text,stamp boolean,status text default 'pending',created_at timestamptz default test_now());
 create table qb_usage(id uuid primary key default gen_random_uuid(),user_id uuid,exam_id uuid,created_at timestamptz default test_now());
 create table purchased_items(id uuid primary key default gen_random_uuid(),user_id uuid,item_type text,item_id text,created_at timestamptz default test_now());
 create schema storage;create table storage.objects(bucket_id text,name text,created_at timestamptz,updated_at timestamptz);`);
 await applyMigration(db,read('supabase/migrations/20261008_saved_exam_limit.sql'));
 await applyMigration(db,read('supabase/migrations/20261108_plans_final.sql').replace(/\bnow\(\)/g,'public.test_now()'));
 const buy=(u,type,at='2026-11-01T00:00:00Z')=>db.query('insert into purchased_items(user_id,item_type,created_at) values ($1,$2,$3)',[u,type,at]);
 const use=async(u,feature,n=1)=>{for(let i=0;i<n;i++)await db.query('insert into feature_usage(user_id,feature) values ($1,$2)',[u,feature]);};
 const print=async(u,{hwp=false,charge='exam',hash=randomUUID(),limit=999,since='2099-01-01'}={})=>{
  const receipt=randomUUID(),ids=[randomUUID()];
  await db.query("insert into bundle_selections(id,user_id,kind,question_ids) values ($1,$2,'print',$3)",[receipt,u,ids]);
  return (await db.query("select create_plan_bundle($1,$2,null,'print','프린트',$3,$4,$5,$6,array[]::text[],$7,$8,$9) job",[randomUUID(),u,ids,hash,charge,hwp,limit,since,receipt])).rows[0].job;
 };
 const save=u=>db.query(`select save_plan_exam_item($1,null,'시험지',$2,'{"question_count":1}',null,false,20,'exam',null,999,'2099-01-01') item`,[u,randomUUID()]);
 const charges=async u=>(await db.query("select feature from feature_usage where user_id=$1 and title is not null order by feature",[u])).rows.map(r=>r.feature);
 await t.test('PDF reselects free, then real exam credit, then once; stale parameters cannot grant credits',async()=>{
  const u=randomUUID();await buy(u,'QB_EXAM');await buy(u,'QB_ONCE');
  const free=await print(u,{charge:'once'});a.equal(free.plan_charge,'free');a.equal(free.stamp,true);
  a.equal((await print(u,{charge:'once'})).plan_charge,'free');
  const exam=await print(u,{charge:'free',limit:0});a.equal(exam.plan_charge,'exam');a.equal(exam.stamp,false);
  await use(u,'plan_exam_exam',9);
  const once=await print(u,{charge:'exam',limit:0});a.equal(once.plan_charge,'once');
  a.equal(Date.parse(once.retain_until)-Date.parse(once.created_at),30*86400000);
  await a.rejects(print(u),/PLAN_LIMIT/);
  a.deepEqual(await charges(u),['plan_exam_bundle','plan_free_bundle','plan_free_bundle','plan_once_bundle']);
 });
 await t.test('HWP skips unused free allowance and falls back after a saved exam consumes the last shared credit',async()=>{
  const u=randomUUID();await buy(u,'QB_EXAM');await buy(u,'QB_ONCE');
  await save(u);await save(u);await use(u,'plan_exam_bundle',9);
  await save(u); // The file generation snapshot had one shared credit; this save wins the lock.
  const job=await print(u,{hwp:true});a.equal(job.plan_charge,'once');a.equal(job.stamp,false);
  a(!(await charges(u)).includes('plan_free_bundle'));
  a.equal((await print(u,{hwp:true,hash:job.set_hash})).id,job.id);
  a.equal((await charges(u)).filter(c=>c==='plan_once_bundle').length,1);
 });
 await t.test('two different HWP requests share the last exam and once credits without exceeding either allowance',async()=>{
  const u=randomUUID();await buy(u,'QB_EXAM');await buy(u,'QB_ONCE');await use(u,'plan_exam_exam',9);
  const jobs=await Promise.all([print(u,{hwp:true}),print(u,{hwp:true})]);
  a.deepEqual(jobs.map(j=>j.plan_charge).sort(),['exam','once']);
  await a.rejects(print(u,{hwp:true}),/PLAN_LIMIT/);
 });
 await t.test('expired pass and future purchases are excluded; unprovided failures refund once but delivered failures do not',async()=>{
  const u=randomUUID();await buy(u,'QB_EXAM','2026-10-01T00:00:00Z');await buy(u,'QB_EXAM','2026-12-01T00:00:00Z');
  await buy(u,'QB_ONCE','2026-12-01T00:00:00Z');await a.rejects(print(u,{hwp:true}),/PLAN_LIMIT/);
  await buy(u,'QB_ONCE');const failed=await print(u,{hwp:true});a.equal(failed.plan_charge,'once');
  await db.query("update pdf_jobs set status='error' where id=$1",[failed.id]);
  const retry=await print(u,{hwp:true});a.notEqual(retry.id,failed.id);
  await db.query("update pdf_jobs set status='done' where id=$1",[retry.id]);
  await db.query("update pdf_jobs set status='error' where id=$1",[retry.id]);
  await a.rejects(print(u,{hwp:true}),/PLAN_LIMIT/);
 });
 await t.test('five simultaneous exam PDF admissions return one pending/working job; user and exam isolate the lock',async()=>{
  const u=randomUUID(),exam=randomUUID();
  const admit=(user=u,id=exam)=>db.query("select create_exam_pdf_job($1,$2,$3,'시험지') job",[randomUUID(),user,id]).then(r=>r.rows[0].job);
  const jobs=await Promise.all(Array.from({length:5},()=>admit()));
  a.equal(new Set(jobs.map(j=>j.id)).size,1);
  await db.query("update pdf_jobs set status='working' where id=$1",[jobs[0].id]);
  a.equal((await admit()).id,jobs[0].id);
  a.notEqual((await admit(randomUUID())).id,jobs[0].id);a.notEqual((await admit(u,randomUUID())).id,jobs[0].id);
  a.equal((await db.query("select count(*)::int n from pdf_jobs where user_id=$1 and set_hash=$2",[u,exam])).rows[0].n,1);
  for(const role of ['anon','authenticated'])a.equal((await db.query("select has_function_privilege($1,'create_exam_pdf_job(uuid,uuid,uuid,text)','execute') allowed",[role])).rows[0].allowed,false);
 });
});

function pdfHarness() {
 const user={id:randomUUID()},exam=randomUUID(),ref=randomUUID();
 const state={jobs:[],files:new Set(),uploads:[],removes:[],rpcCalls:0,verified:true,readError:false};
 const admin={from(table){let rows=table==='user_items'?[{id:exam,user_id:user.id,type:'saved_exam',reference_id:ref,name:'시험지',details:{}}]:state.jobs;
  return {select(){return this;},eq(k,v){rows=rows.filter(r=>r[k]===v);return this;},in(k,v){rows=rows.filter(r=>v.includes(r[k]));return this;},order(){return this;},
   maybeSingle:async()=>({data:rows[0]||null}),then(resolve,reject){return Promise.resolve({data:rows,error:state.readError?{}:null}).then(resolve,reject);}};
 },storage:{from:bucket=>({download:async()=>({data:{text:async()=>'<HWPML/>'}}),
  createSignedUrl:async file=>({data:state.files.has(file)?{signedUrl:'https://test.invalid/'+file}:null}),
  upload:async file=>{state.uploads.push(file);state.files.add(file);return {error:null};},
  remove:async files=>{for(const file of files){state.removes.push(file);state.files.delete(file);}return {};}})},
  rpc:async(name,args)=>{a.equal(name,'create_exam_pdf_job');state.rpcCalls++;
   let job=state.jobs.find(j=>j.user_id===args.p_user&&j.set_hash===args.p_exam&&['pending','working'].includes(j.status));
   if(!job){job={id:args.p_id,user_id:args.p_user,kind:'exam',set_hash:args.p_exam,status:'pending'};state.jobs.push(job);}
   return {data:job};}
 };
 const route=load('app/api/pdf/route.ts',{'@/utils/supabase/server':{createClient:()=>({auth:{getUser:async()=>({data:{user}})}})},
  '@/utils/supabase/server-admin':{createAdminClient:()=>admin},'@/lib/planBundles':{BundleError:class extends Error{}},
  '@/lib/hml-v2/member-stamp':{stampMemberId:x=>x},'@/lib/savedExamAccess':{savedExamVerified:async()=>state.verified},
  'next/server':{NextResponse:{json:(body,opts)=>({body,status:opts?.status||200})}}});
 return {user,exam,state,call:(examId=exam)=>route.POST({json:async()=>({examId})})};
}
test('round5 exam PDF API reuses active jobs, races through atomic RPC, and cleans only redundant uploads',async()=>{
 const h=pdfHarness();const r=await Promise.all(Array.from({length:5},()=>h.call()));
 a(r.every(x=>x.status===200));a.equal(new Set(r.map(x=>x.body.id)).size,1);a.equal(h.state.jobs.length,1);
 a.equal(h.state.uploads.length,5);a.equal(h.state.removes.length,4);a.equal(h.state.files.size,1);
 for(const status of ['pending','working']){h.state.jobs[0].status=status;a.equal((await h.call()).body.id,r[0].body.id);}
 a.equal(h.state.uploads.length,5);a.equal(h.state.rpcCalls,5);
});
test('round5 done exam PDF reuses either real file; missing files or error create one replacement; ownership and proofs remain required',async()=>{
 for(const suffix of ['.pdf','.m.pdf',null]){
  const h=pdfHarness(),old=randomUUID();h.state.jobs.push({id:old,user_id:h.user.id,kind:'exam',set_hash:h.exam,status:'done'});
  if(suffix)h.state.files.add(old+suffix);
  const r=await h.call();a.equal(r.status,200);
  if(suffix){a.equal(r.body.id,old);a.equal(h.state.uploads.length,0);}
  else {a.notEqual(r.body.id,old);a.equal(h.state.jobs.length,2);}
  h.state.verified=false;a.equal((await h.call()).status,403);a.equal((await h.call(randomUUID())).status,404);
 }
 const h=pdfHarness();h.state.jobs.push({id:randomUUID(),user_id:randomUUID(),kind:'exam',set_hash:h.exam,status:'pending'});
 const r=await h.call();a.equal(r.status,200);a.notEqual(r.body.id,h.state.jobs[0].id);
 h.state.jobs[1].status='error';a.notEqual((await h.call()).body.id,r.body.id);
 h.state.readError=true;const uploads=h.state.uploads.length;a.equal((await h.call()).status,503);a.equal(h.state.uploads.length,uploads);
});

// Small hook runner: effects, dependencies, state and cleanup execute without a browser or a dev server.
function hookRuntime(seed={}) {
 const states=[],refs=[],callbacks=[],effects=[];let s=0,r=0,c=0,e=0;
 const changed=(a,b)=>!a||!b||a.length!==b.length||a.some((v,i)=>v!==b[i]);
 const react={...React,useState:init=>{const i=s++;if(!(i in states))states[i]=i in seed?seed[i]:typeof init==='function'?init():init;return [states[i],v=>states[i]=typeof v==='function'?v(states[i]):v];},
  useRef:init=>refs[r++]??=( {current:init}),useCallback:(fn,deps)=>{const i=c++;if(!callbacks[i]||changed(callbacks[i].deps,deps))callbacks[i]={fn,deps};return callbacks[i].fn;},
  useEffect:(fn,deps)=>{const i=e++;if(!effects[i]||changed(effects[i].deps,deps)){effects[i]?.cleanup?.();effects[i]={fn,deps,pending:true};}}};
 const window=new EventTarget(),document=new EventTarget();document.visibilityState='visible';
 return {react,window,document,states,render(fn){s=r=c=e=0;const result=fn();for(const effect of effects)if(effect.pending){effect.pending=false;effect.cleanup=effect.fn();}return result;},cleanup(){effects.forEach(x=>x.cleanup?.());}};
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));
const textOf=node=>node==null?'':Array.isArray(node)?node.map(textOf).join(''):typeof node==='object'?textOf(node.props?.children):String(node);
function find(node,predicate){if(!node||typeof node!=='object')return null;if(predicate(node))return node;for(const child of React.Children.toArray(node.props?.children)){const result=find(child,predicate);if(result)return result;}return null;}

test('round5 pass hook refreshes only visible returns, ignores stale responses and unmounted updates, and removes listeners',async()=>{
 const rt=hookRuntime(),pending=[];let calls=0;
 const usePassInfo=load('lib/usePassInfo.ts',{react:rt.react},{window:rt.window,document:rt.document,fetch:()=>{calls++;return new Promise(resolve=>pending.push(resolve));}}).usePassInfo;
 const render=()=>rt.render(()=>usePassInfo());render();
 rt.document.visibilityState='hidden';rt.document.dispatchEvent(new Event('visibilitychange'));rt.window.dispatchEvent(new Event('focus'));a.equal(calls,1);
 rt.document.visibilityState='visible';rt.document.dispatchEvent(new Event('visibilitychange'));rt.window.dispatchEvent(new Event('focus'));a.equal(calls,3);
 pending[2]({ok:true,json:async()=>({loggedIn:true,passUntil:'2026-12-01'})});await settle();
 pending[0]({ok:true,json:async()=>({loggedIn:true,passUntil:null})});pending[1]({ok:true,json:async()=>({loggedIn:true,passUntil:null})});await settle();
 a.equal(render().info.passUntil,'2026-12-01');
 rt.window.dispatchEvent(new Event('focus'));rt.cleanup();pending[3]({ok:true,json:async()=>({loggedIn:false})});await settle();
 rt.window.dispatchEvent(new Event('focus'));rt.document.dispatchEvent(new Event('visibilitychange'));a.equal(calls,4);a.equal(rt.states[0].passUntil,'2026-12-01');
});

test('round5 returning from payment updates the actual prediction HWP button and preserves generated questions and receipt',async()=>{
 const questions=[{id:randomUUID(),unit:'함수',difficulty:'3',school:'학교'}],receipt=randomUUID();
 const rt=hookRuntime({0:true,1:true,15:questions,16:receipt});let paid=false;
 const globals={window:rt.window,document:rt.document,fetch:async()=>({ok:true,json:async()=>({loggedIn:true,passUntil:paid?'2026-12-01':null})})};
 const usePassInfo=load('lib/usePassInfo.ts',{react:rt.react},globals).usePassInfo;
 const Component=load('app/predict/PredictClient.tsx',{react:rt.react,'@/lib/usePassInfo':{usePassInfo},
  '@/lib/qbPassConfig':{FREE_TRIAL:{questions:30}},'@/lib/questions/handoff':{},'@/components/BundlePassGate':()=>null,
  '@/components/FeatureExplanation':()=>null,'@/lib/pdfDownload':{},'@/lib/hwpPolicy':{hwpPassOnly:()=>true},
  '@/components/QuestionRenderer':()=>null,'@/components/ExamPromoModal':()=>null,
  '@/lib/curriculum':{CURRICULA:[],SUBJECT_UNITS:{},subjectFor:()=>'',unitVariants:()=>[]},
  '@/utils/supabase/client':{createClient:()=>({auth:{getUser:async()=>({data:{user:{id:'member'}}})}})}},globals).default;
 const render=()=>rt.render(()=>Component({richSchools:[]}));render();await settle();let tree=render();
 const hwp=tree=>find(tree,n=>n.type==='button'&&n.props.onClick?.name==='downloadHwp');a.equal(hwp(tree),null);
 paid=true;rt.document.visibilityState='hidden';rt.document.dispatchEvent(new Event('visibilitychange'));
 rt.document.visibilityState='visible';rt.document.dispatchEvent(new Event('visibilitychange'));await settle();tree=render();
 a(hwp(tree));a.equal(hwp(tree).props.disabled,false);a.equal(rt.states[15],questions);a.equal(rt.states[16],receipt);rt.cleanup();
});

test('round5 print payment return updates HWP action and allowance without losing uploaded crops or selections',async()=>{
 const id=randomUUID(),crops=[{id:'crop-1',dataUrl:'data:uploaded-crop',selected:[id],candidates:[{id}],contents:{},images:{}}];
 const rt=hookRuntime({4:crops,7:'pick',8:'crop-1'});let paid=false;
 const globals={window:rt.window,document:rt.document,fetch:async()=>({ok:true,json:async()=>({loggedIn:true,onceLeft:paid?1:0,examLeft:0})})};
 const usePassInfo=load('lib/usePassInfo.ts',{react:rt.react},globals).usePassInfo;
 const Component=load('app/print-transform/PrintTransformClient.tsx',{react:rt.react,'@/lib/usePassInfo':{usePassInfo},
  '@/lib/qbPassConfig':{FREE_TRIAL:{bundle:2},BUNDLE_KEEP_DAYS:30},'@/lib/questions/handoff':{},
  '@/components/question-bank/PassModal':{passLine:p=>'1회권 '+p.onceLeft+'장'},'@/components/BundlePassGate':()=>null,
  '@/components/FeatureExplanation':()=>null,'@/lib/pdfDownload':{},'@/components/QuestionRenderer':()=>null,
  '@/components/ExamPromoModal':()=>null},globals).default;
 const render=()=>rt.render(()=>Component({isLoggedIn:true}));render();await settle();let tree=render();
 const hwp=tree=>find(tree,n=>n.type==='button'&&n.props.onClick?.name==='makeHwp');
 a.match(textOf(hwp(tree)),/이용권 확인/);a.match(textOf(tree),/1회권 0장/);
 paid=true;rt.window.dispatchEvent(new Event('focus'));await settle();tree=render();
 a.doesNotMatch(textOf(hwp(tree)),/이용권 확인/);a.equal(hwp(tree).props.disabled,false);a.match(textOf(tree),/1회권 1장/);
 a.equal(rt.states[4],crops);a.equal(rt.states[4][0].dataUrl,'data:uploaded-crop');a.deepEqual(rt.states[4][0].selected,[id]);rt.cleanup();
});
