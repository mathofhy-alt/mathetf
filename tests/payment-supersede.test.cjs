require('./register.cjs');
const {test}=require('node:test'),a=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const {PGlite}=require('@electric-sql/pglite');
const uid='11111111-1111-4111-8111-111111111111',item='22222222-2222-4222-8222-222222222222';
const id=n=>'order-'+String(n).padStart(32,'0');
const quote=(used=0,total=1000)=>({kind:'cart',amount:total-used,total,used_points:used,points:0,items:[{item_id:item,item_type:'HWP_DOC',title:'검증 자료',price:total}],name:'검증 자료'});
const migration=name=>fs.readFileSync(path.join(__dirname,`../supabase/migrations/20261109_payment_${name}.sql`),'utf8');
async function applySupersede(db,manifest){
 if(!(await db.query('SELECT snapshot_sealed FROM payment_transition')).rows[0].snapshot_sealed){
  const ids=manifest||(await db.query("SELECT payment_id FROM payment_orders WHERE status='pending'")).rows.map(r=>r.payment_id);
  await db.query('SELECT seal_payment_legacy_snapshot($1)',[ids]);
 }
 await db.exec(migration('supersede'));
}
async function harness(t,{legacyCount=0,ready=true,stage='schedule',beforeResolution,rewardPrepared=true,sourceRoot,withPlans=false}={}){
 const db=new PGlite();t.after(()=>db.close());
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
 CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY); CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
 CREATE TABLE profiles(id uuid PRIMARY KEY,earned_points bigint DEFAULT 0,purchased_points bigint DEFAULT 0);
 CREATE TABLE exam_materials(id uuid PRIMARY KEY,title text,price integer,file_type text,school text,content_type text,uploader_id uuid,description text);
 CREATE TABLE private_dbs(id uuid PRIMARY KEY,owner_user_id uuid,title text,price integer);
 CREATE TABLE payment_history(id uuid DEFAULT gen_random_uuid(),user_id uuid,payment_id text,merchant_uid text,amount bigint,points_added bigint,status text);
 CREATE TABLE purchased_items(id uuid DEFAULT gen_random_uuid(),user_id uuid,payment_id text,item_type text,item_id text,title text,price_paid bigint,created_at timestamptz DEFAULT now());
 CREATE TABLE purchases(id uuid DEFAULT gen_random_uuid(),user_id uuid);
 CREATE TABLE point_transactions(id uuid DEFAULT gen_random_uuid(),user_id uuid,type text,amount bigint,description text,related_id uuid);
 CREATE TABLE cart_items(user_id uuid,item_id uuid);
 CREATE TABLE feature_usage(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,user_email text,feature text,title text,
   question_count integer,set_hash text,qb_sheet_purchase_id text,created_at timestamptz DEFAULT now());
 CREATE TABLE pdf_jobs(id uuid PRIMARY KEY,user_id uuid,kind text,title text,stamp boolean,status text DEFAULT 'pending',
   question_ids uuid[],set_hash text,plan_charge text,retain_until timestamptz,hwp_ready boolean DEFAULT false,
   pdf_delivered boolean DEFAULT false,receipt_id uuid,created_at timestamptz DEFAULT now());
 CREATE TABLE bundle_selections(id uuid PRIMARY KEY,user_id uuid,kind text,question_ids uuid[]);
 CREATE TABLE qb_usage(id uuid DEFAULT gen_random_uuid(),user_id uuid,exam_id uuid,created_at timestamptz DEFAULT now());
 CREATE VIEW plan_usage AS SELECT id,user_id,feature,title,created_at,qb_sheet_purchase_id FROM feature_usage;
 `);
 if(withPlans){
  await db.exec(`ALTER TABLE bundle_selections ADD COLUMN created_at timestamptz DEFAULT now();
   CREATE TABLE folders(id uuid PRIMARY KEY,user_id uuid);
   CREATE TABLE user_items(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,folder_id uuid,type text,name text,reference_id uuid,details jsonb,created_at timestamptz DEFAULT now());
   CREATE TABLE question_bank_events(event text,event_id uuid,source text,session_id uuid,user_id uuid,exam_id uuid,question_count int);
   CREATE SCHEMA storage; CREATE TABLE storage.objects(id uuid DEFAULT gen_random_uuid(),bucket_id text,name text,created_at timestamptz,updated_at timestamptz);`);
  const {applyMigration}=require('./migration-helper.cjs');
  for(const file of ['20261008_saved_exam_limit.sql','20261108_plans_final.sql'])await applyMigration(db,fs.readFileSync(path.join(__dirname,'../supabase/migrations',file),'utf8'));
 }
 for(const file of ['202609200002_payment_orders.sql','20260926_retire_seller_settlements.sql'])await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations',file),'utf8'));
 await db.query('INSERT INTO auth.users VALUES($1)',[uid]);await db.query('INSERT INTO profiles(id,earned_points) VALUES($1,1000)',[uid]);
 await db.query("INSERT INTO exam_materials(id,title,price,file_type) VALUES($1,'검증 자료',1000,'HWP')",[item]);await db.query('INSERT INTO cart_items VALUES($1,$2)',[uid,item]);
 for(let n=1;n<=legacyCount;n++)await db.query("INSERT INTO payment_orders(payment_id,user_id,kind,amount,total,items,name,created_at) VALUES($1,$2,'cart',1000,1000,$3,'legacy',now()-interval '1 day')",[id(n),uid,JSON.stringify(quote().items)]);
 await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261005_submission_reward.sql'),'utf8'));
 if(rewardPrepared)await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261109_submission_reward_prepare.sql'),'utf8'));
 await db.exec(migration('transition'));
 if(stage!=='legacy')await applySupersede(db);
 if(beforeResolution)await beforeResolution(db);
 if(!['legacy','supersede'].includes(stage))await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261109_payment_resolution.sql'),'utf8'));
 // PGlite runs the production SQL, with only the unavailable extension workers
 // replaced by local SQL stubs. They capture the real enqueue/schedule inputs.
 await db.exec(`CREATE SCHEMA extensions; CREATE SCHEMA cron; CREATE SCHEMA net;
 CREATE FUNCTION extensions.gen_random_bytes(n integer) RETURNS bytea LANGUAGE sql AS $$ SELECT decode(repeat('ab',n),'hex') $$;
 CREATE TABLE cron.job(jobid bigint GENERATED ALWAYS AS IDENTITY,jobname text UNIQUE,schedule text,command text,active boolean DEFAULT true);
 CREATE FUNCTION cron.schedule(job_name text,expression text,sql_command text) RETURNS bigint LANGUAGE sql AS $$
 INSERT INTO cron.job(jobname,schedule,command) VALUES(job_name,expression,sql_command)
 ON CONFLICT(jobname) DO UPDATE SET schedule=excluded.schedule,command=excluded.command RETURNING jobid $$;
 CREATE TABLE net.http_request_queue(id bigint GENERATED ALWAYS AS IDENTITY,url text,headers jsonb,body jsonb,timeout_milliseconds integer);
 CREATE TABLE net._http_response(id bigint,status_code integer);
 CREATE FUNCTION net.http_post(url text,body jsonb DEFAULT '{}',params jsonb DEFAULT '{}',headers jsonb DEFAULT '{}',timeout_milliseconds integer DEFAULT 1000)
 RETURNS bigint LANGUAGE sql AS $$ INSERT INTO net.http_request_queue(url,body,headers,timeout_milliseconds) VALUES(url,body,headers,timeout_milliseconds) RETURNING id $$;`);
 const scheduleSql=fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261109_payment_schedule.sql'),'utf8');
 a.equal((scheduleSql.match(/^CREATE EXTENSION IF NOT EXISTS /gm)||[]).length,3);
 if(stage==='schedule')await db.exec(scheduleSql.replace(/^CREATE EXTENSION IF NOT EXISTS (pgcrypto|pg_cron|pg_net).*;\r?$/gm,''));
 const provider=new Map(),calls=[],cache=new Map(),providerEnv={PORTONE_API_SECRET:'local-only'};let cancelMode='ok',authUser=uid,beforeComplete,beforeCreate,queueError=false,runError=false,now=Date.now(),beforeProfileUpdate,lookupStatus;
 class Clock extends Date { static now(){return now;} }
 const safe=s=>{if(!/^[a-z_][a-z0-9_]*$/.test(s))throw Error(s);return s;};
 const sb={auth:{admin:{getUserById:async()=>({data:{user:{id:uid}}})}},from(table){safe(table);let columns='*',del=false,max,offset=0,one=false,insert,update;const conditions=[],values=[],sort=[];
  const q={insert(body){insert=body;return q;},update(body){update=body;return q;},is(k,v){a.equal(v,null);conditions.push(`${safe(k)} IS NULL`);return q;},or(filter){if(filter==='manual_review_required.eq.true,and(legacy_reconciliation.eq.true,status.eq.pending)')conditions.push("(manual_review_required=true OR (legacy_reconciliation=true AND status='pending'))");else{a.equal(filter,'and(legacy_reconciliation.eq.true,status.in.(pending,closed)),manual_review_required.eq.true,refund_status.eq.pending,review_reason.eq.bundle_entitlement_review');conditions.push("((legacy_reconciliation=true AND status IN ('pending','closed')) OR manual_review_required=true OR refund_status='pending' OR review_reason='bundle_entitlement_review')");}return q;},gt(k,v){values.push(v);conditions.push(`${safe(k)}>$${values.length}`);return q;},gte(k,v){values.push(v);conditions.push(`${safe(k)}>=$${values.length}`);return q;},select(c='*'){columns=c;return q;},eq(k,v){values.push(v);conditions.push(`${safe(k)}=$${values.length}`);return q;},in(k,ids){values.push(ids);conditions.push(`${safe(k)}=ANY($${values.length})`);return q;},order(k,options={ascending:true}){sort.push(safe(k)+(options.ascending?' ASC':' DESC'));return q;},limit(n){max=n;return q;},range(from,to){offset=from;max=to-from+1;return q;},delete(){del=true;return q;},single(){one=true;return q;},maybeSingle(){one=true;return q;},then(resolve,reject){
   if(max===0)calls.push({probe:table,column:columns});
   const bound=v=>{values.push(v);return '$'+values.length;};
   const prefix=insert?`INSERT INTO ${table}(${Object.keys(insert).map(safe).join(',')}) VALUES(${Object.values(insert).map(bound).join(',')})`
     :update?`UPDATE ${table} SET ${Object.entries(update).map(([k,v])=>safe(k)+'='+bound(v)).join(',')}`:del?'DELETE FROM '+table:'SELECT '+columns+' FROM '+table;
   const sql=prefix+(!insert&&conditions.length?' WHERE '+conditions.join(' AND '):'')+(!insert&&!update&&sort.length?' ORDER BY '+sort.join(','):'')+(!insert&&!update&&max!==undefined?' LIMIT '+Number(max):'')+(offset?' OFFSET '+offset:'')+(insert||update?' RETURNING '+columns:'');
   const execute=async()=>{if(update&&table==='profiles'&&beforeProfileUpdate){const f=beforeProfileUpdate;beforeProfileUpdate=null;await f();}return db.query(sql,values);};
   // PostgREST serializes timestamps; PGlite itself returns Date instances.
   return execute().then(r=>({data:JSON.parse(JSON.stringify(one?r.rows[0]||null:r.rows)),error:null}),e=>({data:null,error:{code:e.code,message:e.message}})).then(resolve,reject);
  }};return q;},async rpc(name,args){calls.push({rpc:name,args});
   if((queueError&&name==='claim_payment_reconciliation_v3')||(runError&&name==='record_payment_reconciliation_run'))return {data:null,error:{code:'XX000'}};
   if(name==='complete_payment_order_v2'&&beforeComplete){const f=beforeComplete;beforeComplete=null;await f();}
   if(name==='create_payment_order'&&beforeCreate){const f=beforeCreate;beforeCreate=null;await f();}
   try{const vals=Object.values(args),call=`${safe(name)}(${vals.map((_,i)=>'$'+(i+1)).join(',')})`;const r=await db.query(name.startsWith('claim_payment_reconciliation')?`SELECT * FROM ${call}`:`SELECT ${call} data`,vals);return {data:name.startsWith('claim_payment_reconciliation')?r.rows:r.rows[0].data,error:null};}
   catch(e){return {data:null,error:{code:e.code,message:e.message}};}
  }};
 class Response {constructor(body,options){this.body=body;this.status=options?.status||200;}static json(body,options){return new Response(body,options);}}
 const saved=new Map(),browser={location:{origin:'http://local'},dispatchEvent(){},confirm:()=>true,PortOne:{requestPayment:async order=>{
  calls.push({sdk:order});provider.set(order.paymentId,{id:order.paymentId,status:'PAID',currency:'KRW',amount:{total:order.totalAmount},customer:{id:uid},customData:{orderId:order.paymentId}});return {};
 }}};
 const fakeFetch=async(url,options={})=>{
  if(url==='/api/payments/orders'||url==='/api/payments/complete'){
   const body=JSON.parse(options.body);calls.push({browserUrl:url,body});
   const response=url.endsWith('/orders')?await orders(body):await complete(body);
   return {ok:response.status===200,json:async()=>JSON.parse(JSON.stringify(response.body))};
  }
  a.match(url,/^https:\/\/api.portone.io\/payments\/order-[0-9a-f]{32}(\/cancel)?$/);a.equal(options.headers.Authorization,'PortOne local-only');
  const paymentId=url.split('/')[4],p=provider.get(paymentId);calls.push({url,options});
  if(lookupStatus)return {ok:false,status:lookupStatus,json:async()=>({})};
  if(!p)return {ok:false,status:404,json:async()=>({})};
  if(p.lookupStatus)return {ok:false,status:p.lookupStatus,json:async()=>({})};
  if(url.endsWith('/cancel')){
   a.equal(JSON.parse(options.body).amount,undefined);a.equal(options.headers['Idempotency-Key'],`"full-refund-${paymentId}"`);
   if(cancelMode==='fail')return {ok:false,status:503,json:async()=>({})};
   if(typeof cancelMode==='number')return {ok:false,status:cancelMode,json:async()=>({})};
   p.status='CANCELLED';
   if(cancelMode==='lost')throw Error('lost response after cancellation');
   return {ok:true,status:200,json:async()=>({cancellation:{id:'cancel-'+paymentId,status:'SUCCEEDED'}})};
  }
  return {ok:true,status:200,json:async()=>({...p})};
 };
 function load(file){
  const root=sourceRoot||path.resolve(__dirname,'..');const full=path.resolve(root,file);if(cache.has(full))return cache.get(full).exports;
  const mod={exports:{}};cache.set(full,mod);
  const code=ts.transpileModule(fs.readFileSync(full,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
  vm.runInNewContext(code,{module:mod,exports:mod.exports,process:{env:providerEnv},AbortSignal,Event,window:browser,navigator:{},localStorage:{getItem:k=>saved.get(k)||null,setItem:(k,v)=>saved.set(k,v),removeItem:k=>saved.delete(k)},Set,Map,Date:Clock,console:{error(){}},crypto:require('node:crypto').webcrypto,fetch:fakeFetch,
   require:n=>n==='@/lib/schemaCapabilities'?load('src/lib/schemaCapabilities.ts'):n==='next/cache'?{revalidatePath(){}}:n==='next/server'?{NextResponse:Response}:n==='@/utils/supabase/server'?{createClient:()=>({auth:{getUser:async()=>({data:{user:authUser?{id:authUser}:null}})}})}:n==='@/lib/typedGrant'?{grantTypedFile:async()=>({status:'working'})}:n==='@/lib/sms'?{sendNotice:async()=>{throw Error('SMS must remain disabled in tests');}}:n==='@/utils/admin-auth'?{requireAdmin:async()=>authUser===uid?{authorized:true,user:{id:uid}}:{authorized:false,response:Response.json({message:'Forbidden'},{status:403})}}:n==='@/utils/supabase/server-admin'?{createAdminClient:()=>sb}:n.startsWith('@/lib/payments/')?load('src/lib/payments/'+n.split('/').pop()+'.ts'):n.startsWith('.')?load(path.relative(root,path.resolve(path.dirname(full),n+'.ts'))):n.startsWith('@/')?require(n):require(n)});
  return mod.exports;
 }
 const read=async paymentId=>(await db.query('SELECT * FROM payment_orders WHERE payment_id=$1',[paymentId])).rows[0];
 async function seed(paymentId,q=quote(),status='READY',age=0){
  await db.query('INSERT INTO payment_orders(payment_id,user_id,kind,amount,total,used_points,items,name,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[paymentId,uid,'cart',q.amount,q.total,q.used_points,JSON.stringify(q.items),q.name,new Date(Date.now()-age).toISOString()]);
  provider.set(paymentId,{id:paymentId,status,currency:'KRW',amount:{total:q.amount},customer:{id:uid},customData:{orderId:paymentId}});
 }
 const complete=body=>load('src/lib/payments/complete.ts').completeOrder({json:async()=>body});
 const orders=body=>load('src/app/api/payments/orders/route.ts').POST({json:async()=>({kind:'cart',items:[{item_id:item}],usedPoints:0,requestId:require('node:crypto').randomUUID(),...body})});
 const create=async(paymentId,previous=[],q=quote(),consent=true,requestId=require('node:crypto').randomUUID(),snapshot)=>{
  const latest=snapshot||(await db.query("SELECT payment_id,status FROM payment_orders ORDER BY created_at DESC,payment_id DESC LIMIT 1")).rows[0]||{};
  return sb.rpc('create_payment_order',{p_payment_id:paymentId,p_user_id:uid,p_quote:q,p_previous_payment_ids:previous,p_replace_open:consent,p_request_id:requestId,p_snapshot_id:latest.payment_id||null,p_snapshot_status:latest.status||null});
 };
 const webhook=paymentId=>load('src/app/api/payments/webhook/route.ts').POST({json:async()=>({type:'Transaction.Paid',data:{paymentId}})});
 const cron=(secret,method='GET',dispatchId)=>load('src/app/api/cron/payment-reconcile/route.ts')[method]({headers:{get:name=>name==='authorization'?secret:name==='x-payment-reconcile-dispatch'?dispatchId||null:null}});
 const scheduledRun=async()=>{
  const requestId=(await db.query('SELECT enqueue_payment_reconciliation() id')).rows[0].id;
  const request=(await db.query('SELECT * FROM net.http_request_queue WHERE id=$1',[requestId])).rows[0];
  const response=await cron(request.headers.Authorization,'POST',request.headers['X-Payment-Reconcile-Dispatch']);
  await db.query('INSERT INTO net._http_response VALUES($1,$2)',[requestId,response.status]);return response;
 };
 const adminGet=(params='')=>load('src/app/api/admin/payment-reviews/route.ts').GET({nextUrl:new URL('http://local/?'+params)});
 const adminResolve=body=>load('src/app/api/admin/payment-reviews/route.ts').POST({json:async()=>body});
 if(ready&&stage==='schedule'){a.equal((await scheduledRun()).status,200);calls.length=0;}
 return {db,sb,provider,calls,seed,read,complete,orders,create,webhook,cron,scheduledRun,adminGet,adminResolve,load,useSource:root=>{sourceRoot=root;cache.clear();},browser,saved,pay:input=>load('src/lib/payments/client.ts').payOrder({id:uid,email:'test@example.invalid'},{kind:'cart',items:[{item_id:item}],usedPoints:0,...input}),advance:ms=>now+=ms,hide:purchaseId=>load('src/app/mypage/actions.ts').deletePurchase(purchaseId),approve:()=>load('src/lib/approveSubmission.ts').approveSubmission(item,{sms:false}),setCancel:v=>cancelMode=v,setAuth:v=>authUser=v,setBeforeProfileUpdate:f=>beforeProfileUpdate=f,setBeforeComplete:f=>beforeComplete=f,setBeforeCreate:f=>beforeCreate=f,setQueueError:v=>queueError=v,setRunError:v=>runError=v,setProviderSecret:v=>providerEnv.PORTONE_API_SECRET=v,setLookupStatus:v=>lookupStatus=v,count:async(table)=>(await db.query('SELECT count(*)::int n FROM '+safe(table))).rows[0].n};
}

for(const failure of ['none','supersede','resolution'])test(`code-first ${failure}: real old-schema completion and pass reads survive absent/failed migration`,async t=>{
 const h=await harness(t,{stage:failure==='resolution'?'supersede':'legacy'});
 if(failure!=='none'){
  if(failure==='supersede')await h.db.query('SELECT seal_payment_legacy_snapshot($1)',[[]]);
  const file=`20261109_payment_${failure}.sql`;
  const broken=fs.readFileSync(path.join(__dirname,'../supabase/migrations',file),'utf8').replace(/COMMIT;/,'SELECT 1/0; COMMIT;');
  await a.rejects(h.db.exec(broken),/division by zero/);await h.db.exec('ROLLBACK');
 }
 const pass=()=>h.load('src/lib/qbPass.ts').passStatus({id:uid});
 a.ok((await pass()).freeExamLeft>0);
 // Existing teachers and exam/sheet pass users retain the deployed read path.
 for(const type of ['QB_PASS','QB_EXAM','QB_SHEET','QB_ONCE'])await h.db.query("INSERT INTO purchased_items(user_id,item_type,item_id,created_at) VALUES($1,$2,'term',now()-interval '1 minute')",[uid,type]);
 const status=await pass();a.equal(status.unlimited,true);a.ok(status.examLeft>0);a.equal(status.sheetLeft,1);a.equal(status.onceLeft,1);
 await h.seed(id(1),quote(1000),'READY');
 a.equal((await h.complete({paymentId:id(1)})).body.success,true);
 await h.seed(id(2),quote(),'PAID');
 a.equal((await h.complete({paymentId:id(2)})).body.success,true);
 a.equal((await h.complete({paymentId:id(2)})).body.alreadyProcessed,true);
 a.equal(await h.count('payment_history'),2);a.equal(await h.count('point_transactions'),1);
 a.equal((await h.db.query('SELECT earned_points FROM profiles')).rows[0].earned_points,0);
 a.equal(h.calls.some(c=>c.rpc==='complete_payment_order_v2'||c.rpc==='defer_payment_reconciliation'),false);
 a.equal((await h.orders({})).status,200);a.equal(await h.count('payment_orders'),3);
 a.equal(h.calls.filter(c=>c.probe==='plan_usage').length,1);a.equal(h.calls.filter(c=>c.probe==='payment_orders'&&c.column==='legacy_resolution').length,1);
});

test('negative schema caches expire after five seconds; migration during the cache preserves new purchase IDs and legacy review',async t=>{
 const h=await harness(t,{stage:'legacy'});
 const capability=()=>h.load('src/lib/schemaCapabilities.ts').hasSchemaCapability(h.sb,'paymentResolution');
 const pass=()=>h.load('src/lib/qbPass.ts').passStatus({id:uid});
 a.equal(await capability(),false);await pass();
 await h.seed(id(1),quote(),'PAID');
 await applySupersede(h.db);
 await h.db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261109_payment_resolution.sql'),'utf8'));
 const b='33333333-3333-4333-8333-333333333333';
 await h.db.query("INSERT INTO purchased_items(id,user_id,item_type,created_at) VALUES($1,$2,'QB_ONCE',now()-interval '2 minutes')",[b,uid]);
 // A's retained audit usage must not consume B while a negative cache is live.
 await h.db.query("INSERT INTO feature_usage(user_id,feature,qb_once_purchase_id,created_at) VALUES($1,'plan_once_bundle','cancelled-A',now()-interval '1 minute')",[uid]);
 a.equal((await pass()).onceLeft,1);a.equal(await capability(),false);
 a.equal((await h.complete({paymentId:id(1)})).body.code,'PAYMENT_MANUAL_REVIEW');a.equal(await h.count('payment_history'),0);
 h.advance(5001);a.equal(await capability(),true);a.equal((await pass()).onceLeft,1);
 a.equal(h.calls.filter(c=>c.probe==='payment_orders').length,2);a.equal(h.calls.filter(c=>c.probe==='plan_usage').length,2);
 // The reviewed goods remain protected; use unrelated goods to test new-schema completion.
 await h.db.query("INSERT INTO exam_materials(id,title,price,file_type) VALUES($1,'독립 자료',1000,'HWP')",[b]);
 const independent=quote();independent.items[0].item_id=b;
 await h.seed(id(2),independent,'PAID');a.equal((await h.complete({paymentId:id(2)})).body.success,true);
 a.equal(h.calls.some(c=>c.rpc==='complete_payment_order_v2'),true);
 a.equal((await h.orders({items:[{item_id:b}]})).status,200); // unrelated deployed creation remains available before cutover
});

test('a stale pre-migration order snapshot is refreshed before modern fulfillment',async t=>{
 const h=await harness(t,{stage:'legacy'});await h.seed(id(1),quote(),'PAID');const stale=await h.read(id(1));
 await applySupersede(h.db);
 await h.db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261109_payment_resolution.sql'),'utf8'));
 await a.rejects(h.load('src/lib/payments/reconcile.ts').reconcileOrder(h.sb,stale),/PAYMENT_MANUAL_REVIEW/);
 a.equal(await h.count('payment_history'),0);a.equal(h.calls.some(c=>c.rpc==='complete_payment_order_v2'),false);
});

test('legacy completion failure is retried without granting success, clearing cart or refunding',async t=>{
 const h=await harness(t,{stage:'legacy'});await h.seed(id(1),quote(),'PAID');
 const rpc=h.sb.rpc;h.sb.rpc=async(name,args)=>name==='complete_payment_order'?{data:null,error:{code:'XX000'}}:rpc(name,args);
 const res=await h.complete({paymentId:id(1)});a.equal(res.status,503);a.equal(res.body.code,'ORDER_RETRY');
 a.equal(await h.count('cart_items'),1);a.equal(await h.count('payment_history'),0);a.equal(h.calls.some(c=>c.url?.endsWith('/cancel')),false);
});

test('legacy pending approval still validates owner, amount and currency before the old RPC',async t=>{
 const h=await harness(t,{stage:'legacy'});await h.seed(id(1),quote(),'PAID');
 h.provider.get(id(1)).amount.total=1;a.equal((await h.complete({paymentId:id(1)})).status,503);
 a.equal(h.calls.some(c=>c.rpc==='complete_payment_order'),false);a.equal(await h.count('payment_history'),0);
});

test('capability probes coalesce concurrent requests, cache positive results briefly and do not hide infrastructure errors',async t=>{
 const h=await harness(t);const check=()=>h.load('src/lib/schemaCapabilities.ts').hasSchemaCapability(h.sb,'oncePurchaseUsage');
 a.deepEqual(await Promise.all(Array.from({length:10},check)),Array(10).fill(true));
 a.equal(h.calls.filter(c=>c.probe==='plan_usage').length,1);h.advance(5001);a.equal(await check(),true);
 a.equal(h.calls.filter(c=>c.probe==='plan_usage').length,2);
 h.advance(5001);const from=h.sb.from;h.sb.from=()=>({select(){return this;},limit:async()=>({error:{code:'42501'}})});
 await a.rejects(check(),/SCHEMA_CHECK_RETRY/);h.sb.from=from;a.equal(await check(),true);
});

for(const stage of ['supersede','resolution','schedule'])test(`migration-first ${stage}: old SELECT and completion contracts remain valid while checkout stays gated`,async t=>{
 const h=await harness(t,{stage,ready:false,legacyCount:1});
 // This is the deployed qbPass projection, with no dependency on the new ID.
 await h.db.query('SELECT feature,title,created_at,qb_sheet_purchase_id FROM plan_usage');
 a.ok((await h.sb.rpc('complete_payment_order',{p_payment_id:id(1),p_user_id:uid})).error);
 a.equal(await h.count('payment_history'),0); // old caller must never mistake review for delivery
 await h.seed(id(2),quote(),'PAID');
 const old=await h.sb.rpc('complete_payment_order',{p_payment_id:id(2),p_user_id:uid});
 a.equal(old.error,null);a.equal(old.data.status,'completed');
 a.equal((await h.complete({paymentId:id(2)})).body.alreadyProcessed,true);
 const pass=await h.load('src/lib/qbPass.ts').passStatus({id:uid});a.ok(pass.freeExamLeft>0);
 a.equal((await h.orders({})).status,200);a.equal(await h.count('payment_history'),1);
});

test('failed schedule transaction leaves existing completion/pass reads active and new checkout closed',async t=>{
 const h=await harness(t,{stage:'resolution'});
 const sql=fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261109_payment_schedule.sql'),'utf8')
  .replace(/^CREATE EXTENSION IF NOT EXISTS (pgcrypto|pg_cron|pg_net).*;\r?$/gm,'').replace(/COMMIT;/,'SELECT 1/0; COMMIT;');
 await a.rejects(h.db.exec(sql),/division by zero/);await h.db.exec('ROLLBACK');
 await h.seed(id(1),quote(),'PAID');a.equal((await h.complete({paymentId:id(1)})).body.success,true);
 a.ok((await h.load('src/lib/qbPass.ts').passStatus({id:uid})).freeExamLeft>0);
 a.equal((await h.orders({})).status,200);a.equal((await h.sb.rpc('payment_checkout_ready',{})).data,false);
});

for(const channel of ['complete','webhook','return'])test(`READY -> replacement -> late PAID via ${channel}: full refund, exactly one grant`,async t=>{
 const h=await harness(t);await h.seed(id(1));
 const choice=await h.orders({});a.equal(choice.body.code,'PAYMENT_RETRY_CHOICE');a.equal(await h.count('payment_orders'),1);
 const created=await h.orders({supersedePaymentId:id(1),replaceOpen:true});a.equal(created.status,200);a.ok(created.body.paymentId);const newId=created.body.paymentId;
 a.equal((await h.read(id(1))).status,'superseded');a.equal((await h.read(id(1))).superseded_by,newId);
 const q=await h.read(newId);h.provider.set(newId,{id:newId,status:'PAID',currency:'KRW',amount:{total:q.amount},customer:{id:uid},customData:{orderId:newId}});
 a.equal((await h.complete({paymentId:newId})).body.success,true);
 h.provider.get(id(1)).status='PAID';
 const result=channel==='webhook'?await h.webhook(id(1)):await h.complete({paymentId:id(1)});
 a.equal(channel==='webhook'?result.status:result.body.code,channel==='webhook'?200:'PAYMENT_REFUNDED');
 a.equal((await h.read(id(1))).refund_status,'succeeded');a.equal(h.provider.get(id(1)).status,'CANCELLED');
 a.equal(await h.count('purchased_items'),1);a.equal(await h.count('payment_history'),1);a.equal(await h.count('point_transactions'),0);
 await h.complete({paymentId:id(1)});a.equal(h.calls.filter(c=>c.url?.endsWith('/cancel')).length,1);
 a.equal((await h.db.query("SELECT amount,outcome FROM payment_refund_attempts WHERE outcome='succeeded'")).rows[0].amount,1000);
});
test('changed zero-won order is permanently closed before card replacement; delayed completion cannot spend points',async t=>{
 const h=await harness(t);await h.seed(id(1),quote(1000));
 const closed=await h.complete({paymentId:id(1),retryInput:{items:[{item_id:item}],usedPoints:0}});a.equal(closed.body.code,'PAYMENT_SUPERSEDED');
 a.equal((await h.read(id(1))).status,'superseded');
 const created=await h.orders({supersedePaymentId:id(1)});const newId=created.body.paymentId;a.ok(newId);
 h.provider.set(newId,{id:newId,status:'PAID',currency:'KRW',amount:{total:1000},customer:{id:uid},customData:{orderId:newId}});
 a.equal((await h.complete({paymentId:newId})).body.success,true);
 for(let i=0;i<3;i++)a.equal((await h.complete({paymentId:id(1)})).body.code,'PAYMENT_SUPERSEDED');
 a.equal((await h.db.query('SELECT earned_points FROM profiles')).rows[0].earned_points,1000);
 a.equal(await h.count('purchased_items'),1);a.equal(await h.count('point_transactions'),0);
 a.equal(h.calls.filter(c=>c.url?.endsWith('/cancel')).length,0);
});
test('card approved after points were spent: fulfillment rollback and full cancellation',async t=>{
 const h=await harness(t);await h.seed(id(1),quote(1000,2000),'PAID');
 const otherQuote=quote(1000,2000);otherQuote.items[0].item_id='44444444-4444-4444-8444-444444444444';await h.seed(id(2),otherQuote,'PAID');
 a.equal((await h.complete({paymentId:id(1)})).body.success,true);
 a.equal((await h.complete({paymentId:id(2)})).body.code,'PAYMENT_REFUNDED');
 const second=await h.read(id(2));a.equal(second.supersede_reason,'insufficient_points');a.equal(second.refund_status,'succeeded');
 a.equal((await h.db.query('SELECT earned_points FROM profiles')).rows[0].earned_points,0);
 a.equal(await h.count('purchased_items'),1);a.equal(await h.count('payment_history'),1);a.equal(await h.count('point_transactions'),1);
});
test('grant failure rolls back earlier history/point changes before refund',async t=>{
 const h=await harness(t);await h.seed(id(1),quote(500,1000),'PAID');
 await h.db.exec("CREATE FUNCTION fail_grant() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected'; END; $$; CREATE TRIGGER fail_grant BEFORE INSERT ON purchased_items FOR EACH ROW EXECUTE FUNCTION fail_grant();");
 a.equal((await h.complete({paymentId:id(1)})).body.code,'PAYMENT_REFUNDED');
 for(const table of ['purchased_items','payment_history','point_transactions'])a.equal(await h.count(table),0);
 a.equal((await h.db.query('SELECT earned_points FROM profiles')).rows[0].earned_points,1000);
});
for(const mode of ['fail','lost'])test(`cancellation ${mode}: durable pending state; authenticated cron recovers without browser`,async t=>{
 const h=await harness(t);await h.seed(id(1),quote(500),'PAID');await h.db.exec('UPDATE profiles SET earned_points=0');h.setCancel(mode);
 const res=await h.complete({paymentId:id(1)});a.equal(res.body.code,'PAYMENT_REFUND_PENDING');a.equal((await h.read(id(1))).refund_status,'pending');
 a.equal(await h.count('purchased_items'),0);a.equal((await h.cron(null)).status,401);a.equal((await h.cron('Bearer wrong')).status,401);
 h.setCancel('ok');await h.db.exec("UPDATE payment_orders SET reconcile_after=now()-interval '1 minute'");
 const recovered=await h.cron('Bearer '+'ab'.repeat(32));a.equal(recovered.status,200);a.equal((await h.read(id(1))).refund_status,'succeeded');
 a.equal(h.calls.filter(c=>c.url?.endsWith('/cancel')).length,mode==='lost'?1:2);
});
test('server discovers pending checkout without local pointer; PAID is recovered instead of replaced',async t=>{
 const h=await harness(t);await h.seed(id(1),quote(),'PAID');
 const r=await h.orders({replaceOpen:true});a.equal(r.body.recoverPaymentId,id(1));a.equal(await h.count('payment_orders'),1);a.equal(await h.count('purchased_items'),1);
});
test('competing creates and a replayed replacement recover the winner',async t=>{
 const h=await harness(t);const q=quote();
 const create=(paymentId,previous=[])=>h.create(paymentId,previous,q);
 const [x,y]=await Promise.all([create(id(1)),create(id(2))]);a.equal(x.error,null);a.equal(y.error,null);a.equal(await h.count('payment_orders'),1);a.equal(y.data.recoverPaymentId,id(1));
 a.equal((await create(id(3),[id(1)])).data.paymentId,id(3));a.equal((await create(id(4),[id(1)])).data.recoverPaymentId,id(3));a.equal(await h.count('payment_orders'),2);
 await h.sb.rpc('complete_payment_order',{p_payment_id:id(3),p_user_id:uid});
 a.equal((await create(id(5),[id(1)])).data.recoverPaymentId,id(3));a.equal(await h.count('payment_orders'),2);
});
test('completion racing replacement cannot grant superseded order; completion winner prevents replacement',async t=>{
 const h=await harness(t);await h.seed(id(1),quote(),'PAID');
 h.setBeforeComplete(async()=>{const r=await h.create(id(2),[id(1)]);a.equal(r.error,null);});
 a.equal((await h.complete({paymentId:id(1)})).body.code,'PAYMENT_REFUNDED');a.equal(await h.count('purchased_items'),0);
 a.equal((await h.sb.rpc('complete_payment_order',{p_payment_id:id(2),p_user_id:uid})).error,null);
 const r=await h.create(id(3),[id(2)]);a.equal(r.data.recoverPaymentId,id(2));a.equal(await h.count('payment_orders'),2);
});
test('zero-won webhook cannot fulfill; mismatched paid details cannot fulfill or refund',async t=>{
 const h=await harness(t);await h.seed(id(1),quote(1000));a.equal((await h.webhook(id(1))).status,200);a.equal(await h.count('purchased_items'),0);
 await h.seed(id(2),quote(),'PAID');h.provider.get(id(2)).amount.total=1;
 a.equal((await h.complete({paymentId:id(2)})).body.code,'PAYMENT_MANUAL_REVIEW');a.equal(await h.count('purchased_items'),0);a.equal(h.calls.filter(c=>c.url?.endsWith('/cancel')).length,0);
 h.setAuth('33333333-3333-4333-8333-333333333333');a.equal((await h.complete({paymentId:id(2)})).status,404);
});
test('new RPCs and refund ledger reject direct authenticated access',async t=>{
 const h=await harness(t);
 for(const sql of ["SELECT create_payment_order('x','"+uid+"','{}','{}',true,'"+uid+"',NULL,NULL)","SELECT supersede_payment_order('x','"+uid+"','x')","SELECT record_payment_refund('x','pending')","SELECT claim_payment_reconciliation(5)","SELECT * FROM payment_refund_attempts"]){
  await a.rejects(h.db.exec('SET ROLE authenticated; '+sql));await h.db.exec('RESET ROLE');
 }
});
test('replacement insert failure rolls back supersession; recent replacement requires consent inside SQL',async t=>{
 const h=await harness(t);await h.seed(id(1));
 const create=(q,consent)=>h.create(id(2),[id(1)],q,consent);
 const choice=await create(quote(),false);a.equal(choice.data.choiceRequired,true);a.equal((await h.read(id(1))).status,'pending');
 const failed=await create({...quote(),amount:-1},true);a.ok(failed.error);a.equal((await h.read(id(1))).status,'pending');a.equal(await h.count('payment_orders'),1);
});
test('lost create response replays completed order; create+completion during stale snapshot cannot make another charge',async t=>{
 const h=await harness(t);const requestId=require('node:crypto').randomUUID();
 a.equal((await h.create(id(1),[],quote(),true,requestId)).data.paymentId,id(1));
 await h.sb.rpc('complete_payment_order',{p_payment_id:id(1),p_user_id:uid});
 a.equal((await h.create(id(2),[],quote(),true,requestId)).data.recoverPaymentId,id(1));
 a.equal((await h.create(id(3),[],quote(),true,require('node:crypto').randomUUID(),{})).data.recoverPaymentId,id(1));
 a.equal(await h.count('payment_orders'),1);a.equal(await h.count('purchased_items'),1);
});

test('old READY/404 never imply replacement consent, and unselected normal payment is not cancelled',async t=>{
 const h=await harness(t);await h.seed(id(1),quote(),'READY',86400000);
 a.equal((await h.orders({})).body.code,'PAYMENT_RETRY_CHOICE');
 const denied=await h.create(id(2),[id(1)],quote(),false);a.equal(denied.data.choiceRequired,true);
 a.equal((await h.read(id(1))).status,'pending');
 h.provider.delete(id(1));a.equal((await h.complete({paymentId:id(1)})).body.code,'PAYMENT_RETRY_CHOICE');
 // A separate checkout is explicitly selected. The first is still independent.
 await h.seed(id(3),quote(),'READY');
 const created=await h.orders({supersedePaymentId:id(3),replaceOpen:true});a.ok(created.body.paymentId);
 a.equal((await h.read(id(1))).status,'pending');
 h.provider.set(id(1),{id:id(1),status:'PAID',currency:'KRW',amount:{total:1000},customer:{id:uid},customData:{orderId:id(1)}});
 await h.db.exec("UPDATE payment_orders SET reconcile_after=now()-interval '1 minute'");
 a.equal((await h.cron('Bearer '+'ab'.repeat(32),'POST')).status,200);
 a.equal((await h.read(id(1))).status,'completed');a.equal(h.provider.get(id(1)).status,'PAID');
 a.equal(h.calls.filter(c=>c.url?.endsWith('/cancel')).length,0);a.equal(await h.count('purchased_items'),1);
});

test('6+ active pending orders permit a selected replacement; older orders remain individually tracked',async t=>{
 const h=await harness(t);for(let n=1;n<=8;n++)await h.seed(id(n),quote(),'READY',86400000+n*1000);
 a.equal((await h.orders({})).body.code,'PAYMENT_RETRY_CHOICE');
 const created=await h.orders({supersedePaymentId:id(1),replaceOpen:true});a.equal(created.status,200);a.ok(created.body.paymentId);
 a.equal((await h.read(id(1))).status,'superseded');
 for(let n=2;n<=8;n++)a.equal((await h.read(id(n))).status,'pending');
 a.equal(await h.count('payment_orders'),9);a.equal(h.calls.filter(c=>c.url?.endsWith('/cancel')).length,0);
});

test('two independently approved overlapping checkouts: one grant and full refund of duplicate',async t=>{
 const h=await harness(t);await h.seed(id(1),quote(500),'PAID');await h.seed(id(2),quote(500),'PAID');
 const [one,two]=await Promise.all([h.complete({paymentId:id(1)}),h.complete({paymentId:id(2)})]);
 a.equal([one,two].filter(r=>r.body.success).length,1);a.equal([one,two].filter(r=>r.body.code==='PAYMENT_REFUNDED').length,1);
 a.equal(await h.count('purchased_items'),1);a.equal(await h.count('payment_history'),1);a.equal(await h.count('point_transactions'),1);
 a.equal((await h.db.query('SELECT earned_points FROM profiles')).rows[0].earned_points,500);
 a.equal(h.calls.filter(c=>c.url?.endsWith('/cancel')).length,1);
 a.equal((await h.db.query("SELECT supersede_reason FROM payment_orders WHERE status='superseded'")).rows[0].supersede_reason,'concurrent_duplicate');
});

test('an intentional repeat purchase created after completion is permitted',async t=>{
 const h=await harness(t);await h.seed(id(1),quote(),'PAID');a.equal((await h.complete({paymentId:id(1)})).body.success,true);
 await new Promise(r=>setTimeout(r,5));await h.seed(id(2),quote(),'PAID');a.equal((await h.complete({paymentId:id(2)})).body.success,true);
 a.equal(await h.count('purchased_items'),2);a.equal(h.calls.filter(c=>c.url?.endsWith('/cancel')).length,0);
});

test('103 legacy pending rows: READY quietly closes, PAID only reports, new checkout stays available',async t=>{
 const h=await harness(t,{legacyCount:103});for(let n=1;n<=103;n++){
  a.equal((await h.read(id(n))).legacy_reconciliation,true);
  h.provider.set(id(n),{id:id(n),status:n===1?'PAID':'READY',currency:'KRW',amount:{total:1000},customer:{id:uid},customData:{orderId:id(n)}});
 }
 await h.db.exec("UPDATE payment_orders SET reconcile_after=now()-interval '1 minute'");
 for(let n=0;n<3;n++)a.equal((await h.cron('Bearer '+'ab'.repeat(32),'POST')).status,200);
 const states=await h.db.query("SELECT status,count(*)::int n FROM payment_orders GROUP BY status ORDER BY status");
 a.deepEqual(states.rows,[{status:'closed',n:102},{status:'pending',n:1}]);
 const paid=await h.read(id(1));a.equal(paid.manual_review_required,true);a.equal(paid.provider_status,'PAID');a.equal(paid.refund_status,null);
 for(const table of ['purchased_items','payment_history','point_transactions','payment_refund_attempts'])a.equal(await h.count(table),0);
 a.equal(h.calls.filter(c=>c.url?.endsWith('/cancel')).length,0);a.equal(h.provider.get(id(1)).status,'PAID');
 const blocked=await h.orders({});a.equal(blocked.body.code,'PAYMENT_MANUAL_REVIEW');
 const different='44444444-4444-4444-8444-444444444444';await h.db.query("INSERT INTO exam_materials(id,title,price,file_type) VALUES($1,'다른 상품',1000,'HWP')",[different]);
 const created=await h.orders({items:[{item_id:different}]});a.equal(created.status,200);a.ok(created.body.paymentId);
 // Even late PAID on a quietly closed legacy row is only reported.
 h.provider.get(id(2)).status='PAID';a.equal((await h.webhook(id(2))).status,200);a.equal((await h.read(id(2))).manual_review_required,true);
 a.equal((await h.complete({paymentId:id(1)})).body.code,'PAYMENT_MANUAL_REVIEW');
 a.ok((await h.sb.rpc('complete_payment_order',{p_payment_id:id(1),p_user_id:uid})).error);
 a.equal((await h.sb.rpc('complete_payment_order_v2',{p_payment_id:id(1),p_user_id:uid})).data.reviewRequired,true);
 a.ok((await h.sb.rpc('record_payment_refund',{p_payment_id:id(1),p_outcome:'pending'})).error);
 a.equal(await h.count('purchased_items'),0);a.equal(h.calls.filter(c=>c.url?.endsWith('/cancel')).length,0);
});

test('legacy browser request without requestId receives the original checkout response contract',async t=>{
 const h=await harness(t);const res=await h.orders({requestId:undefined});a.equal(res.status,200);a.ok(res.body.paymentId);
 a.equal(res.body.amount,1000);a.equal(res.body.usedPoints,0);a.equal(res.body.recoverPaymentId,undefined);
 const row=await h.read(res.body.paymentId);a.match(row.create_request_id,/^[a-f0-9-]{36}$/);a.equal(row.legacy_reconciliation,false);
 h.provider.set(row.payment_id,{id:row.payment_id,status:'PAID',currency:'KRW',amount:{total:1000},customer:{id:uid},customData:{orderId:row.payment_id}});
 const replay=await h.orders({requestId:undefined});a.equal(replay.body.paymentId,row.payment_id);a.equal(replay.body.recoverPaymentId,undefined);a.equal(await h.count('payment_orders'),1);
});

test('missing profile is zero points: card purchase allowed, point spending rejected before checkout',async t=>{
 const h=await harness(t);await h.db.exec('DELETE FROM profiles');
 a.equal((await h.orders({usedPoints:1000})).status,503);
 const res=await h.orders({usedPoints:0});a.equal(res.status,200);a.ok(res.body.paymentId);
 h.provider.set(res.body.paymentId,{id:res.body.paymentId,status:'PAID',currency:'KRW',amount:{total:1000},customer:{id:uid},customData:{orderId:res.body.paymentId}});
 a.equal((await h.complete({paymentId:res.body.paymentId})).body.success,true);a.equal(await h.count('purchased_items'),1);
});

test('pg_cron uses generated DB token, fixed production endpoint and authenticated POST without CRON_SECRET',async t=>{
 const h=await harness(t);
 const job=(await h.db.query('SELECT * FROM cron.job')).rows[0];a.equal(job.schedule,'*/5 * * * *');a.equal(job.command,'select public.enqueue_payment_reconciliation();');
 await h.db.exec(job.command);const request=(await h.db.query('SELECT * FROM net.http_request_queue')).rows[0];
 a.equal(request.url,'https://mathetf.com/api/cron/payment-reconcile');a.equal(request.timeout_milliseconds,60000);a.equal(request.headers.Authorization,'Bearer '+'ab'.repeat(32));
 a.equal((await h.cron(null,'POST')).status,401);a.equal((await h.cron('Bearer wrong','POST')).status,401);a.equal(await h.count('payment_reconcile_runs'),1);
 a.equal((await h.cron(request.headers.Authorization,'POST')).status,200);a.equal(await h.count('payment_reconcile_runs'),2);
 for(const sql of ['SELECT * FROM payment_reconcile_config','SELECT * FROM payment_reconcile_runs','SELECT enqueue_payment_reconciliation()',"SELECT observe_legacy_payment('x','READY')"]){
  await a.rejects(h.db.exec('SET ROLE authenticated; '+sql));await h.db.exec('RESET ROLE');
 }
 await h.db.exec('DELETE FROM payment_reconcile_config');a.equal((await h.cron(request.headers.Authorization,'POST')).status,503);
});

test('old completion RPC errors on legacy/replaced/unfulfilled results; v2 has explicit status',async t=>{
 const h=await harness(t);await h.seed(id(1),quote(),'PAID');
 await h.db.exec('UPDATE payment_orders SET legacy_reconciliation=true');
 a.ok((await h.sb.rpc('complete_payment_order',{p_payment_id:id(1),p_user_id:uid})).error);
 a.equal((await h.sb.rpc('complete_payment_order_v2',{p_payment_id:id(1),p_user_id:uid})).data.status,'review_required');
 await h.db.exec("UPDATE payment_orders SET legacy_reconciliation=false,status='superseded'");
 a.ok((await h.sb.rpc('complete_payment_order',{p_payment_id:id(1),p_user_id:uid})).error);
 await h.seed(id(2),quote(1000,2000),'PAID');await h.db.exec('UPDATE profiles SET earned_points=0');
 a.ok((await h.sb.rpc('complete_payment_order',{p_payment_id:id(2),p_user_id:uid})).error);
 a.equal((await h.read(id(2))).status,'pending');a.equal(await h.count('purchased_items'),0);
 await h.db.exec('UPDATE profiles SET earned_points=1000');
 const ok=await h.sb.rpc('complete_payment_order',{p_payment_id:id(2),p_user_id:uid});
 a.equal(ok.error,null);a.equal(ok.data.status,'completed');a.equal(await h.count('purchased_items'),1);
});

const decision=(paymentId,action='fulfill',extra={})=>({paymentId,action,note:'승인 금액과 회원 원장을 확인함',...extra});
test('legacy PAID with no ledger: administrator inspection and idempotent delivery recover the order',async t=>{
 const h=await harness(t,{legacyCount:1});h.provider.set(id(1),{id:id(1),status:'PAID',currency:'KRW',amount:{total:1000},customer:{id:uid},customData:JSON.stringify({orderId:id(1)})});
 a.equal((await h.complete({paymentId:id(1)})).body.code,'PAYMENT_MANUAL_REVIEW');
 const inspect=await h.adminGet('paymentId='+id(1));a.equal(inspect.body.ledger,'unfulfilled');a.equal(inspect.body.verified,true);
 a.equal((await h.adminResolve(decision(id(1)))).body.success,true);
 for(let n=0;n<3;n++)a.equal((await h.adminResolve(decision(id(1)))).body.success,true);
 a.equal(await h.count('purchased_items'),1);a.equal(await h.count('payment_history'),1);a.equal(await h.count('payment_review_decisions'),1);
 a.equal((await h.complete({paymentId:id(1)})).body.success,true);a.equal(h.calls.filter(c=>c.url?.endsWith('/cancel')).length,0);
});

test('legacy fully matching delivery ledger is adopted without another debit or grant; partial ledger blocks grants and permits recorded full cancellation',async t=>{
 const h=await harness(t);await h.seed(id(1),quote(500),'PAID');a.equal((await h.complete({paymentId:id(1)})).body.success,true);
 await h.db.exec("UPDATE payment_orders SET status='pending',legacy_reconciliation=true,completed_at=NULL");
 a.equal((await h.adminGet('paymentId='+id(1))).body.ledger,'fulfilled');
 a.equal((await h.adminResolve(decision(id(1)))).body.success,true);
 a.equal((await h.db.query('SELECT earned_points FROM profiles')).rows[0].earned_points,500);
 a.equal(await h.count('point_transactions'),1);a.equal(await h.count('purchased_items'),1);
 await h.seed(id(2),quote(),'PAID');await h.db.query("UPDATE payment_orders SET legacy_reconciliation=true WHERE payment_id=$1",[id(2)]);
 await h.db.query("INSERT INTO purchased_items(user_id,payment_id,item_type,item_id,price_paid) VALUES($1,$2,'HWP_DOC',$3,1)",[uid,id(2),item]);
 a.equal((await h.adminGet('paymentId='+id(2))).body.ledger,'conflict');
 a.equal((await h.adminResolve(decision(id(2),'fulfill',{confirmedOwner:true}))).status,409);
 a.equal((await h.adminResolve(decision(id(2),'refund',{confirmedOwner:true}))).body.refunded,true);
 a.equal((await h.read(id(2))).status,'cancelled');a.equal((await h.read(id(2))).manual_review_required,true);
 a.equal(h.calls.filter(c=>c.url?.endsWith('/cancel')).length,1);a.equal(await h.count('payment_review_decisions'),2);
});

test('legacy grant failure is rolled back for operator review without automatic refund',async t=>{
 const h=await harness(t);await h.seed(id(1),quote(500),'PAID');await h.db.exec('UPDATE payment_orders SET legacy_reconciliation=true; UPDATE profiles SET earned_points=0');
 a.equal((await h.adminResolve(decision(id(1)))).status,409);
 a.equal((await h.read(id(1))).legacy_reconciliation,true);a.equal(await h.count('payment_review_decisions'),0);
 a.equal(await h.count('payment_history'),0);a.equal(await h.count('point_transactions'),0);a.equal(await h.count('purchased_items'),0);
 a.equal(h.calls.filter(c=>c.url?.endsWith('/cancel')).length,0);
});

test('missing legacy identity needs recorded ownership attestation; conflicting identity is rejected even with attestation',async t=>{
 const h=await harness(t);await h.seed(id(1),quote(),'PAID');await h.db.exec('UPDATE payment_orders SET legacy_reconciliation=true');
 delete h.provider.get(id(1)).customer;delete h.provider.get(id(1)).customData;
 a.equal((await h.adminResolve(decision(id(1)))).status,503);
 a.equal((await h.adminResolve(decision(id(1),'fulfill',{confirmedOwner:true}))).body.success,true);
 a.equal((await h.complete({paymentId:id(1)})).body.success,true);
 await h.seed(id(2),quote(),'PAID');await h.db.query('UPDATE payment_orders SET legacy_reconciliation=true WHERE payment_id=$1',[id(2)]);
 h.provider.get(id(2)).customer.id=item;
 a.equal((await h.adminResolve(decision(id(2),'refund',{confirmedOwner:true}))).status,503);
 a.equal(h.calls.filter(c=>c.url?.endsWith('/cancel')).length,0);
});

for(const delivered of [false,true])test(`legacy operator full refund, delivered=${delivered}: durable intent, no duplicate point return`,async t=>{
 const h=await harness(t);await h.seed(id(1),quote(500),'PAID');
 if(delivered)a.equal((await h.complete({paymentId:id(1)})).body.success,true);
 await h.db.exec('UPDATE payment_orders SET legacy_reconciliation=true');
 h.setCancel('fail');const first=await h.adminResolve(decision(id(1),'refund'));a.equal(first.status,202);
 a.equal((await h.read(id(1))).refund_status,'pending');
 h.setCancel('ok');await h.db.exec("UPDATE payment_orders SET reconcile_after=now()-interval '1 minute'");
 a.equal((await h.cron('Bearer '+'ab'.repeat(32))).status,200);
 a.equal((await h.read(id(1))).refund_status,'succeeded');
 for(let n=0;n<3;n++)await h.webhook(id(1));
 a.equal((await h.adminResolve(decision(id(1),'refund'))).body.refunded,true);
 a.equal((await h.db.query('SELECT earned_points FROM profiles')).rows[0].earned_points,1000);
 a.equal((await h.db.query("SELECT count(*)::int n FROM point_transactions WHERE type='payment_refund'")).rows[0].n,delivered?1:0);
 a.equal(await h.count('payment_review_decisions'),1);
});

test('completed card cancellation rechecks provider, cancels history, revokes pass/DB rights and returns points exactly once',async t=>{
 const h=await harness(t);const q=quote(500,2000);q.items=[{item_id:item,item_type:'QB_PASS',title:'이용권',price:1000},{item_id:'44444444-4444-4444-8444-444444444444',item_type:'PRIVATE_DB',title:'개인DB',price:1000}];
 await h.seed(id(1),q,'PAID');a.equal((await h.complete({paymentId:id(1)})).body.success,true);
 const lookups=h.calls.filter(c=>c.url).length;
 h.provider.get(id(1)).status='CANCELLED';
 a.equal((await h.webhook(id(1))).status,200);a.ok(h.calls.filter(c=>c.url).length>lookups);
 for(let n=0;n<4;n++)await h.webhook(id(1));
 a.equal((await h.complete({paymentId:id(1)})).body.code,'PAYMENT_REFUNDED');
 a.equal((await h.read(id(1))).status,'cancelled');a.equal((await h.db.query('SELECT status FROM payment_history')).rows[0].status,'CANCELLED');
 a.equal(await h.count('purchased_items'),0);a.equal(await h.count('payment_cancellations'),1);
 a.equal((await h.db.query('SELECT earned_points FROM profiles')).rows[0].earned_points,1000);
 const c=(await h.db.query('SELECT * FROM payment_cancellations')).rows[0];a.equal(c.returned_points,500);a.equal(c.revoked_items.length,2);
 a.equal(h.calls.filter(c=>c.url?.endsWith('/cancel')).length,0);
});

test('completed download receipt remains cancelled; cancellation transaction failure retries without a partial point credit',async t=>{
 const h=await harness(t);await h.seed(id(1),quote(500),'PAID');a.equal((await h.complete({paymentId:id(1)})).body.success,true);
 await h.db.exec("CREATE FUNCTION fail_cancel() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected cancellation write failure'; END; $$; CREATE TRIGGER fail_cancel BEFORE INSERT ON payment_cancellations FOR EACH ROW EXECUTE FUNCTION fail_cancel();");
 h.provider.get(id(1)).status='CANCELLED';a.equal((await h.webhook(id(1))).status,503);
 a.equal((await h.read(id(1))).status,'completed');a.equal((await h.db.query('SELECT earned_points FROM profiles')).rows[0].earned_points,500);
 a.equal((await h.db.query('SELECT status FROM payment_history')).rows[0].status,'PAID');
 await h.db.exec('DROP TRIGGER fail_cancel ON payment_cancellations');
 a.equal((await h.webhook(id(1))).status,200);a.equal(await h.count('purchased_items'),1);
 a.equal((await h.db.query('SELECT status FROM payment_history')).rows[0].status,'CANCELLED');
 a.equal((await h.db.query('SELECT earned_points FROM profiles')).rows[0].earned_points,1000);
});

test('cancellation webhook cannot forge provider state or identity; cron detects completed cancellation without webhook',async t=>{
 const h=await harness(t);await h.seed(id(1),quote(),'PAID');a.equal((await h.complete({paymentId:id(1)})).body.success,true);
 a.equal((await h.webhook(id(1))).status,200);a.equal((await h.read(id(1))).status,'completed');
 h.provider.get(id(1)).status='CANCELLED';h.provider.get(id(1)).amount.total=1;
 a.equal((await h.webhook(id(1))).status,200);a.equal((await h.read(id(1))).status,'completed');
 a.equal((await h.read(id(1))).review_reason,'provider_mismatch');a.equal(await h.count('payment_cancellations'),0);
 h.provider.get(id(1)).amount.total=1000;await h.db.exec("UPDATE payment_orders SET reconcile_after=now()-interval '1 minute'");
 a.equal((await h.cron('Bearer '+'ab'.repeat(32))).status,200);a.equal((await h.read(id(1))).status,'cancelled');
});

test('urgent refund runs before 103 legacy observations; backlog drains in three runs and closed rows use daily intervals',async t=>{
 const h=await harness(t,{legacyCount:103});for(let n=1;n<=103;n++)h.provider.set(id(n),{id:id(n),status:'READY'});
 await h.seed(id(104),quote(500),'PAID');await h.db.exec('UPDATE profiles SET earned_points=0');h.setCancel('fail');
 a.equal((await h.complete({paymentId:id(104)})).body.code,'PAYMENT_REFUND_PENDING');h.setCancel('ok');
 await h.db.exec("UPDATE payment_orders SET reconcile_after=now()-interval '1 minute'");h.calls.length=0;
 const first=await h.cron('Bearer '+'ab'.repeat(32));a.equal(first.body.urgentChecked,1);a.equal(first.body.legacyChecked,40);
 const lookups=h.calls.filter(c=>c.url);a.equal(lookups[0].url.split('/').pop(),id(0)); // read-only access probe
 a.equal(lookups[1].url.split('/').pop(),id(104));a.equal((await h.read(id(104))).refund_status,'succeeded');
 for(let n=0;n<2;n++)a.equal((await h.cron('Bearer '+'ab'.repeat(32))).status,200);
 a.equal((await h.db.query("SELECT count(*)::int n FROM payment_orders WHERE status='closed'")).rows[0].n,103);
 a.equal((await h.db.query("SELECT count(*)::int n FROM payment_orders WHERE status='closed' AND reconcile_after>now()+interval '23 hours'")).rows[0].n,103);
 a.equal((await h.cron('Bearer '+'ab'.repeat(32))).body.checked,0);
});

for(const rewardFirst of [false,true])test(`submission reward and payment debit preserve both atomic deltas, rewardFirst=${rewardFirst}`,async t=>{
 const h=await harness(t);await h.db.exec('UPDATE profiles SET earned_points=10000');
 await h.db.query("UPDATE exam_materials SET content_type='원본제보',uploader_id=$1,description='{}'",[uid]);
 await h.seed(id(1),quote(3000,4000),'PAID');
 const reward=()=>h.sb.rpc('reward_submission',{p_submission_id:item});
 if(rewardFirst)a.equal((await reward()).error,null);
 a.equal((await h.complete({paymentId:id(1)})).body.success,true);
 if(!rewardFirst)a.equal((await reward()).error,null);
 a.equal((await h.db.query('SELECT earned_points FROM profiles')).rows[0].earned_points,12000);
 const dup=await reward();a.equal(dup.error.code,'23505');a.equal((await h.db.query('SELECT earned_points FROM profiles')).rows[0].earned_points,12000);
 a.equal((await h.db.query("SELECT count(*)::int n FROM point_transactions WHERE type='submission_reward'")).rows[0].n,1);
});

test('submission reward balance failure rolls back the ledger and missing profile is created atomically',async t=>{
 const h=await harness(t);await h.db.query("UPDATE exam_materials SET content_type='원본제보',uploader_id=$1,description='{}'",[uid]);
 await h.db.exec("CREATE FUNCTION fail_credit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected credit failure'; END; $$; CREATE TRIGGER fail_credit BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION fail_credit();");
 a.ok((await h.sb.rpc('reward_submission',{p_submission_id:item})).error);a.equal(await h.count('point_transactions'),0);
 await h.db.exec('DROP TRIGGER fail_credit ON profiles; DELETE FROM profiles');
 a.equal((await h.sb.rpc('reward_submission',{p_submission_id:item})).error,null);
 a.equal((await h.db.query('SELECT earned_points FROM profiles')).rows[0].earned_points,5000);
});

test('operator routes require administrator and new money RPCs/ledgers reject browser roles',async t=>{
 const h=await harness(t);h.setAuth(item);a.equal((await h.adminGet()).status,403);a.equal((await h.adminResolve(decision(id(1)))).status,403);
 for(const sql of ["SELECT reward_submission('"+item+"')","SELECT record_payment_cancellation('x',NULL)","SELECT resolve_legacy_payment('x','fulfill','"+uid+"','test note','{}',true)","SELECT complete_payment_order_v2('x','"+uid+"')","SELECT claim_payment_reconciliation_v2(20,false)","SELECT * FROM payment_review_decisions","SELECT * FROM payment_cancellations"]){
  await a.rejects(h.db.exec('SET ROLE authenticated; '+sql));await h.db.exec('RESET ROLE');
 }
});

test('operator inbox keyset pagination exposes all 103 unchecked legacy orders',async t=>{
 const h=await harness(t,{legacyCount:103});const first=await h.adminGet();a.equal(first.status,200);a.equal(first.body.orders.length,100);a.ok(first.body.nextCursor);
 const next=await h.adminGet('cursor='+first.body.nextCursor);a.equal(next.body.orders.length,3);a.equal(next.body.nextCursor,null);
 a.equal(new Set([...first.body.orders,...next.body.orders].map(row=>row.payment_id)).size,103);
});

test('actual adoption function uses one atomic reward RPC after an intervening checkout',async t=>{
 const h=await harness(t);await h.db.exec('UPDATE profiles SET earned_points=10000');
 await h.db.query("UPDATE exam_materials SET content_type='원본제보',uploader_id=$1,description='{}'",[uid]);
 const staleBalance=(await h.db.query('SELECT earned_points FROM profiles')).rows[0].earned_points;a.equal(staleBalance,10000);
 await h.seed(id(1),quote(3000,4000),'PAID');a.equal((await h.complete({paymentId:id(1)})).body.success,true);
 const approved=await h.approve();a.equal(approved.rewarded,5000);a.equal(approved.sms,'skipped');
 a.equal((await h.db.query('SELECT earned_points FROM profiles')).rows[0].earned_points,12000);
 await a.rejects(h.approve(),e=>e.status===409);a.equal((await h.db.query('SELECT earned_points FROM profiles')).rows[0].earned_points,12000);
});

test('partial legacy goods ledger full cancellation returns only its proven debit, once',async t=>{
 const h=await harness(t);await h.seed(id(1),quote(500),'PAID');a.equal((await h.complete({paymentId:id(1)})).body.success,true);
 await h.db.exec("UPDATE payment_orders SET status='pending',legacy_reconciliation=true; DELETE FROM purchased_items");
 a.equal((await h.adminGet('paymentId='+id(1))).body.ledger,'conflict');
 a.equal((await h.adminResolve(decision(id(1),'refund'))).body.refunded,true);
 a.equal((await h.db.query('SELECT earned_points FROM profiles')).rows[0].earned_points,1000);
 a.equal((await h.read(id(1))).manual_review_required,true);await h.webhook(id(1));
 a.equal((await h.db.query("SELECT count(*)::int n FROM point_transactions WHERE type='payment_refund'")).rows[0].n,1);
});

test('pending cancellation commits before a stale PAID completion: no delivery, debit or resurrection',async t=>{
 const h=await harness(t);const q=quote(500,2000);q.items[0].item_type='QB_PASS';await h.seed(id(1),q,'PAID');
 h.setBeforeComplete(async()=>{h.provider.get(id(1)).status='CANCELLED';a.equal((await h.webhook(id(1))).status,200);});
 a.equal((await h.complete({paymentId:id(1)})).body.code,'PAYMENT_REFUNDED');
 const o=await h.read(id(1));a.equal(o.status,'cancelled');a.equal(o.manual_review_required,false);
 for(const table of ['purchased_items','payment_history','point_transactions'])a.equal(await h.count(table),0);
 a.equal((await h.db.query('SELECT earned_points FROM profiles')).rows[0].earned_points,1000);
 for(let n=0;n<3;n++){a.equal((await h.webhook(id(1))).status,200);a.equal((await h.complete({paymentId:id(1)})).body.code,'PAYMENT_REFUNDED');}
 await h.sb.rpc('supersede_payment_order',{p_payment_id:id(1),p_user_id:uid,p_reason:'selection_changed'});
 a.equal((await h.read(id(1))).status,'cancelled');a.equal(await h.count('payment_cancellations'),1);
});

test('pending CANCELLED needs matching identity and a committed cancellation record before webhook acknowledgment',async t=>{
 const h=await harness(t);await h.seed(id(1),quote(500),'CANCELLED');h.provider.get(id(1)).customer.id=item;
 a.equal((await h.webhook(id(1))).status,200);a.equal((await h.read(id(1))).status,'pending');a.equal((await h.read(id(1))).review_reason,'provider_mismatch');
 h.provider.get(id(1)).customer.id=uid;
 await h.db.exec("CREATE FUNCTION fail_cancel_pending() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected'; END $$; CREATE TRIGGER fail_cancel_pending BEFORE INSERT ON payment_cancellations FOR EACH ROW EXECUTE FUNCTION fail_cancel_pending();");
 a.equal((await h.webhook(id(1))).status,503);a.equal((await h.read(id(1))).status,'pending');
 await h.db.exec('DROP TRIGGER fail_cancel_pending ON payment_cancellations');a.equal((await h.webhook(id(1))).status,200);
 a.equal((await h.read(id(1))).status,'cancelled');a.equal(await h.count('point_transactions'),0);
});

for(const status of ['READY','FAILED','NOT_FOUND'])test(`unapproved replacement ${status} backs off to one day while late approval remains refundable`,async t=>{
 const h=await harness(t);await h.seed(id(1));await h.db.exec("UPDATE payment_orders SET status='superseded',refund_status='pending'");
 if(status==='NOT_FOUND')h.provider.delete(id(1));else h.provider.get(id(1)).status=status;
 for(let n=1;n<=10;n++){
  a.equal((await h.complete({paymentId:id(1)})).body.code,'PAYMENT_SUPERSEDED');
  const o=await h.read(id(1));a.equal(o.unpaid_reconcile_checks,n);a.equal(o.refund_status,'pending');
  const seconds=(new Date(o.reconcile_after)-new Date(o.provider_checked_at))/1000;
  a.equal(seconds,Math.min(86400,300*2**Math.min(n,9)));
 }
 h.provider.set(id(1),{id:id(1),status:'PAID',currency:'KRW',amount:{total:1000},customer:{id:uid},customData:{orderId:id(1)}});
 await h.db.exec("UPDATE payment_orders SET reconcile_after=now()-interval '1 minute'");a.equal((await h.cron('Bearer '+'ab'.repeat(32))).status,200);
 a.equal((await h.read(id(1))).refund_status,'succeeded');a.equal(await h.count('purchased_items'),0);
});

test('40 abandoned replacements cannot starve paid pending fulfillment or completed cancellation in the same cron run',async t=>{
 const h=await harness(t);
 for(let n=1;n<=40;n++)await h.seed(id(n));
 await h.db.exec("UPDATE payment_orders SET status='superseded',refund_status='pending'");
 const q=quote(500);q.items[0].item_type='QB_PASS';await h.seed(id(100),q,'PAID',10000);
 a.equal((await h.complete({paymentId:id(100)})).body.success,true);h.provider.get(id(100)).status='CANCELLED';
 const other=quote();other.items[0].item_id='44444444-4444-4444-8444-444444444444';await h.seed(id(101),other,'PAID');
 await h.db.exec("UPDATE payment_orders SET reconcile_after=now()-interval '1 minute'");
 const result=await h.cron('Bearer '+'ab'.repeat(32));a.equal(result.status,200);
 a.equal(result.body.urgentChecked,20);a.equal(result.body.pendingChecked,1);a.equal(result.body.completedChecked,1);
 a.equal((await h.read(id(100))).status,'cancelled');a.equal((await h.read(id(101))).status,'completed');
 a.equal((await h.db.query("SELECT count(*)::int n FROM purchased_items WHERE item_type='QB_PASS'")).rows[0].n,0);
 const second=await h.cron('Bearer '+'ab'.repeat(32));a.equal(second.body.urgentChecked,20);
 a.equal((await h.cron('Bearer '+'ab'.repeat(32))).body.urgentChecked,0);
});

test('hiding old and modern purchase entries preserves delivery ledgers and cancellation proof',async t=>{
 const h=await harness(t);await h.seed(id(1),quote(500),'PAID');await h.complete({paymentId:id(1)});
 const purchaseId=(await h.db.query('SELECT id FROM purchased_items')).rows[0].id;
 a.equal((await h.hide(purchaseId)).success,true);a.equal((await h.hide(purchaseId)).success,true);
 a.equal(await h.count('purchased_items'),1);a.equal(await h.count('purchase_list_hides'),1);
 a.equal((await h.sb.rpc('payment_order_ledger_state',{p_payment_id:id(1)})).data,'fulfilled');
 const oldId=require('node:crypto').randomUUID();await h.db.query('INSERT INTO purchases(id,user_id) VALUES($1,$2)',[oldId,uid]);
 a.equal((await h.hide(oldId)).success,true);a.equal(await h.count('purchases'),1);
 h.setAuth(item);a.equal((await h.hide(purchaseId)).success,false);h.setAuth(uid);
 h.provider.get(id(1)).status='CANCELLED';await h.webhook(id(1));
 a.equal((await h.read(id(1))).manual_review_required,false);
 a.equal((await h.db.query('SELECT returned_points FROM payment_cancellations')).rows[0].returned_points,500);
});

test('modern cancelled conflict can be closed with audited evidence and exact point return, enabling repurchase',async t=>{
 const h=await harness(t);await h.seed(id(1),quote(500),'PAID');await h.complete({paymentId:id(1)});
 await h.db.exec('DELETE FROM purchased_items');h.provider.get(id(1)).status='CANCELLED';await h.webhook(id(1));
 a.equal((await h.read(id(1))).manual_review_required,true);a.equal((await h.orders({})).body.code,'PAYMENT_MANUAL_REVIEW');
 const inspect=await h.adminGet('paymentId='+id(1));a.equal(inspect.body.cancellation.returned_points,500);a.equal(inspect.body.order.legacy_reconciliation,false);
 const closed=await h.adminResolve(decision(id(1),'close_review'));a.equal(closed.body.reviewClosed,true);
 a.equal((await h.read(id(1))).manual_review_required,false);
 a.equal((await h.adminResolve(decision(id(1),'close_review'))).body.reviewClosed,true);
 a.equal((await h.db.query("SELECT count(*)::int n FROM payment_review_decisions WHERE action='close_review'")).rows[0].n,1);
 a.equal((await h.db.query('SELECT earned_points FROM profiles')).rows[0].earned_points,1000);
 a.ok((await h.orders({})).body.paymentId);
});

test('closing review rejects missing cancellation, missing return, forged provider/owner, short notes and non-admin',async t=>{
 const h=await harness(t);await h.seed(id(1),quote(500),'PAID');await h.complete({paymentId:id(1)});
 a.equal((await h.adminResolve(decision(id(1),'close_review'))).status,409);
 await h.db.exec('DELETE FROM purchased_items');h.provider.get(id(1)).status='CANCELLED';await h.webhook(id(1));
 a.equal((await h.adminResolve(decision(id(1),'close_review',{note:'짧음'}))).status,400);
 h.provider.get(id(1)).customer.id=item;a.equal((await h.adminResolve(decision(id(1),'close_review',{confirmedOwner:true}))).status,503);
 h.provider.get(id(1)).customer.id=uid;
 await h.db.exec("DELETE FROM point_transactions WHERE type='payment_refund'");
 a.equal((await h.adminResolve(decision(id(1),'close_review'))).status,409);a.equal((await h.read(id(1))).manual_review_required,true);
 h.setAuth(item);a.equal((await h.adminResolve(decision(id(1),'close_review'))).status,403);
});

test('unchecked legacy PAID on another device is observed and blocks duplicate goods before creation',async t=>{
 const h=await harness(t,{legacyCount:1});h.provider.set(id(1),{id:id(1),status:'PAID'});
 a.equal((await h.read(id(1))).manual_review_required,false);
 a.equal((await h.orders({})).body.code,'PAYMENT_MANUAL_REVIEW');a.equal((await h.read(id(1))).provider_status,'PAID');
 a.equal(await h.count('payment_orders'),1);a.equal(await h.count('purchased_items'),0);a.equal(h.calls.some(c=>c.rpc==='create_payment_order'),false);
 const direct=await h.create(id(2));a.equal(direct.data.reviewRequired,true);a.equal(await h.count('payment_orders'),1);
});

test('unchecked legacy READY/404 closes without fulfillment or refund and allows a fresh order',async t=>{
 const h=await harness(t,{legacyCount:2});h.provider.set(id(1),{id:id(1),status:'READY'});
 const result=await h.orders({});a.ok(result.body.paymentId);a.equal((await h.read(id(1))).status,'closed');a.equal((await h.read(id(2))).status,'closed');
 a.equal(await h.count('purchased_items'),0);a.equal(await h.count('payment_refund_attempts'),0);
});

test('SQL creation lock blocks a legacy row inserted after the route duplicate check',async t=>{
 const h=await harness(t);
 h.setBeforeCreate(async()=>{await h.seed(id(1));await h.db.exec('UPDATE payment_orders SET legacy_reconciliation=true');});
 const result=await h.orders({});a.equal(result.body.code,'PAYMENT_MANUAL_REVIEW');a.equal(await h.count('payment_orders'),1);
});

for(const stage of ['supersede','resolution'])test(`${stage} preparation keeps deployed orders open and modern creation RPC closed`,async t=>{
 const h=await harness(t,{stage});a.equal((await h.orders({})).status,200);
 a.ok((await h.create(id(1))).error);a.equal(await h.count('payment_orders'),1);
});

test('checkout activates only after a successful scheduled HTTP round trip, then closes for stale or stopped scheduling',async t=>{
 const h=await harness(t,{ready:false});const ready=async()=>(await h.sb.rpc('payment_checkout_ready',{})).data;
 a.equal(await ready(),false);a.ok((await h.create(id(1))).error);
 a.equal((await h.cron('Bearer '+'ab'.repeat(32))).status,200);a.equal(await ready(),false);
 const requestId=(await h.db.query('SELECT enqueue_payment_reconciliation() id')).rows[0].id;
 const dispatch=(await h.db.query('SELECT dispatch_id FROM payment_reconcile_dispatches WHERE request_id=$1',[requestId])).rows[0].dispatch_id;
 a.equal((await h.cron('Bearer wrong','POST',dispatch)).status,401);a.equal(await ready(),false);
 a.equal((await h.cron('Bearer '+'ab'.repeat(32),'POST',dispatch)).status,200);a.equal(await ready(),false);
 await h.db.query('INSERT INTO net._http_response VALUES($1,503)',[requestId]);a.equal(await ready(),false);
 await h.db.query('UPDATE net._http_response SET status_code=200 WHERE id=$1',[requestId]);a.equal(await ready(),true);
 await h.db.exec(migration('cutover'));
 await h.db.exec("UPDATE payment_reconcile_dispatches SET scheduled_at=now()-interval '16 minutes'");a.equal(await ready(),false);
 a.equal((await h.orders({})).status,503);a.equal((await h.scheduledRun()).status,200);a.equal(await ready(),true);
 await h.db.exec('UPDATE cron.job SET active=false');a.equal(await ready(),false);a.ok((await h.create(id(1))).error);
 await h.db.exec('UPDATE cron.job SET active=true');a.equal(await ready(),true);
 h.setBeforeCreate(()=>h.db.exec('UPDATE cron.job SET active=false'));
 a.equal((await h.orders({})).status,503);a.equal(await h.count('payment_orders'),0);
});

test('new hide, close, readiness and queue functions reject direct browser roles',async t=>{
 const h=await harness(t);
 for(const sql of ["SELECT hide_purchase('"+item+"','"+uid+"')","SELECT close_payment_review('x','"+uid+"','test note','{}',false)","SELECT claim_payment_reconciliation_v3(20,'pending')","SELECT payment_checkout_ready()","SELECT record_payment_reconciliation_run('{}',NULL)","SELECT * FROM payment_checkout_readiness"]){
  await a.rejects(h.db.exec('SET ROLE authenticated; '+sql));await h.db.exec('RESET ROLE');
 }
});

test('schedule migration rolls back when resolution prerequisites are missing',async t=>{
 const h=await harness(t,{stage:'supersede'});
 const sql=fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261109_payment_schedule.sql'),'utf8').replace(/^CREATE EXTENSION IF NOT EXISTS (pgcrypto|pg_cron|pg_net).*;\r?$/gm,'');
 await a.rejects(h.db.exec(sql),/Payment resolution migration is required/);await h.db.exec('ROLLBACK');
 a.equal((await h.sb.rpc('payment_checkout_ready',{})).data,false);a.ok((await h.create(id(1))).error);
});

test('queue infrastructure failure or failed run recording cannot activate checkout even with a forged HTTP 200 receipt',async t=>{
 const h=await harness(t,{ready:false});h.setQueueError(true);
 a.equal((await h.scheduledRun()).status,503);a.equal((await h.sb.rpc('payment_checkout_ready',{})).data,false);
 await h.db.exec('UPDATE net._http_response SET status_code=200');a.equal((await h.sb.rpc('payment_checkout_ready',{})).data,false);
 h.setQueueError(false);h.setRunError(true);a.equal((await h.scheduledRun()).status,503);
 a.equal((await h.sb.rpc('payment_checkout_ready',{})).data,false);h.setRunError(false);
 a.equal((await h.scheduledRun()).status,200);a.equal((await h.sb.rpc('payment_checkout_ready',{})).data,true);
});

test('hide failure leaves purchase proof intact and reports failure to the member',async t=>{
 const h=await harness(t);await h.seed(id(1),quote(),'PAID');await h.complete({paymentId:id(1)});
 const purchaseId=(await h.db.query('SELECT id FROM purchased_items')).rows[0].id;
 await h.db.exec("CREATE FUNCTION fail_hide() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected'; END $$; CREATE TRIGGER fail_hide BEFORE INSERT ON purchase_list_hides FOR EACH ROW EXECUTE FUNCTION fail_hide();");
 a.equal((await h.hide(purchaseId)).success,false);a.equal(await h.count('purchase_list_hides'),0);a.equal(await h.count('purchased_items'),1);
 a.equal((await h.sb.rpc('payment_order_ledger_state',{p_payment_id:id(1)})).data,'fulfilled');
});

test('legacy cancelled conflict closure records a fresh ownership attestation when provider metadata is missing',async t=>{
 const h=await harness(t);await h.seed(id(1),quote(500),'PAID');await h.complete({paymentId:id(1)});
 await h.db.exec("UPDATE payment_orders SET status='pending',legacy_reconciliation=true; DELETE FROM purchased_items");
 h.provider.get(id(1)).customer={};h.provider.get(id(1)).customData=null;
 a.equal((await h.adminResolve(decision(id(1),'refund',{confirmedOwner:true}))).body.refunded,true);
 a.equal((await h.adminResolve(decision(id(1),'close_review'))).status,503);
 a.equal((await h.adminResolve(decision(id(1),'close_review',{confirmedOwner:true}))).body.reviewClosed,true);
 a.equal((await h.read(id(1))).manual_review_required,false);
 const recorded=(await h.db.query("SELECT ownership_attested,note FROM payment_review_decisions WHERE action='close_review'")).rows[0];
 a.equal(recorded.ownership_attested,true);a.equal(recorded.note,'승인 금액과 회원 원장을 확인함');
});


async function onceBundle(h, hash) {
 const job=require('node:crypto').randomUUID(),receipt=require('node:crypto').randomUUID();
 await h.db.query("INSERT INTO bundle_selections VALUES($1,$2,'print',$3)",[receipt,uid,[item]]);
 const result=await h.sb.rpc('create_plan_bundle',{p_id:job,p_user:uid,p_email:'local@example.invalid',p_kind:'print',p_title:'프린트',
  p_ids:[item],p_hash:hash,p_charge:'once',p_hwp:true,p_features:['plan_once_bundle'],p_limit:999,p_since:null,p_receipt:receipt});
 return result;
}
async function onceAccess(h) {
 const buys=(await h.db.query('SELECT * FROM purchased_items')).rows;
 const uses=(await h.db.query('SELECT * FROM plan_usage')).rows;
 const failed=(await h.db.query("SELECT id FROM pdf_jobs WHERE status='error' AND NOT hwp_ready AND NOT pdf_delivered")).rows;
 return require('../src/lib/planAccess.ts').computeAccess(JSON.parse(JSON.stringify(buys)),JSON.parse(JSON.stringify(uses)),new Set(failed.map(j=>j.id)));
}
const onceQuote=()=>{const q=quote(0,2900);q.items[0].item_type='QB_ONCE';return q;};

test('round7 private DB: a purchase completed before B creation blocks B even with a fresh latest snapshot',async t=>{
 const h=await harness(t);const q=quote();q.items[0].item_type='PRIVATE_DB';
 await h.seed(id(1),q,'PAID');a.equal((await h.complete({paymentId:id(1)})).body.success,true);
 const b=await h.create(id(2),[],q);a.equal(b.error,null);a.equal(b.data.alreadyPurchased,true);
 a.equal(await h.count('payment_orders'),1);a.equal(await h.count('purchased_items'),1);
});
for(const card of [true,false])test(`round7 private DB fulfillment rechecks permanent entitlement, card=${card}`,async t=>{
 const h=await harness(t);const q=quote(card?0:1000);q.items[0].item_type='PRIVATE_DB';
 // B predates A, and even a forged late creation timestamp must not bypass the
 // permanent private entitlement check that ordinary repeat purchases allow.
 await h.seed(id(1),q,'PAID',60000);await h.seed(id(2),q,'PAID');
 a.equal((await h.complete({paymentId:id(1)})).body.success,true);
 await h.db.query("UPDATE payment_orders SET created_at=now()+interval '1 minute' WHERE payment_id=$1",[id(2)]);
 a.equal((await h.complete({paymentId:id(2)})).body.code,card?'PAYMENT_REFUNDED':'PAYMENT_SUPERSEDED');
 a.equal(await h.count('purchased_items'),1);a.equal(await h.count('payment_history'),1);
 a.equal((await h.db.query('SELECT earned_points FROM profiles')).rows[0].earned_points,card?1000:0);
 await a.rejects(h.db.query("INSERT INTO purchased_items(user_id,item_id,item_type) VALUES($1,$2,'PRIVATE_DB')",[uid,item]),/duplicate key/);
});
test('round7 API private DB check racing fulfillment cannot create another checkout',async t=>{
 const h=await harness(t);const q=quote();q.items[0].item_type='PRIVATE_DB';
 await h.db.exec('DELETE FROM exam_materials');await h.db.query("INSERT INTO private_dbs VALUES($1,$2,'개인DB',1000)",[item,uid]);
 h.setBeforeCreate(async()=>{await h.seed(id(1),q,'PAID');await h.complete({paymentId:id(1)});});
 const res=await h.orders({});a.equal(res.status,409);a.match(res.body.message,/이미 결제/);
 a.equal(await h.count('payment_orders'),1);a.equal(h.calls.some(c=>c.url?.endsWith('/cancel')),false);
});
test('round7 sealed snapshot isolates 103 reviewed orders from in-flight old-version card orders',async t=>{
 const h=await harness(t,{stage:'legacy',legacyCount:103});
 const manifest=(await h.db.query('SELECT payment_id FROM payment_orders')).rows.map(r=>r.payment_id);
 await h.db.query('SELECT seal_payment_legacy_snapshot($1)',[manifest]);
 await h.seed(id(104),quote(),'PAID');const stale=await h.read(id(104));
 await applySupersede(h.db);a.equal((await h.read(id(104))).legacy_reconciliation,false);
 a.equal((await h.sb.rpc('complete_payment_order',{p_payment_id:id(104),p_user_id:uid})).data.status,'completed');
 await h.db.exec(migration('resolution'));
 a.equal((await h.load('src/lib/payments/reconcile.ts').reconcileOrder(h.sb,stale)).success,true);
 a.equal((await h.db.query('SELECT count(*)::int n FROM payment_orders WHERE legacy_reconciliation')).rows[0].n,103);
 for(let n=1;n<=103;n++)h.provider.set(id(n),{id:id(n),status:'PAID'});
 a.equal((await h.complete({paymentId:id(1)})).body.code,'PAYMENT_MANUAL_REVIEW');
 a.equal(await h.count('purchased_items'),1);a.equal(h.calls.some(c=>c.url?.endsWith('/cancel')),false);
 await a.rejects(h.db.query('SELECT seal_payment_legacy_snapshot($1)',[[]]),/already sealed/);
});
test('round7 final cutover alone retires direct INSERT after readiness, preserving RPC and completion',async t=>{
 const h=await harness(t,{ready:false});
 await a.rejects(h.db.exec(migration('cutover')),/not ready/);await h.db.exec('ROLLBACK');
 a.equal((await h.db.query("SELECT has_table_privilege('service_role','payment_orders','INSERT') ok")).rows[0].ok,true);
 await h.scheduledRun();await h.db.exec(migration('cutover'));
 a.equal((await h.db.query("SELECT has_table_privilege('service_role','payment_orders','INSERT') ok")).rows[0].ok,false);
 await h.db.exec('SET ROLE service_role');const made=await h.create(id(1));await h.db.exec('RESET ROLE');a.ok(made.data.paymentId);
 h.provider.set(id(1),{id:id(1),status:'PAID',currency:'KRW',amount:{total:1000},customer:{id:uid},customData:{orderId:id(1)}});
 a.equal((await h.complete({paymentId:id(1)})).body.success,true);
 await h.db.exec('SET ROLE service_role');
 await a.rejects(h.db.query("INSERT INTO payment_orders(payment_id,user_id,kind,amount,total,items,name) VALUES($1,$2,'cart',1000,1000,$3,'old')",[id(2),uid,JSON.stringify(quote().items)]),/permission denied/);
 await h.db.exec('RESET ROLE');
});
test('round7 cancellation revokes unreceived once job, stale claims, restore and reuse while retaining usage',async t=>{
 const h=await harness(t);await h.seed(id(1),onceQuote(),'PAID');await h.complete({paymentId:id(1)});
 const original=await onceBundle(h,'revoked');a.equal(original.error,null);const jobId=original.data.id;
 h.provider.get(id(1)).status='CANCELLED';await h.complete({paymentId:id(1)});
 const job=(await h.db.query('SELECT * FROM pdf_jobs')).rows[0];a.ok(job.revoked_at);a.equal(job.revoked_payment_id,id(1));
 a.equal((await h.sb.rpc('check_bundle_delivery',{p_user:uid,p_id:jobId})).data,false);
 a.ok((await h.sb.rpc('claim_bundle_hwp',{p_user:uid,p_id:jobId})).error);
 await a.rejects(h.db.query("UPDATE pdf_jobs SET status='done' WHERE id=$1",[jobId]),/BUNDLE_REVOKED/);
 const noCredit=await onceBundle(h,'revoked');a.ok(noCredit.error);a.equal(await h.count('feature_usage'),1);
 await h.seed(id(2),onceQuote(),'PAID');await h.complete({paymentId:id(2)});
 const replacement=await onceBundle(h,'revoked');a.equal(replacement.error,null);a.notEqual(replacement.data.id,jobId);
 a.equal(await h.count('feature_usage'),2);a.equal(await h.count('pdf_jobs'),2);
});
for(const ledgers of ['fulfilled','debit_only','history_only','bad_debit'])test(`round7 zero-card internal admin resolution with ${ledgers} evidence`,async t=>{
 const h=await harness(t);await h.seed(id(1),quote(1000),'READY');const order=await h.read(id(1));
 if(ledgers==='fulfilled'){
  await h.complete({paymentId:id(1)});await h.db.exec("UPDATE payment_orders SET status='pending'");
 }else if(ledgers==='history_only')await h.db.query("INSERT INTO payment_history(user_id,payment_id,amount,status,points_added) VALUES($1,$2,0,'PAID',0)",[uid,id(1)]);
 else{
  await h.db.exec('UPDATE profiles SET earned_points=0');
  await h.db.query("INSERT INTO point_transactions(user_id,type,amount,related_id) VALUES($1,'purchase',$2,$3)",[uid,ledgers==='bad_debit'?-999:-1000,order.id]);
 }
 a.equal((await h.complete({paymentId:id(1)})).body.code,'PAYMENT_MANUAL_REVIEW');
 const inspection=await h.adminGet('paymentId='+id(1));a.equal(inspection.status,200);a.ok(inspection.body.internal);
 const action=ledgers==='fulfilled'?'fulfill':'refund';
 if(ledgers==='bad_debit'){
  a.equal(inspection.body.internal.canRefund,false);a.equal((await h.adminResolve(decision(id(1),action))).status,409);
  a.equal(await h.count('payment_review_decisions'),0);a.equal((await h.read(id(1))).manual_review_required,true);
 }else{
  a.equal((await h.adminResolve(decision(id(1),action))).body.success,true);
  a.equal((await h.adminResolve(decision(id(1),action))).body.success,true);
  a.equal(await h.count('payment_review_decisions'),1);a.equal((await h.read(id(1))).manual_review_required,false);
  a.equal((await h.db.query('SELECT earned_points FROM profiles')).rows[0].earned_points,ledgers==='fulfilled'?0:1000);
  a.equal((await h.db.query("SELECT count(*)::int n FROM point_transactions WHERE type='payment_refund'")).rows[0].n,ledgers==='debit_only'?1:0);
  a.equal((await h.db.query('SELECT provider_evidence FROM payment_review_decisions')).rows[0].provider_evidence.source,'internal_points');
 }
 a.equal(h.calls.some(c=>c.url),false);
});
test('round7 zero-card audit failure rolls back points, grants and resolution; non-admin is denied',async t=>{
 const h=await harness(t);await h.seed(id(1),quote(1000));const order=await h.read(id(1));
 await h.db.query("INSERT INTO point_transactions(user_id,type,amount,related_id) VALUES($1,'purchase',-1000,$2)",[uid,order.id]);
 await h.db.exec("UPDATE profiles SET earned_points=0; UPDATE payment_orders SET manual_review_required=true,review_reason='ledger_conflict'; CREATE FUNCTION fail_zero_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected'; END; $$; CREATE TRIGGER fail_zero_audit BEFORE INSERT ON payment_review_decisions FOR EACH ROW EXECUTE FUNCTION fail_zero_audit();");
 a.equal((await h.adminResolve(decision(id(1),'refund'))).status,409);a.equal(await h.count('payment_cancellations'),0);
 a.equal((await h.db.query('SELECT earned_points FROM profiles')).rows[0].earned_points,0);
 a.equal((await h.read(id(1))).manual_review_required,true);h.setAuth(null);
 a.equal((await h.adminResolve(decision(id(1),'refund'))).status,403);
});

test('once A used then fully cancelled preserves audit usage; a new 2900-won B is available and consumes exactly B',async t=>{
 const h=await harness(t);await h.seed(id(1),onceQuote(),'PAID');await h.complete({paymentId:id(1)});
 const aId=(await h.db.query('SELECT id FROM purchased_items')).rows[0].id;
 const first=await onceBundle(h,'set-a');a.equal(first.error,null);
 await h.db.query("UPDATE pdf_jobs SET status='done',pdf_delivered=true WHERE id=$1",[first.data.id]);
 a.equal((await onceAccess(h)).onceLeft,0);
 h.provider.get(id(1)).status='CANCELLED';a.equal((await h.webhook(id(1))).status,200);
 a.equal((await h.db.query("SELECT qb_once_purchase_id FROM feature_usage WHERE feature='plan_once_bundle'")).rows[0].qb_once_purchase_id,aId);
 a.equal((await h.db.query('SELECT revoked_items FROM payment_cancellations')).rows[0].revoked_items[0].id,aId);
 await h.seed(id(2),onceQuote(),'PAID');a.equal((await h.complete({paymentId:id(2)})).body.success,true);
 a.equal((await onceAccess(h)).onceLeft,1);
 const bId=(await h.db.query('SELECT id FROM purchased_items')).rows[0].id;
 const second=await onceBundle(h,'set-b');a.equal(second.error,null);
 a.equal((await h.db.query('SELECT qb_once_purchase_id FROM feature_usage WHERE title=$1',[second.data.id])).rows[0].qb_once_purchase_id,bId);
 a.equal((await onceAccess(h)).onceLeft,0);a.match((await onceBundle(h,'set-c')).error.message,/PLAN_LIMIT/);
 a.equal((await h.db.query("SELECT count(*)::int n FROM feature_usage WHERE feature='plan_once_bundle'")).rows[0].n,2);
 await h.webhook(id(1));a.equal((await onceAccess(h)).onceLeft,0);a.equal(await h.count('payment_cancellations'),1);
});

for(const cancelled of [1,2])test(`once receipts do not move between existing purchases when ${cancelled===1?'used A':'unused B'} is cancelled`,async t=>{
 const h=await harness(t);await h.seed(id(1),onceQuote(),'PAID');await h.complete({paymentId:id(1)});
 await h.seed(id(2),onceQuote(),'PAID');await h.complete({paymentId:id(2)});
 const aId=(await h.db.query('SELECT id FROM purchased_items WHERE payment_id=$1',[id(1)])).rows[0].id;
 const job=await onceBundle(h,'set-a');a.equal(job.error,null);
 a.equal((await h.db.query('SELECT qb_once_purchase_id FROM feature_usage')).rows[0].qb_once_purchase_id,aId);
 h.provider.get(id(cancelled)).status='CANCELLED';await h.webhook(id(cancelled));
 a.equal((await onceAccess(h)).onceLeft,cancelled===1?1:0);
 const attempt=await onceBundle(h,'set-b');a.equal(!!attempt.error,cancelled===2);
});

test('once failed undelivered job releases only its receipt; two distinct requests cannot spend the final credit twice',async t=>{
 const h=await harness(t);await h.seed(id(1),onceQuote(),'PAID');await h.complete({paymentId:id(1)});
 const first=await onceBundle(h,'failed');a.equal(first.error,null);
 await h.db.query("UPDATE pdf_jobs SET status='error' WHERE id=$1",[first.data.id]);
 a.equal((await onceAccess(h)).onceLeft,1);
 const results=await Promise.all([onceBundle(h,'new-a'),onceBundle(h,'new-b')]);
 a.equal(results.filter(r=>!r.error).length,1);a.match(results.find(r=>r.error).error.message,/PLAN_LIMIT/);
 a.equal((await onceAccess(h)).onceLeft,0);
 a.equal((await h.db.query("SELECT count(*)::int n,count(DISTINCT qb_once_purchase_id)::int receipts FROM feature_usage")).rows[0].n,2);
});

test('once migration backfills live usage FIFO, leaves failed and orphaned history intact and never assigns a future purchase',async t=>{
 const {randomUUID}=require('node:crypto');const aId=randomUUID(),bId=randomUUID(),failedJob=randomUUID();
 const h=await harness(t,{beforeResolution:async db=>{
  await db.query("INSERT INTO purchased_items(id,user_id,item_type,created_at) VALUES($1,$3,'QB_ONCE',now()-interval '4 days'),($2,$3,'QB_ONCE',now()-interval '2 days')",[aId,bId,uid]);
  await db.query("INSERT INTO pdf_jobs(id,user_id,status) VALUES($1,$2,'error')",[failedJob,uid]);
  for(const [title,days] of [['orphan',5],[failedJob,3.5],['old-a',3],['old-b',1]])
   await db.query("INSERT INTO feature_usage(user_id,feature,title,created_at) VALUES($1,'plan_once_bundle',$2,now()-$3*interval '1 day')",[uid,title,days]);
 }});
 const uses=(await h.db.query('SELECT title,qb_once_purchase_id FROM feature_usage ORDER BY created_at')).rows;
 a.deepEqual(uses.map(u=>u.qb_once_purchase_id),[null,aId,aId,bId]);a.equal((await onceAccess(h)).onceLeft,0);
 await h.db.query('DELETE FROM purchased_items WHERE id=$1',[aId]);
 await h.db.query("INSERT INTO purchased_items(user_id,item_type) VALUES($1,'QB_ONCE')",[uid]);
 a.equal((await onceAccess(h)).onceLeft,1);a.equal((await onceBundle(h,'fresh')).error,null);
 a.equal(await h.count('feature_usage'),5);
});

test('completed partial cancellation persists in the operator inbox with a six-hour lease; repeated scheduled runs keep checkout healthy',async t=>{
 const h=await harness(t);await h.seed(id(1),quote(500,1500),'PAID');await h.complete({paymentId:id(1)});
 h.provider.get(id(1)).status='PARTIAL_CANCELLED';await h.db.exec("UPDATE payment_orders SET reconcile_after=now()-interval '1 minute'");
 for(let n=0;n<4;n++){
  await h.db.exec("UPDATE payment_reconcile_dispatches SET scheduled_at=now()-interval '16 minutes'");
  const run=await h.scheduledRun();a.equal(run.status,200);a.equal(run.body.workerHealthy,true);a.equal(run.body.orderFailures,0);
  a.equal((await h.sb.rpc('payment_checkout_ready',{})).data,true);
 }
 const row=await h.read(id(1));a.equal(row.status,'completed');a.equal(row.provider_status,'PARTIAL_CANCELLED');
 a.equal(row.manual_review_required,true);a.equal(row.review_reason,'partial_cancelled');a.ok(Date.parse(row.reconcile_after)>Date.now()+5*3600000);
 const inbox=await h.adminGet();a.equal(inbox.body.orders.length,1);a.equal(inbox.body.orders[0].payment_id,id(1));
 a.equal(h.calls.filter(c=>c.rpc==='record_payment_partial_cancellation').length,1);
 a.equal(h.calls.filter(c=>c.url?.endsWith('/cancel')).length,0);a.equal(await h.count('payment_cancellations'),0);
 a.equal(await h.count('purchased_items'),1);a.equal((await h.db.query('SELECT earned_points FROM profiles')).rows[0].earned_points,500);
 const other=quote();other.items[0].item_id='33333333-3333-4333-8333-333333333333';a.equal((await h.create(id(2),[],other)).error,null);
 a.equal((await h.orders({})).body.code,'PAYMENT_MANUAL_REVIEW');
});

test('operator can finish a modern partial cancellation with audited remaining-card cancellation and one point return, including retry',async t=>{
 const h=await harness(t);await h.seed(id(1),quote(500,1500),'PAID');await h.complete({paymentId:id(1)});
 h.provider.get(id(1)).status='PARTIAL_CANCELLED';a.equal((await h.complete({paymentId:id(1)})).body.code,'PAYMENT_MANUAL_REVIEW');
 const inspection=await h.adminGet('paymentId='+id(1));a.equal(inspection.body.verified,true);a.equal(inspection.body.ledger,'fulfilled');
 a.equal((await h.adminResolve(decision(id(1),'fulfill'))).status,409);
 h.setCancel('fail');a.equal((await h.adminResolve(decision(id(1),'refund'))).status,202);
 a.equal((await h.read(id(1))).legacy_resolution,false);a.equal((await h.read(id(1))).refund_status,'pending');
 h.setCancel('ok');await h.db.exec("UPDATE payment_orders SET reconcile_after=now()-interval '1 minute'");a.equal((await h.scheduledRun()).status,200);
 a.equal((await h.read(id(1))).status,'cancelled');a.equal((await h.db.query('SELECT earned_points FROM profiles')).rows[0].earned_points,1000);
 const decisions=(await h.db.query('SELECT * FROM payment_review_decisions')).rows;a.equal(decisions.length,1);a.equal(decisions[0].action,'refund');
 a.equal(decisions[0].provider_evidence.status,'PARTIAL_CANCELLED');
 a.equal((await h.db.query("SELECT count(*)::int n FROM point_transactions WHERE type='payment_refund'")).rows[0].n,1);
 a.equal((await h.adminResolve(decision(id(1),'refund'))).body.refunded,true);
 a.equal(await h.count('payment_cancellations'),1);a.equal((await h.adminGet()).body.orders.length,0);
});

test('partial review rejects mismatched identity, direct browser recording and refunds without an actionable review',async t=>{
 const h=await harness(t);await h.seed(id(1),quote(),'PAID');await h.complete({paymentId:id(1)});
 a.equal((await h.adminResolve(decision(id(1),'refund'))).status,409);
 await h.db.exec('UPDATE payment_orders SET manual_review_required=true');
 a.equal((await h.adminResolve(decision(id(1),'refund'))).status,409);
 h.provider.get(id(1)).status='PARTIAL_CANCELLED';h.provider.get(id(1)).customer.id=item;
 a.equal((await h.webhook(id(1))).status,200);a.equal((await h.read(id(1))).review_reason,'provider_mismatch');
 a.equal((await h.adminResolve(decision(id(1),'refund',{confirmedOwner:true}))).status,503);
 await a.rejects(h.db.exec("SET ROLE authenticated; SELECT record_payment_partial_cancellation('"+id(1)+"')"));await h.db.exec('RESET ROLE');
 a.equal(h.calls.filter(c=>c.url?.endsWith('/cancel')).length,0);
});

test('one permanent order exception is durably reviewed by a healthy worker and cannot close all new checkout',async t=>{
 const h=await harness(t,{ready:false});await h.seed(id(1),quote(),'PAID');h.provider.get(id(1)).amount.total=1;
 for(let n=0;n<4;n++){
  await h.db.exec("UPDATE payment_orders SET reconcile_after=now()-interval '1 minute'; UPDATE payment_reconcile_dispatches SET scheduled_at=now()-interval '16 minutes'");
  const run=await h.scheduledRun();a.equal(run.status,200);a.equal(run.body.workerHealthy,true);a.equal(run.body.allOrdersProcessed,true);a.equal(run.body.orderFailures,0);
  a.equal((await h.sb.rpc('payment_checkout_ready',{})).data,true);
 }
 const run=(await h.db.query('SELECT results FROM payment_reconcile_runs ORDER BY finished_at DESC LIMIT 1')).rows[0].results;
 a.equal(run.workerHealthy,true);a.equal(run.orderFailures,0);a.equal(run.results[0],'PAYMENT_MANUAL_REVIEW');
 const other=quote();other.items[0].item_id='33333333-3333-4333-8333-333333333333';
 a.equal((await h.create(id(2),[],other)).error,null);a.equal(await h.count('purchased_items'),0);
});

test('partial cancellation persistence failure is retried and never acknowledged as an operator review',async t=>{
 const h=await harness(t);await h.seed(id(1),quote(),'PAID');await h.complete({paymentId:id(1)});h.provider.get(id(1)).status='PARTIAL_CANCELLED';
 await h.db.exec("CREATE FUNCTION fail_partial() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF new.review_reason='partial_cancelled' THEN RAISE EXCEPTION 'injected'; END IF; RETURN new; END $$; CREATE TRIGGER fail_partial BEFORE UPDATE ON payment_orders FOR EACH ROW EXECUTE FUNCTION fail_partial();");
 a.equal((await h.webhook(id(1))).status,503);a.equal((await h.read(id(1))).manual_review_required,false);
 await h.db.exec('DROP TRIGGER fail_partial ON payment_orders');a.equal((await h.webhook(id(1))).status,200);
 a.equal((await h.read(id(1))).manual_review_required,true);
});

for(const stage of ['supersede','resolution','schedule'])test(`old server direct INSERT survives preparation at ${stage}; browser roles remain denied`,async t=>{
 const h=await harness(t,{stage});
 if(stage==='schedule')a.equal((await h.sb.rpc('payment_checkout_ready',{})).data,true);
 await h.db.exec('GRANT SELECT ON purchased_items TO service_role');
 await h.db.exec('SET ROLE service_role');
 await h.db.query("INSERT INTO payment_orders(payment_id,user_id,kind,amount,total,items,name) VALUES($1,$2,'cart',1000,1000,$3,'old route')",[id(1),uid,JSON.stringify(quote().items)]);
 await h.db.exec('RESET ROLE');
 a.equal((await h.complete({paymentId:id(1)})).body.code,stage==='supersede'?'PAYMENT_NOT_PAID':'PAYMENT_RETRY_CHOICE');
 h.provider.set(id(1),{id:id(1),status:'PAID',currency:'KRW',amount:{total:1000},customer:{id:uid},customData:{orderId:id(1)}});
 a.equal((await h.complete({paymentId:id(1)})).body.success,true);
 for(const role of ['authenticated','anon']){
  await h.db.exec('SET ROLE '+role);
  await a.rejects(h.db.query("INSERT INTO payment_orders(payment_id,user_id,kind,amount,total,items,name) VALUES($1,$2,'cart',1000,1000,$3,'old route')",[id(1),uid,JSON.stringify(quote().items)]),/permission denied/);
  await h.db.exec('RESET ROLE');
 }
 a.equal(await h.count('payment_orders'),1);
 if(stage==='schedule'){
  await h.db.exec('SET ROLE service_role');const result=await h.create(id(2));await h.db.exec('RESET ROLE');
  a.equal(result.error,null);a.equal(await h.count('payment_orders'),2);
  await h.db.exec('UPDATE cron.job SET active=false');await h.db.exec('SET ROLE service_role');
  const stopped=await h.create(id(3));await h.db.exec('RESET ROLE');a.ok(stopped.error);a.equal(await h.count('payment_orders'),2);
 }
});

for(const channel of ['complete','webhook','cron'])test(`pending partial cancellation via ${channel} is a durable review without delivery or point debit`,async t=>{
 const h=await harness(t);await h.seed(id(1),quote(500,1500),'PARTIAL_CANCELLED');
 if(channel==='complete')a.equal((await h.complete({paymentId:id(1)})).body.code,'PAYMENT_MANUAL_REVIEW');
 if(channel==='webhook')a.equal((await h.webhook(id(1))).status,200);
 if(channel==='cron'){await h.db.exec("UPDATE payment_orders SET reconcile_after=now()-interval '1 minute'");const run=await h.scheduledRun();a.equal(run.status,200);a.equal(run.body.orderFailures,0);}
 const row=await h.read(id(1));a.equal(row.status,'pending');a.equal(row.manual_review_required,true);a.equal(row.review_reason,'partial_cancelled');
 a.equal(row.provider_status,'PARTIAL_CANCELLED');a.ok(row.provider_checked_at);a.ok(Date.parse(row.reconcile_after)>Date.now()+5*3600000);
 a.equal((await h.adminGet()).body.orders[0].payment_id,id(1));
 for(const table of ['payment_history','purchased_items','point_transactions','payment_cancellations'])a.equal(await h.count(table),0);
 a.equal((await h.db.query('SELECT earned_points FROM profiles')).rows[0].earned_points,1000);
 a.equal(h.calls.some(c=>c.rpc==='complete_payment_order_v2'||c.url?.endsWith('/cancel')),false);
});

const otherItem='33333333-3333-4333-8333-333333333333';
async function addOtherMaterial(h){await h.db.query("INSERT INTO exam_materials(id,title,price,file_type) VALUES($1,'다른 자료',1000,'HWP')",[otherItem]);}
for(const cause of ['partial_cancelled','provider_mismatch','provider_state','ledger_conflict'])test(`orders API isolates permanent ${cause}, blocks overlapping goods and permits unrelated goods without replacing the review`,async t=>{
 const h=await harness(t);await addOtherMaterial(h);
 await h.seed(id(1),quote(),cause==='partial_cancelled'?'PARTIAL_CANCELLED':cause==='provider_state'?'UNKNOWN_FUTURE':'PAID');
 if(cause==='provider_mismatch')h.provider.get(id(1)).amount.total=1;
 if(cause==='ledger_conflict')await h.db.query("INSERT INTO payment_history(user_id,payment_id,amount,status) VALUES($1,$2,1,'PAID')",[uid,id(1)]);
 const created=await h.orders({items:[{item_id:otherItem}]});a.equal(created.status,200);a.ok(created.body.paymentId);
 const row=await h.read(id(1));a.equal(row.status,'pending');a.equal(row.manual_review_required,true);a.equal(row.review_reason,cause);
 a.equal(row.superseded_by,null);a.equal(row.refund_status,null);
 const createCall=h.calls.find(c=>c.rpc==='create_payment_order');a.equal(createCall.args.p_previous_payment_ids.includes(id(1)),false);
 a.equal((await h.orders({supersedePaymentId:id(1),replaceOpen:true})).body.code,'PAYMENT_MANUAL_REVIEW');
 const explicit=await h.orders({items:[{item_id:otherItem}],supersedePaymentId:id(1),replaceOpen:true});a.equal(explicit.status,200);
 a.equal((await h.read(id(1))).status,'pending');a.equal((await h.read(id(1))).manual_review_required,true);
 a.equal((await h.create(id(90),[id(1)],quote())).data.reviewRequired,true);
 a.equal(await h.count('purchased_items'),0);a.equal(h.calls.some(c=>c.url?.endsWith('/cancel')),false);
});

test('operator settles pending partial cancellation with remaining-card cancellation, an audit ledger and zero unearned point return',async t=>{
 const h=await harness(t);await h.seed(id(1),quote(500,1500),'PARTIAL_CANCELLED');await h.complete({paymentId:id(1)});
 const info=await h.adminGet('paymentId='+id(1));a.equal(info.body.verified,true);a.equal(info.body.ledger,'unfulfilled');
 a.equal((await h.adminResolve(decision(id(1),'fulfill'))).status,409);
 h.setCancel('fail');a.equal((await h.adminResolve(decision(id(1),'refund'))).status,202);
 a.equal((await h.read(id(1))).refund_status,'pending');a.equal(await h.count('purchased_items'),0);
 h.setCancel('ok');await h.db.exec("UPDATE payment_orders SET reconcile_after=now()-interval '1 minute'");a.equal((await h.scheduledRun()).status,200);
 const row=await h.read(id(1));a.equal(row.status,'cancelled');a.equal(row.manual_review_required,false);a.equal(row.refund_status,'succeeded');
 const c=(await h.db.query('SELECT * FROM payment_cancellations')).rows[0];a.equal(c.returned_points,0);a.equal(c.ledger_state,'unfulfilled');
 a.equal((await h.db.query('SELECT earned_points FROM profiles')).rows[0].earned_points,1000);a.equal(await h.count('point_transactions'),0);
 const decisions=(await h.db.query('SELECT * FROM payment_review_decisions')).rows;a.equal(decisions.length,1);a.equal(decisions[0].provider_evidence.status,'PARTIAL_CANCELLED');
 a.equal((await h.adminResolve(decision(id(1),'refund'))).body.refunded,true);a.equal(await h.count('payment_cancellations'),1);
 a.equal((await h.adminGet()).body.orders.length,0);a.equal((await h.orders({})).status,200);
});

test('pending partial cancellation verifies payment id, amount, currency, owner and custom order before authorizing partial review',async t=>{
 const h=await harness(t);
 const invalid=[{id:id(99)},{amount:{total:1}},{currency:'USD'},{customer:{id:item}},{customData:{orderId:id(99)}},{customData:'invalid json'}];
 // These independent approvals were already open before any review was observed.
 for(let n=0;n<invalid.length;n++)await h.seed(id(n+1),quote(),'PARTIAL_CANCELLED');
 for(let n=0;n<invalid.length;n++){
  const paymentId=id(n+1);Object.assign(h.provider.get(paymentId),invalid[n]);
  a.equal((await h.complete({paymentId})).body.code,'PAYMENT_MANUAL_REVIEW');const row=await h.read(paymentId);
  a.equal(row.review_reason,'provider_mismatch');a.equal(row.status,'pending');a.equal(row.manual_review_required,true);
  a.equal((await h.adminResolve(decision(paymentId,'refund',{confirmedOwner:true}))).status,503);
 }
 a.equal(h.calls.some(c=>c.rpc==='record_payment_partial_cancellation'||c.url?.endsWith('/cancel')),false);
 for(const table of ['purchased_items','point_transactions','payment_cancellations'])a.equal(await h.count(table),0);
});

test('a delayed PAID completion and direct replacement cannot bypass a pending partial review or grant on a later PAID snapshot',async t=>{
 const h=await harness(t);await h.seed(id(1),quote(),'PAID');
 h.setBeforeComplete(async()=>{h.provider.get(id(1)).status='PARTIAL_CANCELLED';a.equal((await h.webhook(id(1))).status,200);});
 a.equal((await h.complete({paymentId:id(1)})).body.code,'PAYMENT_MANUAL_REVIEW');
 a.equal((await h.sb.rpc('complete_payment_order_v2',{p_payment_id:id(1),p_user_id:uid})).data.reviewRequired,true);
 a.ok((await h.sb.rpc('supersede_payment_order',{p_payment_id:id(1),p_user_id:uid,p_reason:'selection_changed'})).error);
 h.provider.get(id(1)).status='PAID';a.equal((await h.complete({paymentId:id(1)})).body.code,'PAYMENT_MANUAL_REVIEW');
 a.equal((await h.adminResolve(decision(id(1),'fulfill'))).status,409);
 a.equal((await h.read(id(1))).status,'pending');a.equal(await h.count('payment_history'),0);a.equal(await h.count('purchased_items'),0);
});

for(const status of ['PARTIAL_CANCELLED','UNKNOWN_FUTURE'])test(`failed persistence of pending ${status} keeps webhook and unrelated creation retryable`,async t=>{
 const h=await harness(t);await addOtherMaterial(h);await h.seed(id(1),quote(),status);
 await h.db.exec("CREATE FUNCTION fail_review() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF new.manual_review_required THEN RAISE EXCEPTION 'injected'; END IF; RETURN new; END $$; CREATE TRIGGER fail_review BEFORE UPDATE ON payment_orders FOR EACH ROW EXECUTE FUNCTION fail_review();");
 a.equal((await h.webhook(id(1))).status,503);a.equal((await h.orders({items:[{item_id:otherItem}]})).status,503);
 a.equal((await h.read(id(1))).manual_review_required,false);a.equal(await h.count('payment_orders'),1);
 await h.db.exec('DROP TRIGGER fail_review ON payment_orders');a.equal((await h.orders({items:[{item_id:otherItem}]})).status,200);
});

test('provider outage stays retryable without inventing a review, while generic review recording rejects browser access',async t=>{
 const h=await harness(t);await addOtherMaterial(h);await h.seed(id(1),quote(),'PAID');h.provider.get(id(1)).lookupStatus=503;
 a.equal((await h.orders({items:[{item_id:otherItem}]})).status,503);a.equal((await h.read(id(1))).manual_review_required,false);
 await h.db.exec("UPDATE payment_orders SET reconcile_after=now()-interval '1 minute'");const run=await h.scheduledRun();
 a.equal(run.status,200);a.equal(run.body.workerHealthy,true);a.equal(run.body.orderFailures,1);a.equal((await h.sb.rpc('payment_checkout_ready',{})).data,true);
 for(const role of ['anon','authenticated']){
  await a.rejects(h.db.exec(`SET ROLE ${role}; SELECT record_payment_review('${id(1)}','PAID','provider_mismatch')`));await h.db.exec('RESET ROLE');
 }
 a.equal(await h.count('payment_orders'),1);a.equal(await h.count('purchased_items'),0);
});

test('a persistent cancellation rejection is isolated from unrelated purchases, blocks the same goods and stays automatically retryable',async t=>{
 const h=await harness(t);await addOtherMaterial(h);await h.seed(id(1),quote(500),'PAID');await h.db.exec('UPDATE profiles SET earned_points=0');h.setCancel('fail');
 a.equal((await h.complete({paymentId:id(1)})).body.code,'PAYMENT_REFUND_PENDING');
 let row=await h.read(id(1));a.equal(row.status,'superseded');a.equal(row.refund_status,'pending');a.equal(row.manual_review_required,true);a.equal(row.review_reason,'refund_pending');
 a.equal((await h.orders({})).body.code,'PAYMENT_REFUND_PENDING');a.equal((await h.create(id(80))).data.reviewRequired,true);
 a.equal((await h.orders({items:[{item_id:otherItem}],supersedePaymentId:id(1)})).status,200);
 a.equal((await h.read(id(1))).refund_status,'pending');a.equal(await h.count('purchased_items'),0);
 h.setCancel('ok');await h.db.exec("UPDATE payment_orders SET reconcile_after=now()-interval '1 minute'");a.equal((await h.scheduledRun()).status,200);
 row=await h.read(id(1));a.equal(row.refund_status,'succeeded');a.equal(row.manual_review_required,false);
 a.equal((await h.adminGet()).body.orders.length,0);a.equal(await h.count('point_transactions'),0);
});

for(const cause of ['provider_mismatch','provider_state'])test(`operator can settle ${cause} only after fresh provider identity and a refundable state are verified`,async t=>{
 const h=await harness(t);await h.seed(id(1),quote(),cause==='provider_state'?'UNKNOWN_FUTURE':'PAID');
 if(cause==='provider_mismatch')h.provider.get(id(1)).customer.id=item;
 a.equal((await h.complete({paymentId:id(1)})).body.code,'PAYMENT_MANUAL_REVIEW');
 a.ok((await h.adminResolve(decision(id(1),'refund',{confirmedOwner:true}))).status>=400);
 h.provider.get(id(1)).customer.id=uid;h.provider.get(id(1)).status='PAID';
 a.equal((await h.complete({paymentId:id(1)})).body.code,'PAYMENT_MANUAL_REVIEW');
 a.equal((await h.adminResolve(decision(id(1),'fulfill'))).status,409);
 a.equal((await h.adminResolve(decision(id(1),'refund'))).body.refunded,true);
 a.equal((await h.read(id(1))).status,'cancelled');a.equal((await h.adminGet()).body.orders.length,0);
 a.equal(await h.count('purchased_items'),0);a.equal(await h.count('point_transactions'),0);a.equal(await h.count('payment_review_decisions'),1);
});

test('pending partial cancellation with a historical ledger conflict supports audited cancellation then review closure',async t=>{
 const h=await harness(t);await h.seed(id(1),quote(),'PARTIAL_CANCELLED');
 await h.db.query("INSERT INTO purchased_items(user_id,payment_id,item_type,item_id,title,price_paid) VALUES($1,$2,'HWP_DOC',$3,'옛 원장',1)",[uid,id(1),item]);
 await h.complete({paymentId:id(1)});a.equal((await h.adminResolve(decision(id(1),'refund'))).body.refunded,true);
 a.equal((await h.read(id(1))).status,'cancelled');a.equal((await h.read(id(1))).manual_review_required,true);
 a.equal((await h.orders({})).body.code,'PAYMENT_MANUAL_REVIEW');
 a.equal((await h.adminResolve(decision(id(1),'close_review'))).body.reviewClosed,true);
 a.equal((await h.read(id(1))).manual_review_required,false);a.equal((await h.orders({})).status,200);
 a.equal(await h.count('payment_cancellations'),1);a.equal(await h.count('payment_review_decisions'),2);a.equal(await h.count('point_transactions'),0);
});

test('zero-won ledger review remains a review when retry items or points change, rather than an endless replacement error',async t=>{
 const h=await harness(t);await h.seed(id(1),quote(1000));
 await h.db.query("INSERT INTO payment_history(user_id,payment_id,amount,status) VALUES($1,$2,0,'PAID')",[uid,id(1)]);
 a.equal((await h.complete({paymentId:id(1)})).body.code,'PAYMENT_MANUAL_REVIEW');
 a.equal((await h.complete({paymentId:id(1),retryInput:{items:[{item_id:otherItem}],usedPoints:0}})).body.code,'PAYMENT_MANUAL_REVIEW');
 a.equal((await h.read(id(1))).status,'pending');a.equal((await h.read(id(1))).review_reason,'ledger_conflict');
 a.equal(await h.count('purchased_items'),0);a.equal(await h.count('point_transactions'),0);
});


// Round 8: actual final SQL and server paths, all DB/provider traffic stays local.
const planQuote=type=>{const cfg=require('../src/lib/qbPassConfig.ts');const plan=type==='QB_EXAM'?cfg.PASS_EXAM:cfg.QB_PASS_TERMS[0];const price=type==='QB_EXAM'?plan.price:cfg.termPrice(plan.months);return {kind:'cart',amount:price,total:price,used_points:0,points:0,items:[{item_id:plan.itemId,item_type:type,title:'이용권',price}],name:'이용권'};};
async function paidPlanBundle(h,charge,kind='print',hash=require('node:crypto').randomUUID(),email=null){
 const {randomUUID}=require('node:crypto'),receipt=randomUUID(),job=randomUUID(),questions=[item];
 await h.db.query('INSERT INTO bundle_selections VALUES($1,$2,$3,$4)',[receipt,uid,kind,questions]);
 if(kind==='print'&&charge==='exam'&&!((await h.db.query("SELECT 1 FROM feature_usage WHERE feature='plan_free_bundle'")).rows.length))
  await h.db.query("INSERT INTO feature_usage(user_id,feature) VALUES($1,'plan_free_bundle'),($1,'plan_free_bundle')",[uid]);
 return h.sb.rpc('create_plan_bundle',{p_id:job,p_user:uid,p_email:email,p_kind:kind,p_title:'paid bundle',p_ids:questions,p_hash:hash,p_charge:charge,p_hwp:false,p_features:[],p_limit:999,p_since:null,p_receipt:receipt});
}
for(const type of ['QB_EXAM','QB_PASS'])for(const kind of ['print','predict'])for(const status of ['pending','working'])
test(`round8 ${type} ${kind} ${status}: full refund revokes purchase-backed jobs, worker completion and PDF/HWP delivery`,async t=>{
 const h=await harness(t),charge=type==='QB_EXAM'?'exam':'teacher';
 await h.seed(id(81),planQuote(type),'PAID');a.equal((await h.complete({paymentId:id(81)})).body.success,true);
 const purchase=(await h.db.query('SELECT id FROM purchased_items')).rows[0].id;
 const bundle=await paidPlanBundle(h,charge,kind);a.equal(bundle.error,null);a.equal(bundle.data.plan_charge,charge);
 a.deepEqual(bundle.data.authorization_purchase_ids,[purchase]);
 await h.db.query('UPDATE pdf_jobs SET status=$1 WHERE id=$2',[status,bundle.data.id]);
 a.equal((await h.sb.rpc('check_bundle_delivery',{p_user:uid,p_id:bundle.data.id})).data,true);
 h.provider.get(id(81)).status='CANCELLED';a.equal((await h.webhook(id(81))).status,200);
 const job=(await h.db.query('SELECT * FROM pdf_jobs')).rows[0];a.ok(job.revoked_at);a.equal(job.revoked_payment_id,id(81));
 a.equal((await h.sb.rpc('check_bundle_delivery',{p_user:uid,p_id:job.id})).data,false);
 a.match((await h.sb.rpc('claim_bundle_hwp',{p_user:uid,p_id:job.id})).error.message,/BUNDLE_UNAVAILABLE/);
 await a.rejects(h.db.query("UPDATE pdf_jobs SET status='done',pdf_delivered=true WHERE id=$1",[job.id]),/BUNDLE_REVOKED/);
 await h.db.query('UPDATE pdf_jobs SET revoked_at=null,authorization_purchase_ids=ARRAY[]::text[] WHERE id=$1',[job.id]);
 const guarded=(await h.db.query('SELECT revoked_at,authorization_purchase_ids FROM pdf_jobs WHERE id=$1',[job.id])).rows[0];
 a.ok(guarded.revoked_at);a.deepEqual(guarded.authorization_purchase_ids,[purchase]);
 await h.webhook(id(81));a.equal(await h.count('payment_cancellations'),1);
});
for(const type of ['QB_EXAM','QB_PASS'])for(const kind of ['print','predict'])
test(`round8 ${type} ${kind}: cancellation after entitlement read rejects a stale create_plan_bundle snapshot`,async t=>{
 const h=await harness(t),charge=type==='QB_EXAM'?'exam':'teacher';await h.seed(id(82),planQuote(type),'PAID');await h.complete({paymentId:id(82)});
 h.advance(1000); // The VM clock must follow the SQL purchase timestamp.
 const status=await h.load('src/lib/qbPass.ts').passStatus({id:uid});a.equal(type==='QB_PASS'?status.unlimited:!!status.examUntil,true);
 // Represents HML build/upload occurring after prepareBundle read passStatus.
 if(kind==='print'&&charge==='exam')await h.db.query("INSERT INTO feature_usage(user_id,feature) VALUES($1,'plan_free_bundle'),($1,'plan_free_bundle')",[uid]);
 h.provider.get(id(82)).status='CANCELLED';await h.webhook(id(82));
 const rejected=await paidPlanBundle(h,charge,kind,undefined,'mathofhy@naver.com');a.match(rejected.error.message,/PLAN_LIMIT/);
 a.equal(await h.count('pdf_jobs'),0);a.equal((await h.db.query("SELECT count(*)::int n FROM feature_usage WHERE title IS NOT NULL")).rows[0].n,0);
});
for(const type of ['QB_EXAM','QB_PASS'])test(`round8 ${type}: expired purchases cannot authorize a new predict bundle`,async t=>{
 const h=await harness(t);await h.db.query("INSERT INTO purchased_items(user_id,item_type,created_at) VALUES($1,$2,now()-interval '400 days')",[uid,type]);
 a.match((await paidPlanBundle(h,type==='QB_EXAM'?'exam':'teacher','predict')).error.message,/PLAN_LIMIT/);a.equal(await h.count('pdf_jobs'),0);
});
for(const type of ['QB_EXAM','QB_PASS'])test(`round12 ${type}: ambiguous backfill preserves shared jobs and records cancellation review`,async t=>{
 const {randomUUID}=require('node:crypto'),aId=randomUUID(),bId=randomUUID(),job=randomUUID();
 const h=await harness(t,{stage:'supersede',beforeResolution:async db=>{
  await db.query("INSERT INTO purchased_items(id,user_id,payment_id,item_type,created_at) VALUES($1,$3,'old-paid',$4,now()-interval '2 days'),($2,$3,'other-paid',$4,now()-interval '1 day')",[aId,bId,uid,type]);
  await db.query("INSERT INTO pdf_jobs(id,user_id,kind,plan_charge,created_at) VALUES($1,$2,'print',$3,now()-interval '1 hour')",[job,uid,type==='QB_EXAM'?'exam':'teacher']);
 }});
 await h.seed('old-paid',planQuote(type),'CANCELLED');
 await h.db.exec(migration('resolution'));
 const refs=(await h.db.query('SELECT authorization_purchase_ids FROM pdf_jobs')).rows[0].authorization_purchase_ids;a.deepEqual(new Set(refs),new Set([aId,bId]));
 await h.sb.rpc('record_payment_cancellation',{p_payment_id:'old-paid',p_cancellation_id:null});
 a.equal((await h.db.query('SELECT revoked_at FROM pdf_jobs')).rows[0].revoked_at,null);
 a.equal((await h.sb.rpc('check_bundle_delivery',{p_user:uid,p_id:job})).data,true);
 a.deepEqual((await h.db.query('SELECT bundle_review_ids FROM payment_cancellations')).rows[0].bundle_review_ids,[job]);
 a.equal((await h.read('old-paid')).manual_review_required,true); // Its unproven old ledger remains a blocking review.
});
for(const stage of ['legacy','supersede','resolution','schedule'])test(`round8 ${stage}: deployed card, full-point, pass and private-DB order APIs survive preparation`,async t=>{
 const h=await harness(t,{stage,ready:false});
 await h.db.exec('UPDATE profiles SET earned_points=100000');
 const cfg=require('../src/lib/qbPassConfig.ts');
 await h.db.query("INSERT INTO private_dbs VALUES($1,$2,'private',1000)",[otherItem,uid]);
 for(const input of [{},{usedPoints:1000},{items:[{item_id:cfg.PASS_EXAM.itemId}]},{items:[{item_id:otherItem}]}]){
  const created=await h.orders(input);a.equal(created.status,200);a.ok(created.body.paymentId);
  const order=await h.read(created.body.paymentId);h.provider.set(order.payment_id,{id:order.payment_id,status:'PAID',currency:'KRW',amount:{total:order.amount},customer:{id:uid},customData:{orderId:order.payment_id}});
  a.equal((await h.complete({paymentId:order.payment_id})).body.success,true);
 }
 a.equal(await h.count('payment_history'),4);a.equal(await h.count('purchased_items'),4);
 a.equal(h.calls.some(c=>c.rpc==='create_payment_order'),false);
 if(stage==='legacy')a.equal(h.calls.some(c=>c.rpc==='payment_checkout_ready'),false);
 else a.equal((await h.create(id(89))).error?.message,'Payment checkout not ready');
});
for(const failure of ['absent','rolled-back'])test(`round13 reward preparation ${failure}: code-first retry leaves no ledger or balance write until atomic SQL exists`,async t=>{
 const h=await harness(t,{stage:'legacy',rewardPrepared:false});
 if(failure==='rolled-back'){
  const broken=fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261109_submission_reward_prepare.sql'),'utf8').replace('COMMIT;','SELECT 1/0; COMMIT;');
  await a.rejects(h.db.exec(broken),/division by zero/);await h.db.exec('ROLLBACK');
 }
 await h.db.query("UPDATE exam_materials SET content_type='원본제보',uploader_id=$1 WHERE id=$2",[uid,item]);
 await a.rejects(h.approve(),e=>e.status===503);
 a.equal((await h.db.query('SELECT earned_points FROM profiles')).rows[0].earned_points,1000);
 a.equal(await h.count('point_transactions'),0);
 a.equal(h.calls.some(c=>c.rpc==='reward_submission'),false);
 await h.db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261109_submission_reward_prepare.sql'),'utf8'));
 h.advance(5001);
 const adopted=await h.approve();a.equal(adopted.rewarded,5000);a.equal(adopted.typed,'working');
 a.equal((await h.db.query('SELECT earned_points FROM profiles')).rows[0].earned_points,6000);
 await a.rejects(h.approve(),e=>e.status===409);a.equal(await h.count('point_transactions'),1);
});
test('round13 independent atomic reward preserves a checkout deduction before payment SQL is installed',async t=>{
 const h=await harness(t,{stage:'legacy'});await h.seed(id(85),quote(1000),'PAID');
 await h.db.query("UPDATE exam_materials SET content_type='원본제보',uploader_id=$1 WHERE id=$2",[uid,item]);
 a.equal((await h.complete({paymentId:id(85)})).body.success,true);
 await h.approve();a.equal((await h.db.query('SELECT earned_points FROM profiles')).rows[0].earned_points,5000);
 a.equal(await h.count('point_transactions'),2);
});
test('round8 independent reward preparation works before payment SQL and switches after the short negative cache expires',async t=>{
 const h=await harness(t,{stage:'legacy',rewardPrepared:false});const check=()=>h.load('src/lib/schemaCapabilities.ts').hasSchemaCapability(h.sb,'submissionReward');
 a.equal(await check(),false);await h.db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261109_submission_reward_prepare.sql'),'utf8'));
 a.equal(await check(),false);h.advance(5001);a.equal(await check(),true);
 await h.db.query("UPDATE exam_materials SET content_type='원본제보',uploader_id=$1 WHERE id=$2",[uid,item]);
 await h.approve();a.equal(h.calls.filter(c=>c.rpc==='reward_submission').length,1);
 a.equal((await h.db.query('SELECT earned_points FROM profiles')).rows[0].earned_points,6000);
});
test('round8 reward RPC failure never falls back to the old balance writer',async t=>{
 const h=await harness(t,{stage:'legacy'});await h.db.query("UPDATE exam_materials SET content_type='원본제보',uploader_id=$1 WHERE id=$2",[uid,item]);
 const rpc=h.sb.rpc;h.sb.rpc=async(name,args)=>name==='reward_submission'?{error:{code:'XX000'}}:rpc(name,args);
 await a.rejects(h.approve());a.equal(await h.count('point_transactions'),0);a.equal((await h.db.query('SELECT earned_points FROM profiles')).rows[0].earned_points,1000);
});

test('round8 completed creation replay stays recoverable after cutover even when the worker stops',async t=>{
 const h=await harness(t),requestId=require('node:crypto').randomUUID();
 const first=await h.orders({requestId});a.ok(first.body.paymentId);
 await h.db.exec(migration('cutover'));await h.db.exec('UPDATE cron.job SET active=false');
 const replay=await h.orders({requestId});a.equal(replay.status,200);a.equal(replay.body.recoverPaymentId,first.body.paymentId);
 a.equal(await h.count('payment_orders'),1);a.equal((await h.orders({})).status,503);
});

// Round 9: scope is deployed-code regressions and the new payment lifecycle.
for(const stage of ['legacy','supersede','resolution','schedule'])test(`round9 ${stage}: legacy replacement cannot leave an approvable checkout behind`,async t=>{
 const h=await harness(t,{stage,ready:false});
 const first=await h.orders({});a.equal(first.status,200);const previous=first.body.paymentId;
 h.provider.set(previous,{id:previous,status:'READY',currency:'KRW',amount:{total:1000},customer:{id:uid},customData:{orderId:previous}});
 // Lost pointers/request IDs (including old tabs) recover the same checkout.
 const lost=await h.orders({usedPoints:1000});a.equal(lost.body.recoverPaymentId,previous);
 const old=await h.orders({usedPoints:1000,requestId:undefined});a.equal(old.body.code,'PAYMENT_RESUME_REQUIRED');a.equal(old.body.resumeOrder.paymentId,previous);
 for(const requestId of [require('node:crypto').randomUUID(),undefined]){
  const retry=await h.orders({usedPoints:1000,requestId,supersedePaymentId:previous,replaceOpen:true});
  if(requestId){a.equal(retry.status,200);a.equal(retry.body.recoverPaymentId,previous);}
  else {a.equal(retry.status,409);a.equal(retry.body.code,'PAYMENT_RESUME_REQUIRED');a.equal(retry.body.resumeOrder.paymentId,previous);}
 }
 a.equal(await h.count('payment_orders'),1);a.equal(await h.count('payment_history'),0);a.equal(await h.count('point_transactions'),0);
 // The original card can still approve/complete, exactly once.
 h.provider.get(previous).status='PAID';a.equal((await h.complete({paymentId:previous})).body.success,true);
 a.equal((await h.complete({paymentId:previous})).body.alreadyProcessed,true);
 a.equal((await h.orders({supersedePaymentId:previous,replaceOpen:true})).body.recoverPaymentId,previous);
 a.equal(await h.count('purchased_items'),1);a.equal(await h.count('payment_orders'),1);
 a.equal((await h.db.query('SELECT earned_points FROM profiles')).rows[0].earned_points,1000);
});
test('round9 legacy refuses replacement intent without a pointer and fails closed on pending lookup errors',async t=>{
 const h=await harness(t,{stage:'legacy'});
 a.equal((await h.orders({replaceOpen:true})).status,503);a.equal(await h.count('payment_orders'),0);
 const original=h.sb.from;h.sb.from=table=>{
  const query=original(table),select=query.select;
  query.select=function(column){if(table==='payment_orders'&&column==='payment_id')return {eq(){return this;},limit:async()=>({data:null,error:{code:'42501'}})};return select.call(this,column);};
  return query;
 };
 a.equal((await h.orders({})).status,503);a.equal(await h.count('payment_orders'),0);
});
test('round9 legacy replacement refusal clears after real worker readiness; late card approval refunds with goods and points once',async t=>{
 const h=await harness(t,{ready:false});const first=await h.orders({});const previous=first.body.paymentId;
 h.provider.set(previous,{id:previous,status:'READY',currency:'KRW',amount:{total:1000},customer:{id:uid},customData:{orderId:previous}});
 const replacement={usedPoints:1000,supersedePaymentId:previous,replaceOpen:true};
 a.equal((await h.orders(replacement)).body.recoverPaymentId,previous);a.equal(await h.count('payment_orders'),1);
 a.equal((await h.scheduledRun()).status,200);
 const next=await h.orders(replacement);a.equal(next.status,200);a.notEqual(next.body.paymentId,previous);
 a.equal((await h.complete({paymentId:next.body.paymentId})).body.success,true);
 h.provider.get(previous).status='PAID';a.equal((await h.webhook(previous)).status,200);
 a.equal(h.provider.get(previous).status,'CANCELLED');a.equal((await h.read(previous)).refund_status,'succeeded');
 a.equal(await h.count('purchased_items'),1);a.equal(await h.count('payment_history'),1);a.equal(await h.count('point_transactions'),1);
 a.equal((await h.db.query('SELECT earned_points FROM profiles')).rows[0].earned_points,0);
});

for(const delivered of ['none','hwp','pdf'])test(`round9 exam A+B refund releases only unreceived reservations (${delivered}) and preserves purchase audit`,async t=>{
 const h=await harness(t);await h.seed(id(91),planQuote('QB_EXAM'),'PAID');await h.complete({paymentId:id(91)});
 await h.seed(id(92),planQuote('QB_EXAM'),'PAID');await h.complete({paymentId:id(92)});
 const buys=(await h.db.query('SELECT id,payment_id FROM purchased_items ORDER BY created_at,id')).rows;
 const jobs=[];
 for(let n=0;n<10;n++){const j=await paidPlanBundle(h,'exam');a.equal(j.error,null);jobs.push(j.data.id);a.deepEqual(j.data.authorization_purchase_ids,[buys[0].id]);}
 if(delivered!=='none')await h.db.query(`UPDATE pdf_jobs SET ${delivered==='hwp'?'hwp_ready':'pdf_delivered'}=true,status='done' WHERE id=ANY($1)`,[jobs.slice(0,2)]);
 h.advance(1000);const pass=()=>h.load('src/lib/qbPass.ts').passStatus({id:uid});a.equal((await pass()).examLeft,10);
 h.provider.get(id(91)).status='CANCELLED';a.equal((await h.webhook(id(91))).status,200);
 const unreceived=delivered==='none'?10:8,left=10;a.equal((await pass()).examLeft,left);
 const revoked=(await h.db.query('SELECT * FROM pdf_jobs')).rows;
 a.equal(revoked.filter(j=>j.status==='error').length,unreceived);a.equal(revoked.filter(j=>j.revoked_at).length,unreceived);
 a.ok(revoked.every(j=>j.authorization_purchase_ids.length===1));a.equal(await h.count('feature_usage'),12);
 for(const job of revoked.filter(j=>!j.revoked_at))a.equal((await h.sb.rpc('check_bundle_delivery',{p_user:uid,p_id:job.id})).data,true);
 for(let n=0;n<left;n++){
  const next=await paidPlanBundle(h,'exam');a.equal(next.error,null);
  a.deepEqual(next.data.authorization_purchase_ids,[buys.find(b=>b.payment_id===id(92)).id]);
 }
 a.equal((await pass()).examLeft,0);a.match((await paidPlanBundle(h,'exam')).error.message,/PLAN_LIMIT/);
 await h.webhook(id(91));a.equal(await h.count('payment_cancellations'),1);a.equal((await pass()).examLeft,0);
 await a.rejects(h.db.query("UPDATE pdf_jobs SET status='done' WHERE id=$1",[jobs[delivered==='none'?0:2]]),/BUNDLE_REVOKED/);
});

for(const queued of [false,true])for(const failure of ['missing-secret',401,403,503])test(`round9 provider ${failure}, queue=${queued}: readiness fails and recovers without consuming leases`,async t=>{
 const h=await harness(t);await h.db.exec(migration('cutover'));
 if(queued){await h.seed(id(93),quote(),'PAID');await h.db.exec("UPDATE payment_orders SET reconcile_after=now()-interval '1 minute'");}
 const before=queued?await h.read(id(93)):null;
 if(failure==='missing-secret')h.setProviderSecret('');else h.setLookupStatus(failure);
 const failed=await h.scheduledRun();a.equal(failed.status,503);a.equal(failed.body.workerHealthy,false);a.equal(failed.body.providerHealthy,false);
 a.equal((await h.sb.rpc('payment_checkout_ready',{})).data,false);
 a.equal((await h.orders({})).status,503);
 const stored=(await h.db.query('SELECT results FROM payment_reconcile_runs ORDER BY id DESC LIMIT 1')).rows[0].results;
 a.equal(stored.workerHealthy,false);a.equal(stored.providerHealthy,false);
 if(queued){const after=await h.read(id(93));a.equal(after.status,'pending');a.equal(String(after.reconcile_after),String(before.reconcile_after));}
 h.setProviderSecret('local-only');h.setLookupStatus(undefined);
 const recovered=await h.scheduledRun();a.equal(recovered.status,200);a.equal(recovered.body.workerHealthy,true);
 a.equal((await h.sb.rpc('payment_checkout_ready',{})).data,true);
 if(queued){a.equal((await h.read(id(93))).status,'completed');a.equal(await h.count('purchased_items'),1);}
});

for(const status of [401,403])test(`round9 cancellation auth ${status} fails readiness while retaining refund-pending recovery`,async t=>{
 const h=await harness(t);await h.seed(id(96),quote(),'READY');await h.create(id(97),[id(96)],quote(1000));await h.complete({paymentId:id(97)});
 h.provider.get(id(96)).status='PAID';h.setCancel(status);await h.db.exec("UPDATE payment_orders SET reconcile_after=now()-interval '1 minute'");
 const failed=await h.scheduledRun();a.equal(failed.status,503);a.equal(failed.body.workerHealthy,false);a.equal(failed.body.providerHealthy,false);
 a.equal((await h.sb.rpc('payment_checkout_ready',{})).data,false);a.equal((await h.read(id(96))).refund_status,'pending');
 a.equal((await h.complete({paymentId:id(96)})).body.code,'PAYMENT_REFUND_PENDING');
 h.setCancel('ok');await h.db.exec("UPDATE payment_orders SET reconcile_after=now()-interval '1 minute'");
 a.equal((await h.scheduledRun()).status,200);a.equal((await h.read(id(96))).refund_status,'succeeded');
 a.equal(await h.count('purchased_items'),1);a.equal(await h.count('point_transactions'),1);
});

test('round9 cutover reverse restores the deployed order API while keeping refund recovery and browser denial',async t=>{
 const h=await harness(t);await h.seed(id(94),quote(),'READY');a.ok((await h.create(id(95),[id(94)],quote(1000))).data.paymentId);
 await h.complete({paymentId:id(95)});await h.db.exec(migration('cutover'));
 const reverse=fs.readFileSync(path.join(__dirname,'../supabase/rollback/payment_cutover.sql'),'utf8');
 // A failed reverse is atomic; a successful reverse is repeatable.
 await a.rejects(h.db.exec(reverse.replace('COMMIT;','SELECT 1/0; COMMIT;')),/division by zero/);await h.db.exec('ROLLBACK');
 a.equal((await h.db.query("SELECT has_table_privilege('service_role','payment_orders','INSERT') ok")).rows[0].ok,false);
 await h.db.exec(reverse);await h.db.exec(reverse);
 a.equal((await h.db.query('SELECT direct_insert_retired FROM payment_transition')).rows[0].direct_insert_retired,false);
 for(const role of ['anon','authenticated'])a.equal((await h.db.query("SELECT has_table_privilege($1,'payment_orders','INSERT') ok",[role])).rows[0].ok,false);
 // Exact deployed route snapshot, using the actual service_role privileges.
 await h.db.exec('GRANT SELECT ON exam_materials,private_dbs,purchased_items,profiles TO service_role; SET ROLE service_role');
 const old=h.load('tests/fixtures/deployed-payment-orders.ts.txt');
 const created=await old.POST({json:async()=>({kind:'cart',items:[{item_id:item}],usedPoints:0})});
 await h.db.exec('RESET ROLE');a.equal(created.status,200);
 const paymentId=created.body.paymentId;h.provider.set(paymentId,{id:paymentId,status:'PAID',currency:'KRW',amount:{total:1000},customer:{id:uid},customData:{orderId:paymentId}});
 a.equal((await h.sb.rpc('complete_payment_order',{p_payment_id:paymentId,p_user_id:uid})).error,null);
 h.provider.get(id(94)).status='PAID';await h.db.exec("UPDATE payment_orders SET reconcile_after=now()-interval '1 minute'");
 a.equal((await h.scheduledRun()).status,200);a.equal(h.provider.get(id(94)).status,'CANCELLED');
 a.equal(await h.count('payment_history'),2);a.equal(await h.count('purchased_items'),2);
 await h.db.exec('UPDATE cron.job SET active=false');a.equal((await h.orders({})).status,200); // inverse permits safe legacy fallback
});

// Round 10: preparation resumes the stored checkout after explicit consent.
for(const stage of ['legacy','supersede','resolution','schedule']){
 for(const status of ['READY','FAILED','NOT_FOUND'])test(`round10 ${stage} ${status}: changed selection resumes the same card ID with consent and no replacement`,async t=>{
  const h=await harness(t,{stage,ready:false});await h.seed(id(101),quote(),status,86400000);
  if(status==='NOT_FOUND')h.provider.delete(id(101));
  const messages=[];h.browser.confirm=text=>{messages.push(text);return true;};
  a.equal((await h.pay({usedPoints:1000})).success,true);
  a.equal(messages.length,1);a.match(messages[0],/검증 자료/);a.match(messages[0],/1,000원.*0P/);
  const sdk=h.calls.filter(c=>c.sdk);a.equal(sdk.length,1);a.equal(sdk[0].sdk.paymentId,id(101));a.equal(sdk[0].sdk.totalAmount,1000);
  a.equal(await h.count('payment_orders'),1);a.equal(await h.count('payment_history'),1);a.equal(await h.count('purchased_items'),1);a.equal(await h.count('point_transactions'),0);
  a.equal((await h.db.query('SELECT earned_points FROM profiles')).rows[0].earned_points,1000);
 });
 for(const change of ['points','items'])test(`round10 ${stage} ${change}: cross-device zero-won discovery cannot spend until old selection is accepted`,async t=>{
  const h=await harness(t,{stage,ready:false});await h.seed(id(102),quote(1000));
  const other='33333333-3333-4333-8333-333333333333';
  await h.db.query("INSERT INTO exam_materials(id,title,price,file_type) VALUES($1,'다른 자료',2000,'HWP')",[other]);
  const input={items:[{item_id:change==='items'?other:item}],usedPoints:change==='items'?1000:0};
  const found=await h.orders(input);a.equal(found.body.recoverPaymentId,id(102));
  const blocked=await h.complete({paymentId:id(102),retryInput:{kind:'cart',...input}});
  a.equal(blocked.body.code,'PAYMENT_RESUME_REQUIRED');a.equal(blocked.body.resumeOrder.usedPoints,1000);
  a.equal(await h.count('point_transactions'),0);a.equal((await h.read(id(102))).status,'pending');
  // Declining keeps the old checkout and all balances intact.
  h.browser.confirm=()=>false;await a.rejects(h.pay(input),/보류/);
  a.equal(await h.count('payment_orders'),1);a.equal(await h.count('purchased_items'),0);a.equal(await h.count('point_transactions'),0);
  h.browser.confirm=text=>{a.match(text,/0원.*1,000P/);return true;};
  a.equal((await h.pay(input)).success,true);
  a.equal(h.calls.filter(c=>c.sdk).length,0);a.equal(await h.count('payment_orders'),1);a.equal(await h.count('purchased_items'),1);a.equal(await h.count('point_transactions'),1);
  a.equal((await h.db.query('SELECT earned_points FROM profiles')).rows[0].earned_points,0);
 });
}

test('round10 local pending card resumes without a create request; identity and provider outages never open SDK',async t=>{
 const h=await harness(t,{stage:'legacy'});await h.seed(id(103),quote(),'FAILED');
 h.saved.set(`mathetf_pending_payment_${uid}_cart`,id(103));
 for(const failure of ['identity','outage']){
  if(failure==='identity')h.provider.get(id(103)).amount.total=999;else {h.provider.get(id(103)).amount.total=1000;h.setLookupStatus(503);}
  await a.rejects(h.pay({usedPoints:1000}));a.equal(h.calls.filter(c=>c.sdk).length,0);a.equal(await h.count('payment_orders'),1);
 }
 h.setLookupStatus(undefined);a.equal((await h.pay({usedPoints:1000})).success,true);
 a.equal(h.calls.filter(c=>c.browserUrl==='/api/payments/orders').length,0);a.equal(h.calls.find(c=>c.sdk).sdk.paymentId,id(103));
});

for(const stage of ['supersede','resolution','schedule'])test(`round10 ${stage}: a durably closed original pointer cannot trap legacy recovery in a loop`,async t=>{
 const h=await harness(t,{stage,ready:false,legacyCount:1});h.provider.set(id(1),{id:id(1),status:'READY'});
 h.saved.set(`mathetf_pending_payment_${uid}_cart`,id(1));
 a.equal((await h.pay({usedPoints:1000})).success,true);
 a.equal((await h.read(id(1))).status,'closed');a.equal(await h.count('payment_orders'),2);
 a.equal(await h.count('purchased_items'),1);a.equal(await h.count('point_transactions'),1);a.equal(h.calls.filter(c=>c.sdk).length,0);
});

if(process.env.PAYMENT_ROLLBACK_SOURCE){
 const rollbackRoot=path.resolve(process.env.PAYMENT_ROLLBACK_SOURCE);
 test('round10 actual rollback artifact includes every payment overlay and protected route without environment files',()=>{
  const manifest=JSON.parse(fs.readFileSync(path.join(rollbackRoot,'PAYMENT_ROLLBACK_MANIFEST.json'),'utf8'));
  a.equal(manifest.overlays.length,28);a.ok(manifest.baselineFiles>0);
  for(const entry of manifest.overlays){
   const bundled=fs.readFileSync(path.join(rollbackRoot,entry.path));
   a.equal(require('node:crypto').createHash('sha256').update(bundled).digest('hex'),entry.sha256);
   a.deepEqual(bundled,fs.readFileSync(path.join(__dirname,'..',entry.path)));
  }
  for(const file of ['src/app/api/cron/payment-reconcile/route.ts','src/app/api/payments/webhook/route.ts','src/app/api/admin/payment-reviews/route.ts','src/app/admin/payment-reviews/page.tsx'])a.ok(fs.existsSync(path.join(rollbackRoot,file)));
  a.equal(fs.readdirSync(rollbackRoot).some(name=>/^\.env/.test(name)),false);a.equal(fs.existsSync(path.join(rollbackRoot,'.git')),false);
 });
 test('round10 actual rollback routes keep scheduled late-approval refunds, webhook idempotency and operator review alive',async t=>{
  const h=await harness(t,{sourceRoot:rollbackRoot});await h.seed(id(104),quote(),'READY');await h.create(id(105),[id(104)],quote(1000));await h.complete({paymentId:id(105)});
  await h.db.exec(migration('cutover'));
  const reverse=fs.readFileSync(path.join(rollbackRoot,'supabase/rollback/payment_cutover.sql'),'utf8');
  // Code first, then inverse SQL; both scheduled dispatches use bundled routes.
  a.equal((await h.scheduledRun()).status,200);await h.db.exec(reverse);
  h.provider.get(id(104)).status='PAID';await h.db.exec("UPDATE payment_orders SET reconcile_after=now()-interval '1 minute'");
  a.equal((await h.scheduledRun()).status,200);a.equal(h.provider.get(id(104)).status,'CANCELLED');a.equal((await h.webhook(id(104))).status,200);
  a.equal(await h.count('payment_history'),1);a.equal(await h.count('purchased_items'),1);a.equal(await h.count('point_transactions'),1);
  await h.seed(id(106),quote(),'PAID');await h.db.query('UPDATE payment_orders SET legacy_reconciliation=true WHERE payment_id=$1',[id(106)]);
  await h.webhook(id(106));a.equal((await h.adminGet('paymentId='+id(106))).body.order.manual_review_required,true);
  a.equal((await h.adminResolve({paymentId:id(106),action:'refund',note:'승인과 미지급 원장을 확인하여 취소합니다.',ownershipAttested:true})).status,200);
  a.equal(h.provider.get(id(106)).status,'CANCELLED');a.equal(await h.count('purchased_items'),1);
 });
 test('round10 actual rollback source resumes existing checkout after inverse SQL with the worker disabled',async t=>{
  const h=await harness(t,{sourceRoot:rollbackRoot});await h.db.exec(migration('cutover'));await h.seed(id(107),quote(),'FAILED');
  await h.db.exec(fs.readFileSync(path.join(rollbackRoot,'supabase/rollback/payment_cutover.sql'),'utf8'));
  await h.db.exec('UPDATE cron.job SET active=false');a.equal((await h.pay({usedPoints:1000})).success,true);
  a.equal(h.calls.find(c=>c.sdk).sdk.paymentId,id(107));a.equal(await h.count('payment_orders'),1);a.equal(await h.count('payment_history'),1);
 });
}

// Round 12: exclusive credits, conservative cancellation and locked teacher saves.
const savedExam=(h,charge='teacher',details={})=>h.sb.rpc('save_plan_exam_item',{
 p_user_id:uid,p_folder_id:null,p_name:'시험지',p_reference_id:require('node:crypto').randomUUID(),
 p_details:{question_count:1,...details},p_session_id:null,p_track:false,p_limit:50,
 p_charge:charge,p_email:'mathofhy@naver.com',p_plan_limit:999,p_plan_since:null,
});
for(const provided of ['none','hwp','pdf'])test(`round12 cancelling B preserves A's ten prints and isolates B credits (${provided})`,async t=>{
 const h=await harness(t,{withPlans:true});
 for(const n of [131,132]){await h.seed(id(n),planQuote('QB_EXAM'),'PAID');a.equal((await h.complete({paymentId:id(n)})).body.success,true);}
 const buys=(await h.db.query('SELECT id,payment_id FROM purchased_items ORDER BY created_at,id')).rows;
 const jobs=[];
 for(let n=0;n<12;n++){
  const result=await paidPlanBundle(h,'exam');a.equal(result.error,null);jobs.push(result.data.id);
  a.deepEqual(result.data.authorization_purchase_ids,[buys[n<10?0:1].id]);
 }
 if(provided!=='none')await h.db.query(`UPDATE pdf_jobs SET ${provided==='hwp'?"hwp_ready=true":"status='done'"} WHERE id=ANY($1)`,[jobs]);
 h.provider.get(id(132)).status='CANCELLED';a.equal((await h.webhook(id(132))).status,200);
 h.advance(1000);a.equal((await h.load('src/lib/qbPass.ts').passStatus({id:uid})).examLeft,0);
 for(const job of jobs.slice(0,10))a.equal((await h.sb.rpc('check_bundle_delivery',{p_user:uid,p_id:job})).data,true);
 const revoked=(await h.db.query('SELECT * FROM pdf_jobs WHERE revoked_at IS NOT NULL')).rows;
 a.equal(revoked.length,provided==='none'?2:0);
 if(provided!=='none')for(const job of jobs.slice(10))a.equal((await h.sb.rpc('check_bundle_delivery',{p_user:uid,p_id:job})).data,true);
 a.equal((await h.read(id(132))).manual_review_required,false);
 await h.webhook(id(132));a.equal(await h.count('payment_cancellations'),1);
 a.equal((await h.db.query("SELECT count(*)::int n FROM feature_usage WHERE qb_exam_purchase_id=$1",[buys[1].id])).rows[0].n,2);
});

