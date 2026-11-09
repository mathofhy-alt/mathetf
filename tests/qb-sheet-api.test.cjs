require('./register.cjs');
const {test}=require('node:test'), a=require('node:assert/strict');
const fs=require('node:fs'), path=require('node:path'), vm=require('node:vm'), ts=require('typescript');
const {randomUUID}=require('node:crypto');
const config=require('../src/lib/qbPassConfig.ts');
const {computeAccess,chooseCharge}=require('../src/lib/planAccess.ts');
const {cartQuote}=require('../src/lib/payments/order.ts');
const member={id:randomUUID(),email:'test@example.com'};
const qid=randomUUID(), itemId=randomUUID(), refId=randomUUID();
class Response {
 constructor(body,options={}){this.body=body;this.status=options.status||200;this.headers=options.headers;}
 static json(body,options){return new Response(body,options);}
}
function load(file,deps={}) {
 const mod={exports:{}};
 const code=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src',file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 vm.runInNewContext(code,{module:mod,exports:mod.exports,Buffer,Date,Set,Map,URL,process,escape,crypto:require('node:crypto').webcrypto,console:{log(){},warn(){},error(){}},require:name=>{
  if(name in deps)return deps[name];
  if(!name.startsWith('@/') && name!=='next/server') return require(name);
  throw Error('Unexpected import '+name);
 }});
 return mod.exports;
}
function harness(overrides={}) {
 const state={user:member,pass:{...computeAccess([],[]),unlimited:false,passUntil:null,admin:false},
  tables:{questions:[{id:qid,work_status:'sorted',content_xml:'<P>문제</P>'}],user_items:[],profiles:[{id:member.id,earned_points:5000}],payment_transition:[{direct_insert_retired:false}]},
  uploads:[],removes:[],rpc:[],fileReads:[],readError:false,uploadError:false,rpcError:null,...overrides};
 const client={auth:{getUser:async()=>({data:{user:state.user}})},from(table){
  let rows=state.tables[table]||[],mutation=null,columns='*';
  const query={select(c='*'){columns=c;return this;},eq(k,v){rows=rows.filter(r=>r[k]===v);return this;},
   or(filter){a.equal(filter,'manual_review_required.eq.true,and(legacy_reconciliation.eq.true,status.eq.pending)');rows=rows.filter(r=>r.manual_review_required||(r.legacy_reconciliation&&r.status==='pending'));return this;},
   in(k,v){rows=rows.filter(r=>v.includes(r[k]));return this;},gte(k,v){rows=rows.filter(r=>r[k]>=v);return this;},like(){rows=[];return this;},order(){return this;},limit(n){rows=rows.slice(0,n);return this;},range(from,to){rows=rows.slice(from,to+1);return this;},
   insert(value){mutation=value;return this;},
   single(){return Promise.resolve({data:rows[0]||null,error:state.readError?{}:null});},
   maybeSingle(){return this.single();},
   then(resolve,reject){if(mutation){(state.tables[table]??=[]).push(mutation);}
    const absent=state.oldPlanSchema&&table==='plan_usage'&&columns.includes('qb_once_purchase_id');
    return Promise.resolve({data:absent?null:rows,count:rows.length,error:absent?{code:'42703'}:state.readError?{}:null}).then(resolve,reject);}
  };return query;
 },storage:{from:bucket=>({
  upload:async(name)=>{state.uploads.push([bucket,name]);return {error:state.uploadError?{message:'upload failed'}:null};},
  remove:async(names)=>{state.removes.push(...names);return {};},
  download:async(name)=>{state.fileReads.push([bucket,name]);return {data:{text:async()=>'<HWPML />'},error:null};},
  createSignedUrl:async()=>({data:null,error:{message:'not found'}})
 })},rpc:async(name,args)=>{state.rpc.push([name,args]);
  if(name==='payment_checkout_ready')return {data:true,error:null};
  if(name==='create_payment_order'){
   const order={payment_id:args.p_payment_id,user_id:args.p_user_id,create_request_id:args.p_request_id,...args.p_quote,status:'pending'};
   (state.tables.payment_orders??=[]).push(order);return {data:{paymentId:order.payment_id},error:null};
  }
  if(name==='create_exam_pdf_job') {
   const jobs=state.tables.pdf_jobs??=[];
   let job=jobs.find(j=>j.user_id===args.p_user && j.kind==='exam' && j.set_hash===args.p_exam && ['pending','working'].includes(j.status));
   if(!job){job={id:args.p_id,user_id:args.p_user,kind:'exam',set_hash:args.p_exam,status:'pending',stamp:false};jobs.push(job);}
   return {data:state.rpcError?null:job,error:state.rpcError};
  }
  return {data:state.rpcError?null:{id:itemId,details:{plan:args.p_charge,pdf_only:false}},error:state.rpcError};}};
 const deps={
  'next/server':{NextResponse:Response},
  '@/utils/supabase/server':{createClient:()=>client},'@/utils/supabase/server-admin':{createAdminClient:()=>client},
  '@/lib/qbPass':{passStatus:async()=>{if(state.passError)throw Error('read failed');return state.pass;}},
  '@/lib/planAccess':{chooseCharge},'@/lib/qbPassConfig':config,
  '@/lib/questions/draft':{parseDraft:()=>null},'@/lib/hml-v2/member-stamp':{stampMemberId:xml=>xml},
  '@/lib/questions/catalog':{availableCatalog:async()=>[]},'@/lib/questions/privateDb':{privateCatalog:async()=>[],stripPrivate:async rows=>rows,PRIVATE_ITEM_TYPE:'PRIVATE_DB'},
  '@/lib/questions/fastScope':{wholeCatalogIneligible:async()=>[]},'@/lib/questions/scope':{resolveScope:()=>[]},
  '@/lib/payments/order':require('../src/lib/payments/order.ts'),
  '@/lib/schemaCapabilities':load('lib/schemaCapabilities.ts'),
  '@/lib/payments/reconcile':{readOrder:async()=>{throw Error('Unexpected recovery');},reconcileOrder:async()=>{throw Error('Unexpected recovery');}},
  '@/lib/payments/complete':{paymentErrorResponse:()=>{throw Error('Unexpected payment error');}},
  '@/lib/analytics/server':{productionSite:()=>false,recordDownload:async()=>{}},
  '@/lib/hml-v2/validate':{validateHml(){},validateQuestionXml(){},examFilename:name=>name+'.hml'},
  '@/lib/hml-v2/generator':{generateHmlFromTemplate:async()=>({questionCount:state.tables.questions.length,hmlContent:'<HWPML />'})},
  '@/lib/planBundles':{prepareBundle:()=>{throw Error('saved exam must not consume bundles');},logBundleDownload(){},BundleError:class extends Error{}},
  fs:{existsSync:()=>true,readFileSync:()=>'<HWPML />'},
 };
 deps['@/lib/savedExamAccess']=load('lib/savedExamAccess.ts',deps);
 if(state.realPass){
  const pass=load('lib/qbPass.ts',{'@/utils/supabase/server-admin':{createAdminClient:()=>client},'./qbPassConfig':config,
   './planAccess':{computeAccess,chooseCharge,...require('../src/lib/planAccess.ts')},
   './schemaCapabilities':load('lib/schemaCapabilities.ts')});
  deps['@/lib/qbPass']=pass;
 }
 return {state,client,route:file=>load(file,deps)};
}
const request=(body={})=>({json:async()=>({requestId:randomUUID(),...body}),headers:new Headers()});
const examBody=()=>({requestId:randomUUID(),ids:[qid],title:'시험지',questionsPerColumn:2});

