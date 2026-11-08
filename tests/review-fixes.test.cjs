const {test}=require('node:test'), a=require('node:assert/strict');
const fs=require('node:fs'), path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
function load(file,deps={},globals={}){
 const mod={exports:{}};
 const code=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src',file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 vm.runInNewContext(code,{module:mod,exports:mod.exports,Buffer,Date,console,Set,Map,Event,require:n=>{
  if(n in deps)return deps[n];if(n.startsWith('@/'))throw Error('Unexpected '+n);return require(n);
 },...globals});return mod.exports;
}
const cfg=load('lib/qbPassConfig.ts');
const policy=load('lib/bundlePolicy.ts',{'./qbPassConfig':cfg});
const qid='20000000-0000-4000-8000-000000000001';
test('image API removes solution captures and solution-only binaries even when called directly by a logged in free member',async()=>{
 const user={id:'member'};let unlimited=false, rows=[], requested=[];
 const xml='<P><IMAGE BinItem="1"/><ENDNOTE><IMAGE BinItem="2"/></ENDNOTE></P>';
 const admin={from(table){let data=table==='questions'?[{id:qid,work_status:'sorted',content_xml:xml}]:rows;
  return {select(){return this;},in(k,values){requested.push([table,k,values]);data=data.filter(r=>values.includes(r[k]));return this;},
   neq(k,v){data=data.filter(r=>r[k]!==v);return this;},order(){return this;},then(resolve,reject){return Promise.resolve({data,error:null}).then(resolve,reject);}};
 }};
 const deps={'@/utils/supabase/server':{createClient:()=>({auth:{getUser:async()=>({data:{user}})}})},
  '@/utils/supabase/server-admin':{createAdminClient:()=>admin},'@/lib/qbPass':{passStatus:async()=>({unlimited})},
  '@/lib/bundlePolicy':policy,'@/lib/requireMember':{memberOnly:async()=>null},
  '@/lib/questions/privateDb':{stripPrivate:async rows=>rows},'next/server':{NextResponse:{json:(body,opts)=>({body,status:opts?.status||200})}}};
 deps['@/lib/predictAccess']={previewAccess:async()=>{}};
 deps['@/lib/planBundles']={BundleError:class extends Error{}};
 const access=load('lib/questions/imageAccess.ts',deps);deps['@/lib/questions/imageAccess']=access;
 const route=load('app/api/questions/images/route.ts',deps);
 const image=(bin,id)=>({id,question_id:qid,original_bin_id:bin,data:'SECRET-'+bin});
 for(const captures of [true,false]){
  rows=[image('1','q-figure'),image('2','s-figure'),image('AUTO_S_1','s-capture')];
  if(captures)rows.push(image('AUTO_Q_1','q-capture'));
  requested=[];
  const r=await route.POST({headers:new Headers({'x-forwarded-for':'offline-test'}),json:async()=>({ids:[qid]})});
  a.equal(r.status,200);a.equal(r.body.images[qid].length,1);
  a.equal(r.body.images[qid][0].id,captures?'q-capture':'q-figure');
  a(!JSON.stringify(r.body).includes('SECRET-2'));a(!JSON.stringify(r.body).includes('SECRET-AUTO_S'));
  a(!requested.some(([table,k,ids])=>table==='question_images'&&k==='id'&&ids.some(id=>id.startsWith('s-'))));
 }
 unlimited=true;
 const preview=await route.POST({headers:new Headers(),json:async()=>({ids:[qid],preview:true})});
 a.equal(preview.body.images[qid].length,1);a.equal(preview.body.images[qid][0].id,'q-figure');
 a.equal(await access.canSeeSolutions(),true);unlimited=false;a.equal(await access.canSeeSolutions(),false);
});
const modalDeps=config=>({'@/lib/qbPassConfig':config,'@/lib/payments/client':{},'@/components/RefundPolicyModal':()=>null,
 '@/components/PointsPicker':()=>null,'@/utils/supabase/client':{},'@/lib/report-reward':{REPORT_REWARD_LABEL:'5,000P',REPORT_REWARD_POINTS:5000}});