test('round12 actual exam saves and prints share attributed credits; cancelling A leaves B usage and request replay intact',async t=>{
 const h=await harness(t,{withPlans:true});
 for(const n of [133,134]){await h.seed(id(n),planQuote('QB_EXAM'),'PAID');await h.complete({paymentId:id(n)});}
 await h.db.query("INSERT INTO feature_usage(user_id,feature) VALUES($1,'plan_free_exam'),($1,'plan_free_exam')",[uid]);
 const buys=(await h.db.query('SELECT id FROM purchased_items ORDER BY created_at,id')).rows;
 for(let n=0;n<9;n++)a.equal((await paidPlanBundle(h,'exam')).error,null);
 const requestId=require('node:crypto').randomUUID(),details={request_id:requestId,request_fingerprint:'same'};
 const lastA=await savedExam(h,'exam',details);a.equal(lastA.error,null);a.equal(lastA.data.details.plan,'exam');
 a.equal((await paidPlanBundle(h,'exam')).error,null);a.equal((await savedExam(h,'exam')).error,null);
 a.equal((await h.db.query('SELECT qb_exam_purchase_id FROM feature_usage WHERE title=$1',[lastA.data.id])).rows[0].qb_exam_purchase_id,buys[0].id);
 h.provider.get(id(133)).status='CANCELLED';await h.webhook(id(133));h.advance(1000);
 a.equal((await h.load('src/lib/qbPass.ts').passStatus({id:uid})).examLeft,8);
 const replay=await savedExam(h,'exam',details);a.equal(replay.data.id,lastA.data.id);a.equal(await h.count('user_items'),2);
 for(let n=0;n<8;n++)a.equal((await savedExam(h,'exam')).error,null);
 a.match((await savedExam(h,'exam')).error.message,/PLAN_LIMIT/);a.equal(await h.count('user_items'),10);
});