for(const oldPlanSchema of [true,false])for(const kind of ['free','teacher','exam','sheet'])test(`actual passStatus and exam save keep ${kind} working on ${oldPlanSchema?'pre-resolution':'post-resolution'} schema`,async()=>{
 const h=harness({realPass:true,oldPlanSchema});
 const now=new Date(Date.now()-60000).toISOString();
 h.state.tables.purchased_items=kind==='free'?[]:[{id:randomUUID(),user_id:member.id,item_type:kind==='teacher'?'QB_PASS':kind==='exam'?'QB_EXAM':'QB_SHEET',created_at:now}];
 h.state.tables.plan_usage=kind==='free'?[]:Array.from({length:config.FREE_TRIAL.exam},()=>({id:randomUUID(),user_id:member.id,feature:'plan_free_exam',created_at:now}));
 const result=await h.route('app/api/pro/exam/save/route.ts').POST(request(examBody()));
 a.equal(result.status,200,JSON.stringify(result.body));a.equal(result.body.success,true);
 a.equal(h.state.rpc.length,1);a.equal(h.state.rpc[0][0],'save_plan_exam_item');a.equal(h.state.rpc[0][1].p_charge,kind);
});

test('save endpoint supports free, exam pass and sheet HML storage; teacher bypasses credits',async()=>{
 for(const kind of ['free','exam','sheet','teacher']){
  const h=harness();
  if(kind==='free')Object.assign(h.state.pass,{examLeft:1,sheetLeft:1});
  if(kind==='exam')Object.assign(h.state.pass,{freeExamLeft:0,examLeft:1,examGranted:10,examStart:'2026-11-01',examUntil:'2027-01-01',sheetLeft:1});
  if(kind==='sheet')Object.assign(h.state.pass,{freeExamLeft:0,sheetLeft:1});
  if(kind==='teacher')Object.assign(h.state.pass,{unlimited:true,passUntil:'2027-01-01',examLeft:1,sheetLeft:1});
  const r=await h.route('app/api/pro/exam/save/route.ts').POST(request(examBody()));
  a.equal(r.status,200,JSON.stringify(r.body));a.equal(r.body.success,true);
  a.equal(h.state.rpc.length,1);a.equal(h.state.rpc[0][0],'save_plan_exam_item');
  const args=h.state.rpc[0][1];a.equal(args.p_charge,kind);a.equal(args.p_details.pdf_only,false);
  a.equal(h.state.uploads.length,2);a(h.state.uploads.every(([,name])=>name.startsWith('locked/'+member.id+'/')));
  a.equal(args.p_details.hml_path,h.state.uploads[0][1]);
 }
});
test('save rejects exhausted or unavailable allowance, and a failed upload never calls the charge RPC',async()=>{
 for(const overrides of [{pass:{...computeAccess([],[]),unlimited:false,freeExamLeft:0,sheetLeft:0}},{passError:true},{uploadError:true}]){
  const h=harness(overrides);const r=await h.route('app/api/pro/exam/save/route.ts').POST(request(examBody()));
  a(r.status>=400);a.equal(h.state.rpc.length,0);
 }
});
test('save cleans both uploaded files after an atomic RPC failure',async()=>{
 const h=harness({rpcError:{code:'P0001',message:'PLAN_LIMIT'}});
 const r=await h.route('app/api/pro/exam/save/route.ts').POST(request(examBody()));
 a.equal(r.status,402,JSON.stringify(r.body));a.equal(h.state.removes.length,2);
});
test('round12 teacher cancellation during upload removes rejected files and never reports a paid exam save',async()=>{
 const h=harness();h.state.pass.unlimited=true;
 h.client.rpc=async(name,args)=>{
  a.equal(name,'save_plan_exam_item');a.equal(args.p_charge,'teacher');a.equal(h.state.uploads.length,2);
  return {data:null,error:{code:'P0001',message:'PLAN_LIMIT'}};
 };
 const result=await h.route('app/api/pro/exam/save/route.ts').POST(request(examBody()));
 a.equal(result.status,402);a.deepEqual(h.state.removes,h.state.uploads.map(([,p])=>p));
 a.equal(h.state.tables.user_items.length,0);
});