function find(node,predicate){if(!node||typeof node!=='object')return null;if(predicate(node))return node;for(const child of React.Children.toArray(node.props?.children)){const hit=find(child,predicate);if(hit)return hit;}return null;}
test('PDF allowance error opens the local purchase flow without navigating away or losing the current crop state',async()=>{
 const events=[],window={dispatchEvent:e=>events.push(e.type),location:{href:'/print-transform'}};
 const cropState={pdf:'uploaded.pdf',crops:[{selected:[qid]}]};
 const download=load('lib/pdfDownload.ts',{}, {window,fetch:async()=>({ok:false,json:async()=>({needPass:true,error:'quota'})})});
 await a.rejects(download.downloadPdf([qid],'프린트','print'),/quota/);
 a.deepEqual(events,['qb-pass-required']);a.equal(window.location.href,'/print-transform');a.equal(cropState.crops[0].selected[0],qid);
});
test('old-screen receipt 409 reaches the PDF UI unchanged without opening a purchase gate',async()=>{
 const message='페이지를 새로 고친 뒤 다시 받아 주세요.',events=[];
 const download=load('lib/pdfDownload.ts',{}, {window:{dispatchEvent:e=>events.push(e.type)},fetch:async()=>({ok:false,status:409,json:async()=>({error:message,needPass:false})})});
 await a.rejects(download.downloadPdf([qid],'프린트','print'),e=>e.message===message);
 a.deepEqual(events,[]);
});
test('purchase gate responds to allowance event and passes new-tab behavior to PassModal',async()=>{
 const slots=[],effects=[],listeners={};let cursor=0;
 const react={...React,useState:init=>{const n=cursor++;if(!(n in slots))slots[n]=init;return [slots[n],v=>{slots[n]=v;}];},useEffect:fn=>effects.push(fn)};
 const Modal=()=>null;
 const Gate=load('components/BundlePassGate.tsx',{'react':react,'@/components/question-bank/PassModal':{default:Modal,__esModule:true},
  '@/lib/usePassInfo':{usePassInfo:()=>({info:null,refresh:async()=>{}})},
  '@/utils/supabase/client':{createClient:()=>({auth:{getUser:async()=>({data:{user:{id:'member'}}})}})}},
  {window:{addEventListener:(n,fn)=>listeners[n]=fn,removeEventListener(){}},fetch:async()=>({json:async()=>({freeLeft:0})})}).default;
 cursor=0;a.equal(Gate(),null);effects[0]();listeners['qb-pass-required']();await new Promise(resolve=>setImmediate(resolve));
 cursor=0;const element=Gate();a.equal(element.type,Modal);a.equal(element.props.purchaseInNewTab,true);a.equal(element.props.user.id,'member');
});
test('purchase from a working tool opens a new tab and leaves the current URL untouched',async()=>{
 const calls=[],window={open:(...args)=>calls.push(args),location:{href:'/print-transform'}};
 const react={...React,useState:v=>[v,()=>{}],useEffect:()=>{}};
 const Pass=load('components/question-bank/PassModal.tsx',{...modalDeps(cfg),react},{window}).default;
 const tree=Pass({user:{id:'member'},info:null,onClose(){},onPaid(){},purchaseInNewTab:true});
 const button=find(tree,n=>n.type==='button'&&n.props.children==='이용권 구매하기 (새 탭)');a(button);a.equal(button.props.disabled,false);
 await button.props.onClick();a.deepEqual(calls,[['/mypage?pass=1','_blank','noopener,noreferrer']]);a.equal(window.location.href,'/print-transform');
});
test('pricing and quota text follows changed config in common notice, modal, terms and refund policy',()=>{
 // Change the authoritative constants before module evaluation: no stale duplicated number should remain.
 let source=fs.readFileSync(path.join(__dirname,'../src/lib/qbPassConfig.ts'),'utf8')
  .replace('price: 2_900','price: 4_321').replace('price: 9_900','price: 8_765').replace('salePrice: 29_000','salePrice: 34_567')
  .replace('days: 14, bundles: 10','days: 19, bundles: 17').replace('freePerWeek: 2','freePerWeek: 7');
 const mod={exports:{}};vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{module:mod,exports:mod.exports,Date});
 const changed=mod.exports;
 const label=load('lib/config.ts',{'./qbPassConfig':changed}).FREE_ACCESS_LABEL;
 a.match(label,/4,321원/);a.match(label,/8,765원\/19일/);a.match(label,/합쳐 17건/);a.match(label,/주 7회/);
 a(!label.includes('주 무료 2회'));a.match(label,/주 무료 7회/);
 const Pass=load('components/question-bank/PassModal.tsx',modalDeps(changed)).default;
 const html=renderToStaticMarkup(React.createElement(Pass,{user:null,info:{freeLeft:0},context:'exam',onClose(){},onPaid(){}}));
 for(const text of ['4,321','8,765','34,567','19일','17건'])a(html.includes(text),text);
 for(const file of ['components/TermsModal.tsx','components/RefundPolicyModal.tsx']){
  const C=load(file,{'@/lib/qbPassConfig':changed}).default;
  const html=renderToStaticMarkup(React.createElement(C,{isOpen:true,onClose(){}}));
  a(html.includes('8,765원/19일'));a(html.includes('합쳐 17건'));a(!html.includes('9,900'));
 }
});

test('actual passStatus reads live legacy-inclusive plan_usage and preserves a delivered PDF charge after restoration failure',async()=>{
 const member={id:'live-member',email:'student@example.com'},now=new Date().toISOString();
 const tables={purchased_items:[{id:'pass',user_id:member.id,item_type:cfg.PASS_EXAM.itemType,created_at:now}],
  plan_usage:[...Array.from({length:cfg.FREE_TRIAL.exam},(_,i)=>({id:'legacy-'+i,user_id:member.id,feature:'plan_free_exam',title:'exam-'+i,created_at:now})),
   {id:'bundle-use',user_id:member.id,feature:'plan_exam_bundle',title:'delivered',created_at:now}],
  feature_usage:[],pdf_jobs:[{id:'delivered',user_id:member.id,status:'error',hwp_ready:false,pdf_delivered:true}],question_bank_events:[]};
 const reads=[];
 const sb={from(table){reads.push(table);let rows=tables[table]||[];return {select(){return this;},order(){return this;},limit(n){rows=rows.slice(0,n);return this;},
  range(from,to){rows=rows.slice(from,to+1);return this;},eq(k,v){rows=rows.filter(r=>r[k]===v);return this;},in(k,v){rows=rows.filter(r=>v.includes(r[k]));return this;},
  gte(k,v){rows=rows.filter(r=>r[k]>=v);return this;},then(resolve,reject){return Promise.resolve({data:rows,error:null}).then(resolve,reject);}};}};
 const access=load('lib/planAccess.ts',{'./qbPassConfig':cfg});
 const pass=load('lib/qbPass.ts',{'@/utils/supabase/server-admin':{createAdminClient:()=>sb},'./qbPassConfig':cfg,'./planAccess':access});
 const status=await pass.passStatus(member);a.equal(status.freeExamLeft,0);a.equal(status.examLeft,cfg.PASS_EXAM.bundles-1);
 a(reads.includes('plan_usage'));a(!reads.includes('feature_usage'));
});