for(const kind of ['print','predict'])test(`round12 shared teacher ${kind} stays usable, is visible to admin and can close review without a second grant`,async t=>{
 const h=await harness(t,{withPlans:true});
 for(const n of [135,136]){await h.seed(id(n),planQuote('QB_PASS'),'PAID');await h.complete({paymentId:id(n)});}
 const bundle=await paidPlanBundle(h,'teacher',kind);a.equal(bundle.data.authorization_purchase_ids.length,2);
 h.provider.get(id(136)).status='CANCELLED';a.equal((await h.webhook(id(136))).status,200);
 a.equal((await h.read(id(136))).review_reason,'bundle_entitlement_review');
 a.equal((await h.read(id(136))).manual_review_required,false);
 a.ok((await h.adminGet()).body.orders.some(o=>o.payment_id===id(136)));
 // A retained ambiguous job is an informational review, never a checkout lock.
 const fresh=await h.orders({items:[{item_id:planQuote('QB_PASS').items[0].item_id}]});a.equal(fresh.status,200);a.ok(fresh.body.paymentId);
 const detail=await h.adminGet('paymentId='+id(136));a.equal(detail.status,200);a.deepEqual(detail.body.cancellation.bundle_review_ids,[bundle.data.id]);
 a.equal((await h.sb.rpc('check_bundle_delivery',{p_user:uid,p_id:bundle.data.id})).data,true);
 a.equal((await h.sb.rpc('claim_bundle_hwp',{p_user:uid,p_id:bundle.data.id})).error,null);
 await h.db.query("UPDATE pdf_jobs SET status='done' WHERE id=$1",[bundle.data.id]);
 a.equal((await h.adminResolve({paymentId:id(136),action:'close_review',note:'다른 유효 구매로 보장 확인'})).status,200);
 a.equal((await h.read(id(136))).manual_review_required,false);a.equal(await h.count('payment_cancellations'),1);
 a.equal((await h.read(id(136))).review_reason,null);
 a.equal(await h.count('purchased_items'),1);a.equal(await h.count('point_transactions'),0);
});