test('exam precheck makes no upload when exhausted; a last-credit race exposes only server paths and removes rejected files',async()=>{
 const exhausted=harness({pass:{...computeAccess([],[]),unlimited:false,freeExamLeft:0,sheetLeft:0}});
 a.equal((await exhausted.route('app/api/pro/exam/save/route.ts').POST(request(examBody()))).status,402);
 a.equal(exhausted.state.uploads.length,0);
 const race=harness();
 race.client.rpc=async(name,args)=>{
  a.equal(name,'save_plan_exam_item');a.equal(race.state.uploads.length,2);
  a(race.state.uploads.every(([,p])=>p.startsWith(`locked/${member.id}/`)));
  a.equal(args.p_details.hml_path,race.state.uploads[0][1]);
  return {data:null,error:{code:'P0001',message:'PLAN_LIMIT'}};
 };
 a.equal((await race.route('app/api/pro/exam/save/route.ts').POST(request(examBody()))).status,402);
 a.deepEqual(race.state.removes,race.state.uploads.map(([,p])=>p));
});
test('client-created saved_exam and fake details never authorize PDF or server-only HML; moving an authorized item still works',async()=>{
 const h=harness();const routes=h.route('app/api/storage/items/route.ts');
 const forged={id:itemId,user_id:member.id,type:'saved_exam',reference_id:refId,details:{plan:'teacher',hwp_ready:true,hml_path:`locked/${member.id}/${refId}.hml`}};
 const result=await routes.POST(request({folderId:randomUUID(),type:'saved_exam',referenceId:refId,name:'위조'}));
 a.equal(result.status,403);a.equal(h.state.tables.user_items.length,0);
 // A direct DB insertion is also possible under user_items RLS: no server proof is created.
 h.state.tables.user_items=[forged];
 const pdf=h.route('app/api/pdf/route.ts'),hwp=h.route('app/api/storage/download/route.ts');
 for(let i=0;i<3;i++)a.equal((await pdf.POST(request({examId:itemId}))).status,403);
 a.equal((await hwp.GET({url:`https://example.test/?id=${itemId}`})).status,403);
 a.equal(h.state.fileReads.length,0);a.equal(h.state.uploads.length,0);a.equal(h.state.rpc.length,0);
 h.state.tables.exam_save_proofs=[{item_id:itemId,user_id:member.id,reference_id:refId,hml_path:forged.details.hml_path}];
 // Existing PATCH workflow updates only name/folder; proof still refers to the same item and source.
 h.client.from=(()=>{const from=h.client.from;return table=>{const query=from(table);query.update=v=>{Object.assign(forged,v);return query;};return query;};})();
 const moved=await routes.PATCH(request({id:itemId,folderId:randomUUID(),name:'옮긴 시험지',server_saved:true}));
 a.equal(moved.status,200);a.equal((await pdf.POST(request({examId:itemId}))).status,200);
 forged.details.hml_path=undefined; // Cannot substitute a client-writable source for a proved locked original.
 a.equal((await pdf.POST(request({examId:itemId}))).status,403);
 forged.details.hml_path=h.state.tables.exam_save_proofs[0].hml_path;
 forged.reference_id=randomUUID();a.equal((await pdf.POST(request({examId:itemId}))).status,403);
});
test('free accepts 50 questions and rejects 51, teacher accepts 100',async()=>{
 for(const [count,teacher,expected] of [[50,false,200],[51,false,400],[100,true,200]]){
  const h=harness();h.state.tables.questions=Array.from({length:count},()=>({id:randomUUID(),work_status:'sorted',content_xml:'<P />'}));
  if(teacher)Object.assign(h.state.pass,{unlimited:true,passUntil:'2027-01-01'});
  const body={...examBody(),ids:h.state.tables.questions.map(q=>q.id)};
  const r=await h.route('app/api/pro/exam/save/route.ts').POST(request(body));a.equal(r.status,expected,JSON.stringify(r.body));
 }
});
test('saved sheet and exam-pass exams download HML and PDF without a pass lookup or new credit after expiry',async()=>{
 for(const plan of ['sheet','exam']){
 const h=harness({passError:true});
 h.state.tables.user_items=[{id:itemId,user_id:member.id,reference_id:randomUUID(),type:'saved_exam',name:'시험지',details:{plan,pdf_only:false,redownload_until:'2020-01-01'}}];
 h.state.tables.exam_save_proofs=h.state.tables.user_items.map(i=>({item_id:i.id,user_id:i.user_id,reference_id:i.reference_id}));
 const hwp=h.route('app/api/storage/download/route.ts');
 const probe=await hwp.GET({url:`https://example.test/api/storage/download?id=${itemId}&probe=1`});
 a.equal(probe.body.pdfOnly,false);
 a.equal((await hwp.GET({url:`https://example.test/api/storage/download?id=${itemId}`})).status,200);
 const pdf=h.route('app/api/pdf/route.ts');
 for(let i=0;i<2;i++)a.equal((await pdf.POST(request({examId:itemId}))).status,200);
 a.equal(h.state.rpc.length,1);a.equal(h.state.rpc[0][0],'create_exam_pdf_job');a(h.state.tables.pdf_jobs.every(j=>j.stamp===false));
 a.equal(h.state.tables.user_items.length,1);
 }
});
test('old PDF-only saved exams now permit HML while still enforcing ownership',async()=>{
 const h=harness({passError:true});
 h.state.tables.user_items=[{id:itemId,user_id:member.id,reference_id:refId,type:'saved_exam',name:'이전 시험지',details:{pdf_only:true,hml_path:`locked/${member.id}/${refId}.hml`}}];
 h.state.tables.exam_save_proofs=[{item_id:itemId,user_id:member.id,reference_id:refId,hml_path:`locked/${member.id}/${refId}.hml`}];
 const route=h.route('app/api/storage/download/route.ts');
 a.equal((await route.GET({url:`https://example.test/?id=${itemId}`})).status,200);
 a.equal(h.state.fileReads[0][1],`locked/${member.id}/${refId}.hml`);
 h.state.user={id:randomUUID()};
 a.equal((await route.GET({url:`https://example.test/?id=${itemId}`})).status,404);
 a.equal((await h.route('app/api/pdf/route.ts').POST(request({examId:itemId}))).status,404);
 a.equal(h.state.fileReads.length,1);
});