test('round12 absent purchase evidence preserves an undelivered old job and records review instead of revocation',async t=>{
 const job=require('node:crypto').randomUUID();
 const h=await harness(t,{withPlans:true,beforeResolution:async db=>{
  await db.query("INSERT INTO pdf_jobs(id,user_id,kind,plan_charge,created_at) VALUES($1,$2,'print','teacher',now()-interval '1 day')",[job,uid]);
 }});
 await h.seed(id(137),planQuote('QB_PASS'),'PAID');await h.complete({paymentId:id(137)});
 // The old worker's timestamps are not sufficient ownership proof.
 await h.db.query("UPDATE purchased_items SET created_at=now()-interval '2 days'");
 h.provider.get(id(137)).status='CANCELLED';await h.webhook(id(137));
 a.equal((await h.sb.rpc('check_bundle_delivery',{p_user:uid,p_id:job})).data,true);
 a.deepEqual((await h.db.query('SELECT bundle_review_ids FROM payment_cancellations')).rows[0].bundle_review_ids,[job]);
});

for(const type of ['QB_PASS','QB_EXAM'])test(`round12 ${type}: a later valid purchase protects an existing unlimited job without rewriting its original source`,async t=>{
 const h=await harness(t),charge=type==='QB_PASS'?'teacher':'exam';
 await h.seed(id(142),planQuote(type),'PAID');await h.complete({paymentId:id(142)});
 const bundle=await paidPlanBundle(h,charge,'predict');a.equal(bundle.data.authorization_purchase_ids.length,1);
 await h.seed(id(143),planQuote(type),'PAID');await h.complete({paymentId:id(143)});
 h.provider.get(id(142)).status='CANCELLED';await h.webhook(id(142));
 a.equal((await h.sb.rpc('check_bundle_delivery',{p_user:uid,p_id:bundle.data.id})).data,true);
 a.deepEqual((await h.db.query('SELECT authorization_purchase_ids FROM pdf_jobs')).rows[0].authorization_purchase_ids,bundle.data.authorization_purchase_ids);
 a.deepEqual((await h.db.query('SELECT bundle_review_ids FROM payment_cancellations')).rows[0].bundle_review_ids,[bundle.data.id]);
});

for(const scenario of ['cancelled','expired','absent'])test(`round12 teacher ${scenario}: stale API snapshot cannot save or write usage/proof/request ledgers`,async t=>{
 const h=await harness(t,{withPlans:true});
 if(scenario==='cancelled'){
  await h.seed(id(138),planQuote('QB_PASS'),'PAID');await h.complete({paymentId:id(138)});h.advance(1000);
  a.equal((await h.load('src/lib/qbPass.ts').passStatus({id:uid})).unlimited,true);
  // File generation/upload happens here, then cancellation commits first.
  h.provider.get(id(138)).status='CANCELLED';await h.webhook(id(138));
 }else if(scenario==='expired')await h.db.query("INSERT INTO purchased_items(user_id,item_type,created_at) VALUES($1,'QB_PASS',now()-interval '31 days')",[uid]);
 const result=await savedExam(h,'teacher',{request_id:require('node:crypto').randomUUID(),request_fingerprint:'stale'});
 a.match(result.error.message,/PLAN_LIMIT/);
 for(const table of ['user_items','feature_usage','qb_usage','exam_save_proofs','qb_save_requests'])a.equal(await h.count(table),0);
 // Both entry points take the very same member lock before reading purchases.
 for(const fn of ['save_plan_exam_item(uuid,uuid,text,uuid,jsonb,uuid,boolean,int,text,text,int,timestamptz)','record_payment_cancellation(text,text)']){
  const definition=(await h.db.query('SELECT pg_get_functiondef($1::regprocedure) definition',[fn])).rows[0].definition;
  a.match(definition,/pg_advisory_xact_lock\(hashtextextended\([^;]+81108\)\)/);
  if(fn.startsWith('record_payment_cancellation'))a.match(definition,/FOR UPDATE OF job/);
 }
});