test('legacy PDF, HML and probe allow unchanged originals and reject files changed after cutoff without consuming credits',async()=>{
 for(const unchanged of [true,false]){
  const h=harness({passError:true});
  h.state.tables.user_items=[{id:itemId,user_id:member.id,reference_id:refId,type:'saved_exam',name:'옛 시험지',details:{}}];
  h.state.tables.exam_save_proofs=[{item_id:itemId,user_id:member.id,reference_id:refId,legacy_cutoff:'2026-11-08T15:00:00Z'}];
  const baseRpc=h.client.rpc;
  h.client.rpc=async(name,args)=>{
   if(name==='create_exam_pdf_job')return baseRpc(name,args);
   a.equal(name,'legacy_exam_file_unchanged');a.equal(args.p_item,itemId);a.equal(args.p_user,member.id);a.equal(args.p_reference,refId);a.equal(args.p_path,null);
   return {data:unchanged,error:null};
  };
  const hwp=h.route('app/api/storage/download/route.ts'),pdf=h.route('app/api/pdf/route.ts');
  a.equal((await hwp.GET({url:`https://example.test/?id=${itemId}&probe=1`})).status,unchanged?200:403);
  a.equal((await hwp.GET({url:`https://example.test/?id=${itemId}`})).status,unchanged?200:403);
  a.equal((await pdf.POST(request({examId:itemId}))).status,unchanged?200:403);
  a.equal(h.state.rpc.length,unchanged?1:0);a(h.state.rpc.every(([name])=>name==='create_exam_pdf_job'));
  if(!unchanged){a.equal(h.state.fileReads.length,0);a.equal(h.state.uploads.length,0);a.equal(h.state.tables.pdf_jobs,undefined);}
 }
});