test('round12 teacher recheck preserves stacked periods, real admin exception and committed request replay after cancellation',async t=>{
 const h=await harness(t,{withPlans:true});await h.db.exec('ALTER TABLE auth.users ADD COLUMN email text');
 await h.seed(id(139),planQuote('QB_PASS'),'PAID');await h.complete({paymentId:id(139)});
 const details={request_id:require('node:crypto').randomUUID(),request_fingerprint:'committed'};
 const first=await savedExam(h,'teacher',details);a.equal(first.error,null);
 h.provider.get(id(139)).status='CANCELLED';await h.webhook(id(139));
 a.equal((await savedExam(h,'teacher',details)).data.id,first.data.id);a.equal(await h.count('user_items'),1);
 a.match((await savedExam(h,'teacher')).error.message,/PLAN_LIMIT/);
 await h.db.query("INSERT INTO purchased_items(user_id,item_type,created_at) VALUES($1,'QB_PASS',now()-interval '40 days'),($1,'QB_PASS',now()-interval '35 days')",[uid]);
 a.equal((await savedExam(h,'teacher')).error,null);
 await h.db.exec('DELETE FROM purchased_items');await h.db.query("UPDATE auth.users SET email='mathofhy@naver.com' WHERE id=$1",[uid]);
 a.equal((await savedExam(h,'teacher')).error,null);a.equal(await h.count('user_items'),3);
 a.equal((await h.db.query("SELECT has_function_privilege('authenticated','save_plan_exam_item(uuid,uuid,text,uuid,jsonb,uuid,boolean,int,text,text,int,timestamptz)','execute') allowed")).rows[0].allowed,false);
});