test('legacy source changed during file read or unreadable metadata fails closed before PDF conversion and HML response',async()=>{
 for(const format of ['pdf','hwp'])for(const metadataError of [false,true]){
  const h=harness();let checks=0;
  h.state.tables.user_items=[{id:itemId,user_id:member.id,reference_id:refId,type:'saved_exam',name:'옛 시험지',details:{}}];
  h.state.tables.exam_save_proofs=[{item_id:itemId,user_id:member.id,reference_id:refId,legacy_cutoff:'2026-11-08T15:00:00Z'}];
  h.client.rpc=async()=>({data:++checks===1,error:metadataError?{message:'metadata unavailable'}:null});
  const r=format==='pdf'?await h.route('app/api/pdf/route.ts').POST(request({examId:itemId}))
   :await h.route('app/api/storage/download/route.ts').GET({url:`https://example.test/?id=${itemId}`});
  a.equal(r.status,metadataError?(format==='pdf'?503:500):403);a.equal(h.state.uploads.length,0);a.equal(h.state.tables.pdf_jobs,undefined);
  a.equal(h.state.fileReads.length,metadataError?0:1);
 }
});
test('order route quotes QB_SHEET using trusted price, allows partial/full points and later repeat orders',async()=>{
 for(const usedPoints of [0,1000,2900]){
  const h=harness();const route=h.route('app/api/payments/orders/route.ts');
  const body={kind:'cart',items:[{item_id:config.PASS_SHEET.itemId,price:1,item_type:'QB_PASS'}],usedPoints};
  for(let i=0;i<2;i++){
   const r=await route.POST(request(body));a.equal(r.status,200);a.equal(r.body.amount,2900-usedPoints);
   // A repeat purchase follows a completed checkout, rather than inserting a
   // second pending order (atomic replacement is covered by real SQL tests).
   h.state.tables.payment_orders.at(-1).status='completed';
  }
  a.equal(h.state.tables.payment_orders.length,2);
  for(const order of h.state.tables.payment_orders){a.equal(order.items[0].item_type,'QB_SHEET');a.equal(order.total,2900);}
 }
 a.throws(()=>cartQuote([{item_id:config.PASS_SHEET.itemId}], [{id:config.PASS_SHEET.itemId,file_type:'SHEET',title:'시험지',price:2900}],2901));
});
test('pass modal shows sheet only in exam context and includes points reward and refund terms',()=>{
 const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
 const mod=load('components/question-bank/PassModal.tsx',{
  '@/lib/payments/client':{payOrder:async()=>{}},'@/lib/qbPassConfig':config,
  '@/components/RefundPolicyModal':{default:()=>null,__esModule:true},
  '@/components/PointsPicker':{default:()=>null,__esModule:true},
  '@/components/payments/PendingOrderNotice':{default:()=>null,__esModule:true},
  '@/utils/supabase/client':{createClient:()=>({})},
  '@/lib/report-reward':{REPORT_REWARD_LABEL:'5,000P',REPORT_REWARD_POINTS:5000},
 });
 const info={...computeAccess([],[]),unlimited:false,passUntil:null,freeLeft:0,freeExamLeft:0};
 const render=context=>renderToStaticMarkup(React.createElement(mod.default,{context,info,user:member,onClose(){},onPaid(){}}));
 const exam=render('exam');a.match(exam,/시험지 1장권/);a.match(exam,/2,900/);a.match(exam,/29,000/);a.match(exam,/9,900/);a.match(exam,/14일, 시험지·프린트 합쳐 10건/);a.match(exam,/채택 시 5,000P/);a.match(exam,/구매 후 30일/);
 a.doesNotMatch(render('bundle'),/시험지 1장권<\/button>/);
 a.doesNotMatch(exam,/>1회권<\/button>/);
 for(const context of ['exam','bundle'])a.match(render(context),/>시험대비권<\/button>/);
 a.match(mod.passLine({...info,examUntil:'2026-11-15',examLeft:7},true),/시험지·프린트 합쳐 7건 남음/);
 a.match(mod.passLine({...info,examUntil:'2026-11-15',examLeft:7}),/시험지·프린트 합쳐 7건 남음/);
 a.match(mod.passLine({...info,sheetLeft:3},true),/이번 주 무료 0회 남음 · 월요일 0시에 다시 채워져요 · 시험지 1장권 3장/);
 const examPlan=config.PASS_PLANS.find(p=>p.id==='exam');
 a.equal(examPlan.lines[0],'시험지 만들기·프린트 변형 합쳐 10건 · 한글/PDF · 30일 다시 받기 · 예상문제 제한 없음');
 a.equal(examPlan.example,'기말 2주 전, 반별 시험지와 학교 프린트 비슷한 문제를 같이 준비할 때');
});

test('forged legacy HML path cannot access another member storage through a self-owned item',async()=>{
 const h=harness();h.state.tables.user_items=[{id:itemId,user_id:member.id,reference_id:refId,type:'saved_exam',details:{hml_path:`locked/${randomUUID()}/${refId}.hml`}}];
 a.equal((await h.route('app/api/storage/download/route.ts').GET({url:`https://example.test/?id=${itemId}`})).status,403);
 a.equal((await h.route('app/api/pdf/route.ts').POST(request({examId:itemId}))).status,403);
 a.equal(h.state.fileReads.length,0);
});

test('committed save with lost response preserves originals and same request retries return exactly one result', async()=>{
 const h=harness(); const body=examBody(); let committed;
 h.client.rpc=async(name,args)=>{
  h.state.rpc.push([name,args]);
  committed={id:itemId,name:args.p_name,reference_id:args.p_reference_id,details:args.p_details};
  h.state.tables.qb_save_requests=[{user_id:member.id,request_id:body.requestId,fingerprint:args.p_details.request_fingerprint,result:committed}];
  return {data:null,error:{message:'network response lost'}};
 };
 const route=h.route('app/api/pro/exam/save/route.ts');
 const first=await route.POST(request(body));a.equal(first.status,200);a.equal(first.body.item.id,itemId);
 a.equal(h.state.removes.length,0); // neither committed HML nor JSON may be deleted
 h.state.pass.freeExamLeft=0; // replay works even if all credits were consumed
 const second=await route.POST(request(body));a.equal(second.status,200);
 a.equal(second.body.item.reference_id,committed.reference_id);a.equal(h.state.rpc.length,1);a.equal(h.state.uploads.length,2);
 const mismatch=await route.POST(request({...body,title:'다른 내용'}));a.equal(mismatch.status,409);a.equal(h.state.rpc.length,1);
});
test('unknown commit outcome retains both originals',async()=>{
 const h=harness({rpcError:{code:'08006',message:'connection lost'}});
 const r=await h.route('app/api/pro/exam/save/route.ts').POST(request(examBody()));
 a.equal(r.status,500);a.equal(h.state.uploads.length,2);a.equal(h.state.removes.length,0);
});
test('old screens without requestId save normally with a server UUID; malformed supplied IDs are rejected',async()=>{
 for(const requestId of [undefined,null]){
  const h=harness();const body={...examBody(),requestId};
  const r=await h.route('app/api/pro/exam/save/route.ts').POST(request(body));
  a.equal(r.status,200);a.equal(h.state.rpc.length,1);
  a.match(h.state.rpc[0][1].p_details.request_id,/^[0-9a-f-]{36}$/);
 }
 for(const requestId of ['',42,'invalid']){
  const h=harness();const r=await h.route('app/api/pro/exam/save/route.ts').POST(request({...examBody(),requestId}));
  a.equal(r.status,400);a.equal(h.state.uploads.length,0);
 }
});