test('round12 SQL absent legacy retries never INSERT alongside the earlier pending, even with replacement consent or a completed pointer',async t=>{
 const h=await harness(t,{stage:'legacy'});await h.seed(id(140),quote(),'PAID');await h.complete({paymentId:id(140)});await h.seed(id(141),quote(),'READY');
 for(const input of [{},{replaceOpen:true},{replaceOpen:true,supersedePaymentId:id(141)},{replaceOpen:true,supersedePaymentId:id(140)},{requestId:undefined,usedPoints:1000}]){
  await h.orders(input);a.equal(await h.count('payment_orders'),2);
  a.equal((await h.read(id(141))).status,'pending');a.equal(await h.count('purchased_items'),1);a.equal(await h.count('point_transactions'),0);
 }
 a.equal(h.calls.some(c=>c.rpc==='create_payment_order'||c.url?.endsWith('/cancel')),false);
});

// Round 11: review isolation during preparation/inverse and worker-free point orders.
test('round12 real deployed save contract survives failed resolution, SQL-first upgrade, cutover and inverse SQL',async t=>{
 const h=await harness(t,{stage:'supersede',withPlans:true,ready:false});
 await h.db.query("INSERT INTO purchased_items(user_id,item_type,created_at) VALUES($1,'QB_PASS',now()-interval '1 minute')",[uid]);
 a.equal((await savedExam(h,'teacher')).error,null);
 await a.rejects(h.db.exec(migration('resolution').replace('COMMIT;','SELECT 1/0; COMMIT;')),/division by zero/);await h.db.exec('ROLLBACK');
 a.equal((await h.db.query("SELECT to_regprocedure('next_exam_purchase(uuid,timestamptz)') f")).rows[0].f,null);
 a.equal((await savedExam(h,'teacher')).error,null);
 await h.db.exec(migration('resolution'));a.equal((await savedExam(h,'teacher')).error,null);
 // Old caller signature and explicit old view columns stay valid after SQL first.
 a.equal((await h.db.query('SELECT feature,title,created_at,qb_sheet_purchase_id FROM plan_usage WHERE user_id=$1',[uid])).rows.length,3);
 await h.db.exec(migration('schedule').replace(/^CREATE EXTENSION IF NOT EXISTS (pgcrypto|pg_cron|pg_net).*;\r?$/gm,''));
 a.equal((await h.scheduledRun()).status,200);await h.db.exec(migration('cutover'));
 a.equal((await savedExam(h,'teacher')).error,null);
 await h.db.exec(fs.readFileSync(path.join(__dirname,'../supabase/rollback/payment_cutover.sql'),'utf8'));
 a.equal((await savedExam(h,'teacher')).error,null);a.equal(await h.count('user_items'),5);
});

for(const stage of ['supersede','resolution','schedule','inverse'])test(`round11 ${stage}: reviewed PAID cannot repeatedly capture unrelated legacy purchases`,async t=>{
 const h=await harness(t,{stage:stage==='inverse'?'schedule':stage,ready:stage==='inverse',legacyCount:1});
 if(stage==='inverse'){
  await h.db.exec(migration('cutover'));
  await h.db.exec(fs.readFileSync(path.join(__dirname,'../supabase/rollback/payment_cutover.sql'),'utf8'));
 }
 if(['schedule','inverse'].includes(stage))await h.db.exec('UPDATE cron.job SET active=false');
 h.provider.set(id(1),{id:id(1),status:'PAID'});
 a.equal((await h.complete({paymentId:id(1)})).body.code,'PAYMENT_MANUAL_REVIEW');
 await h.db.query("INSERT INTO exam_materials(id,title,price,file_type) VALUES($1,'독립 자료',1000,'HWP')",[otherItem]);
 for(const requestId of [undefined,require('node:crypto').randomUUID()]){
  const overlap=await h.orders({requestId});a.equal(overlap.body.code,'PAYMENT_MANUAL_REVIEW');
 }
 // Explicit stale pointers and old tabs also release only unrelated goods.
 const next=await h.orders({items:[{item_id:otherItem}],supersedePaymentId:id(1),replaceOpen:true,requestId:undefined});
 a.equal(next.status,200);a.ok(next.body.paymentId);a.notEqual(next.body.paymentId,id(1));
 for(let n=0;n<2;n++)a.equal((await h.orders({items:[{item_id:otherItem}]})).body.recoverPaymentId,next.body.paymentId);
 a.equal((await h.pay({items:[{item_id:otherItem}]})).success,true);
 a.equal(await h.count('payment_orders'),2);a.equal(await h.count('purchased_items'),1);a.equal(await h.count('payment_history'),1);
 const review=await h.read(id(1));a.equal(review.status,'pending');a.equal(review.manual_review_required,true);a.equal(review.superseded_by,null);
 a.equal(await h.count('point_transactions'),0);a.equal(h.calls.some(c=>c.url?.endsWith('/cancel')),false);a.equal(h.calls.some(c=>c.rpc==='create_payment_order'),false);
});

for(const stage of ['legacy','supersede','resolution','schedule'])test(`round11 ${stage}: an unrelated active card is still recovered before SQL cutover, never silently replaced`,async t=>{
 const h=await harness(t,{stage,ready:false});await h.seed(id(121));
 await h.db.query("INSERT INTO exam_materials(id,title,price,file_type) VALUES($1,'다른 자료',1000,'HWP')",[otherItem]);
 for(const input of [{},{supersedePaymentId:id(121),replaceOpen:true}]){
  const result=await h.orders({items:[{item_id:otherItem}],usedPoints:1000,...input});a.equal(result.body.recoverPaymentId,id(121));
 }
 a.equal(await h.count('payment_orders'),1);a.equal((await h.read(id(121))).status,'pending');a.equal(await h.count('purchased_items'),0);a.equal(await h.count('point_transactions'),0);
});

test('round11 legacy INSERT rechecks overlapping reviews under the member lock',async t=>{
 const h=await harness(t,{stage:'supersede',ready:false});await h.seed(id(122));
 await h.db.exec('UPDATE payment_orders SET manual_review_required=true');
 await a.rejects(h.seed(id(123)),/Payment requires review/);
 a.equal(await h.count('payment_orders'),1);a.equal(await h.count('purchased_items'),0);
});

for(const failure of ['cron','provider','stale'])for(const product of ['private','pass'])test(`round11 cutover ${failure} ${product}: independent full-point checkout has no provider or readiness dependency`,async t=>{
 const h=await harness(t);await h.db.exec(migration('cutover'));await h.db.exec('UPDATE profiles SET earned_points=100000');
 const cfg=require('../src/lib/qbPassConfig.ts');const productId=product==='private'?otherItem:cfg.PASS_ONCE.itemId;
 if(product==='private')await h.db.query("INSERT INTO private_dbs VALUES($1,$2,'개인DB',1000)",[otherItem,uid]);
 const points=product==='private'?1000:cfg.PASS_ONCE.price;
 // A different card remains approvable and must neither block nor be retired.
 await h.seed(id(124));
 if(failure==='cron')await h.db.exec('UPDATE cron.job SET active=false');
 if(failure==='provider'){h.setLookupStatus(503);a.equal((await h.scheduledRun()).status,503);}
 if(failure==='stale')await h.db.exec("UPDATE payment_reconcile_runs SET finished_at=now()-interval '1 hour'");
 a.equal((await h.sb.rpc('payment_checkout_ready',{})).data,false);h.calls.length=0;
 const result=await h.pay({items:[{item_id:productId}],usedPoints:points});a.equal(result.success,true);
 const paid=(await h.db.query("SELECT * FROM payment_orders WHERE status='completed'")).rows[0];a.equal(paid.amount,0);a.equal(paid.used_points,points);
 a.equal((await h.complete({paymentId:paid.payment_id})).body.alreadyProcessed,true);
 a.equal(await h.count('payment_orders'),2);a.equal(await h.count('payment_history'),1);a.equal(await h.count('purchased_items'),1);a.equal(await h.count('point_transactions'),1);
 a.equal((await h.db.query('SELECT earned_points FROM profiles')).rows[0].earned_points,100000-points);
 a.equal((await h.read(id(124))).status,'pending');a.equal((await h.read(id(124))).superseded_by,null);
 a.equal(h.calls.some(c=>c.url||c.sdk||c.rpc==='payment_checkout_ready'),false);
 // Card orders remain closed, and SQL cannot disguise a card replacement as zero.
 a.equal((await h.orders({})).status,503);
 const replaced=await h.create(id(125),[id(124)],quote(1000));a.match(replaced.error.message,/not ready/);
 a.equal((await h.read(id(124))).status,'pending');a.equal(await h.count('payment_orders'),2);
});

test('round11 zero-card bypass still validates server prices, points, replay, snapshots and overlapping reviews',async t=>{
 const h=await harness(t);await h.db.exec(migration('cutover'));await h.db.exec('UPDATE cron.job SET active=false');
 a.equal((await h.orders({amount:0,usedPoints:0})).status,503); // client amount cannot open a card quote
 a.equal((await h.orders({usedPoints:1001})).status,400);
 await h.db.exec('UPDATE profiles SET earned_points=999');a.equal((await h.orders({usedPoints:1000})).status,503);
 a.equal(await h.count('payment_orders'),0);await h.db.exec('UPDATE profiles SET earned_points=1000');
 const requestId=require('node:crypto').randomUUID();const first=await h.orders({usedPoints:1000,requestId});a.ok(first.body.paymentId);
 a.equal((await h.orders({usedPoints:1000,requestId})).body.recoverPaymentId,first.body.paymentId);
 const race=await h.create(id(126),[],quote(1000),false,require('node:crypto').randomUUID(),{});a.equal(race.data.recoverPaymentId,first.body.paymentId);
 a.equal(await h.count('payment_orders'),1);
 await h.db.exec('UPDATE payment_orders SET manual_review_required=true');
 a.equal((await h.orders({usedPoints:1000})).body.code,'PAYMENT_MANUAL_REVIEW');
 const reviewed=await h.create(id(127),[],quote(1000));a.equal(reviewed.data.reviewRequired,true);
 a.equal(await h.count('payment_orders'),1);a.equal(await h.count('point_transactions'),0);
});

if(process.env.PAYMENT_ROLLBACK_SOURCE)for(const order of ['code-first','sql-first'])test(`round11 actual rollback ${order}: point checkout survives cutover and review isolation survives inverse SQL`,async t=>{
 const sourceRoot=path.resolve(process.env.PAYMENT_ROLLBACK_SOURCE);
 const h=await harness(t,{sourceRoot:order==='code-first'?sourceRoot:undefined,legacyCount:1});
 await h.db.exec(migration('cutover'));await h.db.exec('UPDATE cron.job SET active=false');
 h.provider.set(id(1),{id:id(1),status:'PAID'});a.equal((await h.complete({paymentId:id(1)})).body.code,'PAYMENT_MANUAL_REVIEW');
 await h.db.query("INSERT INTO exam_materials(id,title,price,file_type) VALUES($1,'독립 자료',1000,'HWP')",[otherItem]);
 a.equal((await h.orders({items:[{item_id:otherItem}],usedPoints:1000})).status,200);
 // Drain the zero-card order so the next request tests review isolation itself.
 const zero=(await h.db.query('SELECT payment_id FROM payment_orders WHERE amount=0')).rows[0].payment_id;
 a.equal((await h.complete({paymentId:zero})).body.success,true);
 await h.db.exec(fs.readFileSync(path.join(sourceRoot,'supabase/rollback/payment_cutover.sql'),'utf8'));
 if(order==='sql-first')h.useSource(sourceRoot);
 const route=h.load('src/app/api/payments/orders/route.ts');
 const next=await route.POST({json:async()=>({kind:'cart',items:[{item_id:otherItem}],usedPoints:0,requestId:require('node:crypto').randomUUID(),supersedePaymentId:id(1),replaceOpen:true})});
 a.equal(next.status,200);a.ok(next.body.paymentId);a.notEqual(next.body.paymentId,id(1));
 a.equal((await h.read(id(1))).status,'pending');a.equal((await h.read(id(1))).manual_review_required,true);
 a.equal(await h.count('purchased_items'),1);a.equal(await h.count('point_transactions'),1);a.equal(h.calls.some(c=>c.url?.endsWith('/cancel')),false);
});

for(const committed of [false,true])test(`round13 ambiguous atomic reward response (${committed?'committed':'not executed'}) retries without missing or double credit`,async t=>{
 const h=await harness(t,{stage:'legacy'});
 await h.db.query("UPDATE exam_materials SET content_type='원본제보',uploader_id=$1 WHERE id=$2",[uid,item]);
 const rpc=h.sb.rpc;h.sb.rpc=async(name,args)=>{
  if(name!=='reward_submission')return rpc(name,args);
  if(committed)a.equal((await rpc(name,args)).error,null);
  return {data:null,error:{code:'40003',message:'completion unknown'}};
 };
 await a.rejects(h.approve(),e=>e.code==='40003');
 a.equal((await h.db.query('SELECT earned_points FROM profiles')).rows[0].earned_points,committed?6000:1000);a.equal(await h.count('point_transactions'),committed?1:0);
 h.sb.rpc=rpc;
 if(committed)await a.rejects(h.approve(),e=>e.status===409);else a.equal((await h.approve()).rewarded,5000);
 a.equal((await h.db.query('SELECT earned_points FROM profiles')).rows[0].earned_points,6000);
 a.equal(await h.count('point_transactions'),1);
});

for(const type of ['QB_PASS','QB_EXAM'])test(`round13 ${type}: backfilled A refund after its term keeps B expiry, fresh saves and delivery`,async t=>{
 const days=type==='QB_PASS'?30:14,age=type==='QB_PASS'?40:20;
 const h=await harness(t,{stage:'supersede',withPlans:true});
 for(const [n,offset] of [[151,age],[152,age-1]]){
  await h.seed(id(n),planQuote(type),'PAID');a.equal((await h.complete({paymentId:id(n)})).body.success,true);
  // Historical purchases exist before period preparation, as in production.
  await h.db.query("UPDATE purchased_items SET created_at=now()-$1::int*interval '1 day' WHERE payment_id=$2",[offset,id(n)]);
 }
 await h.db.exec(migration('resolution'));h.advance(5001);
 const buys=(await h.db.query('SELECT * FROM purchased_items ORDER BY created_at')).rows,[first,second]=buys;
 a.equal(+second.plan_starts_at,+first.plan_ends_at);
 a.equal(+second.plan_ends_at,+first.created_at+2*days*86400000);
 const pass=()=>h.load('src/lib/qbPass.ts').passStatus({id:uid});
 const expiry=s=>type==='QB_PASS'?s.passUntil:s.examUntil;
 a.equal(expiry(await pass()),second.plan_ends_at.toISOString());
 const charge=type==='QB_PASS'?'teacher':'exam';
 const job=await paidPlanBundle(h,charge,'predict');a.equal(job.error,null);
 h.provider.get(id(151)).status='CANCELLED';a.equal((await h.webhook(id(151))).status,200);
 const survivor=(await h.db.query('SELECT * FROM purchased_items')).rows[0];
 a.equal(survivor.id,second.id);a.equal(+survivor.plan_starts_at,+second.plan_starts_at);a.equal(+survivor.plan_ends_at,+second.plan_ends_at);
 a.equal(expiry(await pass()),second.plan_ends_at.toISOString());
 a.equal((await h.sb.rpc('bundle_plan_purchases',{p_user:uid,p_charge:charge,p_at:new Date().toISOString()})).data[0],second.id);
 a.equal((await h.sb.rpc('check_bundle_delivery',{p_user:uid,p_id:job.data.id})).data,true);
 a.equal((await paidPlanBundle(h,charge,'predict')).error,null);
 if(type==='QB_EXAM')await h.db.query("INSERT INTO feature_usage(user_id,feature) VALUES($1,'plan_free_exam'),($1,'plan_free_exam')",[uid]);
 const saved=await savedExam(h,charge);a.equal(saved.error,null);a.equal(saved.data.details.plan,charge);
 // The original A+B reservation is ambiguous and stays in the review box.
 a.deepEqual((await h.db.query('SELECT bundle_review_ids FROM payment_cancellations')).rows[0].bundle_review_ids,[job.data.id]);
 await h.webhook(id(151));a.equal(await h.count('payment_cancellations'),1);
 a.equal(+((await h.db.query('SELECT plan_ends_at FROM purchased_items')).rows[0].plan_ends_at),+second.plan_ends_at);
});

for(const type of ['QB_PASS','QB_EXAM'])test(`round13 ${type}: new INSERT freezes B and C across A refund, inverse SQL and protected updates`,async t=>{
 const h=await harness(t),charge=type==='QB_PASS'?'teacher':'exam',days=type==='QB_PASS'?30:14;
 for(const n of [153,154]){await h.seed(id(n),planQuote(type),'PAID');await h.complete({paymentId:id(n)});}
 const [first,second]=(await h.db.query('SELECT * FROM purchased_items ORDER BY plan_ends_at')).rows;
 a.equal(+second.plan_ends_at,+first.plan_ends_at+days*86400000);
 h.provider.get(id(153)).status='CANCELLED';await h.webhook(id(153));
 await h.db.exec(migration('cutover'));
 await h.db.exec(fs.readFileSync(path.join(__dirname,'../supabase/rollback/payment_cutover.sql'),'utf8'));
 await h.seed(id(155),planQuote(type),'PAID');a.equal((await h.complete({paymentId:id(155)})).body.success,true);
 const third=(await h.db.query('SELECT * FROM purchased_items WHERE payment_id=$1',[id(155)])).rows[0];
 a.equal(+third.plan_starts_at,+second.plan_ends_at);a.equal(+third.plan_ends_at,+second.plan_ends_at+days*86400000);
 await h.db.query("UPDATE purchased_items SET plan_starts_at=now()-interval '100 days',plan_ends_at=now()-interval '99 days' WHERE id=$1",[second.id]);
 a.equal(+((await h.db.query('SELECT plan_ends_at FROM purchased_items WHERE id=$1',[second.id])).rows[0].plan_ends_at),+second.plan_ends_at);
 h.provider.get(id(155)).status='CANCELLED';await h.webhook(id(155));h.advance(1000);
 const pass=await h.load('src/lib/qbPass.ts').passStatus({id:uid});
 a.equal(type==='QB_PASS'?pass.passUntil:pass.examUntil,second.plan_ends_at.toISOString());
 a.deepEqual((await h.sb.rpc('bundle_plan_purchases',{p_user:uid,p_charge:charge,p_at:new Date().toISOString()})).data,[second.id]);
});

for(const days of [30,90,180,360])test(`round13 teacher ${days} days: frozen passUntilFrom never compresses a surviving extension`,async t=>{
 const h=await harness(t),terms=require('../src/lib/qbPassConfig.ts').QB_PASS_TERMS;
 const term=terms.find(p=>p.days===days),at=Date.now()-40*86400000;
 await h.db.query('INSERT INTO purchased_items(user_id,item_type,item_id,created_at) VALUES($1,\'QB_PASS\',$2,$3),($1,\'QB_PASS\',$2,$4)',[uid,term.itemId,new Date(at).toISOString(),new Date(at+86400000).toISOString()]);
 const [first,second]=(await h.db.query('SELECT * FROM purchased_items ORDER BY plan_ends_at')).rows;
 a.equal(+first.plan_ends_at,at+days*86400000);a.equal(+second.plan_ends_at,at+2*days*86400000);
 await h.db.query('DELETE FROM purchased_items WHERE id=$1',[first.id]);
 const pass=await h.load('src/lib/qbPass.ts').passStatus({id:uid});a.equal(pass.unlimited,true);a.equal(pass.passUntil,second.plan_ends_at.toISOString());
 a.equal(+h.load('src/lib/qbPass.ts').passUntilFrom([JSON.parse(JSON.stringify(second))]),+second.plan_ends_at);
});

test('round13 code-first negative capability cache retains frozen expiries after SQL installs and another worker cancels A',async t=>{
 const h=await harness(t,{stage:'supersede'}),at=Date.now()-40*86400000;
 await h.db.query("INSERT INTO purchased_items(user_id,item_type,created_at) VALUES($1,'QB_PASS',$2),($1,'QB_PASS',$3)",[uid,new Date(at).toISOString(),new Date(at+86400000).toISOString()]);
 const pass=()=>h.load('src/lib/qbPass.ts').passStatus({id:uid});a.equal((await pass()).passUntil,new Date(at+60*86400000).toISOString());
 await h.db.exec(migration('resolution'));
 await h.db.query('DELETE FROM purchased_items WHERE plan_ends_at=$1',[new Date(at+30*86400000).toISOString()]);
 a.equal((await pass()).passUntil,new Date(at+60*86400000).toISOString());
 a.equal(h.calls.filter(c=>c.probe==='plan_usage').length,1);
});

if(process.env.PAYMENT_ROLLBACK_SOURCE)for(const order of ['code-first','sql-first'])test(`round13 actual rollback ${order}: B frozen period, teacher save and exam quota survive late A refund`,async t=>{
 const h=await harness(t,{stage:'supersede',withPlans:true}),root=path.resolve(process.env.PAYMENT_ROLLBACK_SOURCE);
 for(const [n,type,age] of [[156,'QB_PASS',40],[157,'QB_PASS',39],[158,'QB_EXAM',20],[159,'QB_EXAM',19]]){
  await h.seed(id(n),planQuote(type),'PAID');await h.complete({paymentId:id(n)});
  await h.db.query("UPDATE purchased_items SET created_at=now()-$1::int*interval '1 day' WHERE payment_id=$2",[age,id(n)]);
 }
 await h.db.exec(migration('resolution'));
 await h.db.exec(migration('schedule').replace(/^CREATE EXTENSION IF NOT EXISTS (pgcrypto|pg_cron|pg_net).*;\r?$/gm,''));
 a.equal((await h.scheduledRun()).status,200);await h.db.exec(migration('cutover'));h.advance(5001);
 const expiries=(await h.db.query("SELECT item_type,max(plan_ends_at) expires FROM purchased_items GROUP BY item_type")).rows;
 const reverse=fs.readFileSync(path.join(root,'supabase/rollback/payment_cutover.sql'),'utf8');
 if(order==='code-first')h.useSource(root);
 await h.db.exec(reverse);
 if(order==='sql-first')h.useSource(root);
 for(const n of [156,158]){h.provider.get(id(n)).status='CANCELLED';a.equal((await h.webhook(id(n))).status,200);}
 const pass=await h.load('src/lib/qbPass.ts').passStatus({id:uid});
 for(const row of expiries)a.equal(row.item_type==='QB_PASS'?pass.passUntil:pass.examUntil,row.expires.toISOString());
 a.equal(pass.examLeft,10);a.equal((await savedExam(h,'teacher')).error,null);
 a.equal((await paidPlanBundle(h,'exam')).error,null);
 a.equal(await h.count('payment_cancellations'),2);a.equal(await h.count('point_transactions'),0);
});
