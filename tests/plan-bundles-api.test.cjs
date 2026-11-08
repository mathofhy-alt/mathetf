require('./register.cjs');
const { test } = require('node:test');
const a = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript');
const { computeAccess, chooseCharge, planFeature } = require('../src/lib/planAccess.ts');
const policy = require('../src/lib/bundlePolicy.ts');
const config = require('../src/lib/qbPassConfig.ts');
const id = '00000000-0000-4000-8000-000000000001';
const rid = '00000000-0000-4000-8000-000000000004';
const qid = '00000000-0000-4000-8000-000000000002';
const member = { id: 'owner', email: 'test@example.com' };
const now = Date.now();
function load(file, deps, globals = {}) {
    const mod = { exports: {} };
    const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src', file), 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
    }).outputText;
    vm.runInNewContext(code, { module: mod, exports: mod.exports, Buffer, Date, console, require: name => {
        if (name in deps) return deps[name];
        if (name === 'crypto') return require('node:crypto');
        throw new Error('Unexpected import ' + name);
    }, ...globals});
    return mod.exports;
}
function harness(overrides = {}) {
    const state = { user: member, jobs: [], questions: [{ id: qid, work_status: 'sorted', content_xml: '<P>문제<ENDNOTE>해설</ENDNOTE></P>' }],
        bundle_selections: [{user_id:member.id,id:rid,kind:'predict',question_ids:[qid],created_at:new Date(now).toISOString()}], ps: { ...computeAccess([], []), unlimited: false, passUntil: null, admin: false }, reads: [], rpc: [], uploads: [], events: [], failRead: false, ...overrides };
    state.bundle_selections.forEach(r => r.id ||= rid);
    const admin = { from(table) {
        let rows = state[table === 'pdf_jobs' ? 'jobs' : table] || [], mutation;
        const query = {
            select() { return this; }, order() { return this; }, range(from,to) { rows=rows.slice(from,to+1); return this; }, limit(n) { rows = rows.slice(0,n); return this; },
            eq(k,v) { state.reads.push([table,k,v]); rows = rows.filter(r => r[k] === v); return this; },
            in(k,v) { rows = rows.filter(r => v.includes(r[k])); return this; },
            neq(k,v) { rows = rows.filter(r => r[k] !== v); return this; },
            gt(k,v) { rows=rows.filter(r=>r[k]>v); return this; },
            gte(k,v) { rows = rows.filter(r => r[k] >= v); return this; },
            update(v) { mutation = v; return this; },
            insert(v) { state[table] ||= []; state[table].push({created_at:new Date(now).toISOString(),...v}); return this; },
            maybeSingle() { return Promise.resolve({ data: rows[0] || null, error: state.failRead ? {} : null }); },
            single() { return this.maybeSingle(); },
            then(resolve,reject) { if (mutation) rows.forEach(r => Object.assign(r,mutation)); return Promise.resolve({ data: rows, error: state.failRead ? {} : null }).then(resolve,reject); },
        }; return query;
    }, storage: { from: () => ({ upload: async (name) => { state.events.push('upload'); state.uploads.push(name); return { error: state.failUpload ? {} : null }; }, remove: async () => ({}),
        createSignedUrl: async () => ({data:null,error:{message:'missing'}}),
        download: async name => name.endsWith('.pdf') || state.missingHml ? {data:null} : { data: { text: async () => '<HWPML />' } } }) },
    rpc: async (name,args) => {
        state.events.push(name);
        if(name==='fail_bundle_hwp') { const job=state.jobs.find(j=>j.id===args.p_id) || state.reservation; if(job && !job.hwp_ready && !job.pdf_delivered && job.status!=='done')job.status='error'; return {data:null}; }
        if(name==='claim_bundle_hwp') { const job=state.jobs.find(j=>j.id===args.p_id) || state.reservation; if(job)job.hwp_ready=true; return {data:job}; }
        state.rpc.push(args);
        state.reservation={id:args.p_id,user_id:args.p_user,kind:args.p_kind,plan_charge:args.p_charge,question_ids:args.p_ids,stamp:args.p_charge==='free',status:'pending',hwp_ready:false,retain_until:new Date(now+86400000).toISOString()};
        return {data:state.reservation};
    } };
    const deps = {
        '@/utils/supabase/server-admin': { createAdminClient: () => admin },
        '@/utils/supabase/server': { createClient: () => ({ auth: { getUser: async () => ({ data: { user: state.user } }) } }) },
        '@/lib/questions/privateDb': { stripPrivate: async rows => rows.filter(r => r.work_status !== 'private') },
        '@/lib/predict-hml': { buildPredictHml: async () => { state.events.push('build'); if(state.failBuild)throw Error('build failed'); return '<HWPML />'; } },
        '@/lib/hml-v2/member-stamp': { stampMemberId: xml => xml },
        '@/lib/qbPass': { passStatus: async () => state.ps },
        '@/lib/planAccess': { chooseCharge, planFeature },
        '@/lib/qbPassConfig': config,
        '@/lib/hwpPolicy': { hwpPassOnly: () => true },
        '@/lib/bundlePolicy': policy,
        '@/lib/pdfMemberStamp': { stampPdfMember: () => { throw Error('must not reach storage'); } },
        'next/server': { NextResponse: class { constructor(body,opts){this.body=body;this.status=opts?.status||200;} static json(body,opts){return new this(body,opts);} } },
    };
    const bundles = load('lib/planBundles.ts',deps);
    deps['@/lib/savedExamAccess'] = load('lib/savedExamAccess.ts',deps);
    deps['@/lib/planBundles'] = bundles;
    const previews = load('lib/predictAccess.ts',deps);
    deps['@/lib/predictAccess'] = previews;
    deps['@/lib/requireMember'] = {memberOnly:async()=>null};
    deps['@/lib/questions/imageAccess'] = load('lib/questions/imageAccess.ts',deps);
    return { state, bundles, previews, admin, deps, route: file => load(file,deps,{Date:state.DateClass || Date,setTimeout,clearTimeout}) };
}
const paid = (more = {}) => ({ id, user_id: member.id, kind: 'print', title: '프린트', status: 'done',
    created_at: new Date(now).toISOString(), plan_charge: 'once', retain_until: new Date(now + 86400000).toISOString(),
    question_ids: [qid], set_hash: policy.bundleHash([qid]), hwp_ready: false, ...more });
const exhausted = () => ({ ...computeAccess([], []), unlimited: false, freeBundleLeft: 0, freePredictLeft: 0 });

test('owned paid print re-download works with no active pass and never charges again', async () => {
    const h = harness({ jobs: [paid()], ps: exhausted(), bundle_selections:[{id:rid,user_id:member.id,kind:'print',question_ids:[qid]}] });
    a.equal((await h.bundles.prepareBundle(member,{ jobId:id },'hwp')).id,id);
    a.equal((await h.bundles.prepareBundle(member,{ ids:[qid],receiptId:rid,source:'print' },'pdf')).id,id);
    a.equal(h.state.rpc.length,0); a.equal(h.state.uploads.length,0);
});
test('another member cannot request a stored print bundle by ID', async () => {
    const h = harness({ jobs: [paid({ user_id:'someone-else' })] });
    await a.rejects(h.bundles.ownedPrintBundle(member,id), e => e.status === 404);
    a(h.state.reads.some(([table,k,v]) => table === 'pdf_jobs' && k === 'user_id' && v === member.id));
});
test('a refunded failed PDF cannot be upgraded to HWP by replaying its jobId', async () => {
    const h = harness({ jobs: [paid({ status:'error', hwp_ready:false })], ps: exhausted() });
    await a.rejects(h.bundles.prepareBundle(member,{jobId:id},'hwp'), e => e.status === 409);
    a.equal(h.state.jobs[0].hwp_ready,false);
});
test('expired jobId stays 410, while a valid new receipt lets an instructor start a new PDF or HWP job', async () => {
  for (const format of ['pdf','hwp']) {
    const h = harness({ jobs: [paid({ retain_until: new Date(now-1).toISOString() })], ps: { ...exhausted(), unlimited:true }, bundle_selections:[{id:rid,user_id:member.id,kind:'print',question_ids:[qid]}] });
    await a.rejects(h.bundles.prepareBundle(member,{jobId:id},format), e => e.status === 410);
    for(const receiptId of [undefined,'invalid',qid])
      await a.rejects(h.bundles.prepareBundle(member,{ids:[qid],receiptId},format),e=>e.status===409 || e.status===403);
    a.equal(h.state.rpc.length,0);a.equal(h.state.uploads.length,0);
    const job=await h.bundles.prepareBundle(member,{ids:[qid],receiptId:rid},format);
    a.notEqual(job.id,id);a.equal(job.plan_charge,'teacher');a.equal(job.stamp,false);
    a.equal(h.state.rpc.length,1);a.equal(h.state.rpc[0].p_receipt,rid);
    a.deepEqual([...h.state.rpc[0].p_features],[]);
  }
  const h=harness({jobs:[paid({retain_until:new Date(now-1).toISOString()})],ps:exhausted(),bundle_selections:[{id:rid,user_id:member.id,kind:'print',question_ids:[qid]}]});
  await a.rejects(h.bundles.prepareBundle(member,{ids:[qid],receiptId:rid},'pdf'),e=>e.status===402);
});
test('new paid print entitlement creates a fresh same-set job after expiry; previews use current entitlement',async()=>{
 for(const charge of ['once','exam'])for(const format of ['pdf','hwp']) {
  const ps={...exhausted(),...(charge==='once'?{onceLeft:1,onceTotal:2}:{examLeft:1,examGranted:10,examStart:'2026-11-01',examUntil:'2027-01-01'})};
  const h=harness({jobs:[paid({retain_until:new Date(now-1).toISOString()})],ps,bundle_selections:[{id:rid,user_id:member.id,kind:'print',question_ids:[qid]}]});
  await a.rejects(h.bundles.prepareBundle(member,{jobId:id},format),e=>e.status===410);
  await h.previews.previewAccess(member,'print',[qid],{receiptId:rid});
  const job=await h.bundles.prepareBundle(member,{ids:[qid],receiptId:rid},format);
  a.notEqual(job.id,id);a.equal(job.plan_charge,charge);a.equal(h.state.rpc.length,1);
  a.equal(h.state.rpc[0].p_receipt,rid);a.equal(h.state.jobs[0].retain_until,new Date(now-1).toISOString());
 }
});
test('instructor content and image previews accept new receipts past expired print and prediction sets; expired jobId is still rejected',async()=>{
 for(const kind of ['print','predict']) {
  const h=harness({jobs:[paid({kind,retain_until:new Date(now-1).toISOString()})],ps:{...exhausted(),unlimited:true,passUntil:'2027-01-01'},bundle_selections:[{id:rid,user_id:member.id,kind,question_ids:[qid]}]});
  await h.previews.previewAccess(member,kind,[qid],{receiptId:rid});
  for(const file of ['app/api/predict/content/route.ts','app/api/questions/images/route.ts']) {
   a.equal((await h.route(file).POST({headers:new Headers(),json:async()=>({ids:[qid],receiptId:rid,preview:true})})).status,200);
   for(const receiptId of [undefined,qid])
    a.equal((await h.route(file).POST({headers:new Headers(),json:async()=>({ids:[qid],receiptId,preview:true})})).status,receiptId?403:409);
  }
  a.equal(h.state.rpc.length,0);a.equal(h.state.uploads.length,0);
 }
 const h=harness({jobs:[paid({retain_until:new Date(now-1).toISOString()})],ps:{...exhausted(),unlimited:true}});
 await a.rejects(h.previews.previewAccess(member,'print',[qid],{jobId:id}),e=>e.status===410);
});
test('pending/private questions cannot be exported or re-downloaded', async () => {
    for (const work_status of ['pending','private']) {
        const h = harness({ jobs: [paid()], questions:[{id:qid,work_status}] });
        await a.rejects(h.bundles.prepareBundle(member,{jobId:id},'hwp'), e => e.status === 403);
    }
});
test('HWP skips free and reserves a once credit; prediction HWP still requires instructor pass', async () => {
    const h = harness({bundle_selections:[{user_id:member.id,id:rid,kind:'print',question_ids:[qid],created_at:new Date(now).toISOString()}]});
    h.state.ps.onceLeft=1; h.state.ps.onceTotal=1;
    await h.bundles.prepareBundle(member,{ids:[qid],receiptId:rid,source:'print'},'hwp');
    a.equal(h.state.rpc[0].p_charge,'once'); a.deepEqual([...h.state.rpc[0].p_features],['plan_once_bundle']);
    h.state.bundle_selections=[{user_id:member.id,id:rid,kind:'predict',question_ids:[qid],created_at:new Date(now).toISOString()}];
    await a.rejects(h.bundles.prepareBundle(member,{ids:[qid],receiptId:rid,source:'predict'},'hwp'), e => e.status === 402);
});
test('free-only member cannot get HWP and allowance read failure fails closed', async () => {
    const h = harness();
    await a.rejects(h.bundles.prepareBundle(member,{ids:[qid],receiptId:rid,source:'print'},'hwp'), e => e.status === 402 && e.needPass);
    h.state.failRead=true;
    await a.rejects(h.bundles.prepareBundle(member,{ids:[qid],receiptId:rid,source:'predict'},'pdf'), e => e.status === 503);
    a.equal(h.state.uploads.length,0);
});
test('print exam-pass reservation includes exam saves in the shared counter and precedes once credits', async () => {
    const h=harness({bundle_selections:[{user_id:member.id,id:rid,kind:'print',question_ids:[qid],created_at:new Date(now).toISOString()}],ps:{...exhausted(),examLeft:1,examGranted:10,examStart:'2026-11-01',examUntil:'2027-01-01',onceLeft:1,onceTotal:1}});
    await h.bundles.prepareBundle(member,{ids:[qid],receiptId:rid,source:'print'},'hwp');
    a.equal(h.state.rpc[0].p_charge,'exam');
    a.deepEqual([...h.state.rpc[0].p_features],['plan_exam_exam','plan_exam_bundle']);
    a.equal(h.state.rpc[0].p_limit,10);a.equal(h.state.rpc[0].p_since,'2026-11-01');
});
test('generate rejects exhausted prediction allowance before any candidate query', async () => {
    const h = harness({ps:exhausted()});
    const route = h.route('app/api/predict/generate/route.ts');
    const r = await route.POST({json:async()=>({units:['수학']})});
    a.equal(r.status,402); a.equal(r.body.needPass,true); a.equal(h.state.reads.length,0);
});
test('active exam pass with zero shared credits can preview and download predictions without a credit counter', async () => {
    const h=harness({ps:{...exhausted(),examUntil:new Date(now+86400000).toISOString(),examLeft:0,examGranted:10}});
    await h.previews.previewAccess(member,'predict');
    a.equal(h.state.rpc.length,0); // generating/previewing never consumes
    const generated=await h.route('app/api/predict/generate/route.ts').POST({json:async()=>({units:['수학']})});
    a.equal(generated.status,200); a.equal(h.state.rpc.length,0);
    await h.bundles.prepareBundle(member,{ids:[qid],receiptId:rid,source:'predict'},'pdf');
    a.equal(h.state.rpc[0].p_charge,'exam');
    a.deepEqual([...h.state.rpc[0].p_features],[]);
    await a.rejects(h.bundles.prepareBundle(member,{ids:[qid],receiptId:rid,source:'predict'},'hwp'),e=>e.status===402);
});
test('once credits do not bypass free prediction limits; instructor pass does', async () => {
    const h=harness({ps:{...exhausted(),onceLeft:5,onceTotal:5}});
    await a.rejects(h.previews.previewAccess(member,'predict'),e=>e.status===402);
    await a.rejects(h.bundles.prepareBundle(member,{ids:[qid],receiptId:rid,source:'predict'},'pdf'),e=>e.status===402);
    h.state.ps.unlimited=true; h.state.ps.passUntil=new Date(now+86400000).toISOString();
    await h.bundles.prepareBundle(member,{ids:[qid],receiptId:rid,source:'predict'},'hwp');
    a.equal(h.state.rpc[0].p_charge,'teacher');
});
test('a previously received prediction is reusable after daily/weekly limits or pass expiry without charging', async () => {
    for(const plan_charge of ['free','exam','teacher']) {
        const job=paid({kind:'predict',plan_charge,retain_until:null});
        const h=harness({ps:exhausted(),jobs:[job]});
        await h.previews.previewAccess(member,'predict',[qid],{receiptId:rid});
        a.equal((await h.bundles.prepareBundle(member,{ids:[qid],receiptId:rid,source:'predict'},'pdf')).id,id);
        a.equal(h.state.rpc.length,0); a.equal(h.state.uploads.length,0);
    }
});
test('content blocks new sets after allowance is exhausted but permits owned received set', async () => {
    const h = harness({ps:exhausted(),jobs:[paid()],bundle_selections:[{id:rid,user_id:member.id,kind:'print',question_ids:[qid]}]});
    const route=h.route('app/api/predict/content/route.ts');
    const allowed=await route.POST({json:async()=>({ids:[qid],receiptId:rid,source:'print'})});
    a.equal(allowed.status,200); a.equal(allowed.body.content[qid],'<P>문제</P>');
    const denied=await route.POST({json:async()=>({ids:[qid],receiptId:rid,source:'predict'})});
    a.equal(denied.status,200); a.equal(denied.body.content[qid],'<P>문제</P>'); // client source cannot override stored print origin
});
test('content and generation reject anonymous requests', async () => {
    const h=harness({user:null});
    for (const file of ['content','generate']) {
        const route=h.route(`app/api/predict/${file}/route.ts`);
        const r=await route.POST({json:async()=>({ids:[qid]})}); a.equal(r.status,401);
    }
});
test('direct PDF polling enforces owner and expiry before issuing any storage URL', async () => {
    for (const [job,expected] of [[paid({user_id:'other'}),404],[paid({retain_until:new Date(now-1).toISOString()}),410]]) {
        const h=harness({jobs:[job]});
        const r=await h.route('app/api/pdf/[id]/route.ts').GET({}, {params:{id}}); a.equal(r.status,expected);
    }
});
test('a missing retained PDF is rebuilt under the same job without charging or extending expiry', async () => {
    const job = paid();
    const expires = job.retain_until;
    const h = harness({jobs:[job]});
    const r = await h.route('app/api/pdf/[id]/route.ts').GET({}, {params:{id}});
    a.equal(r.body.status,'pending'); a.equal(job.status,'pending');
    a.equal(job.retain_until,expires); a.equal(h.state.rpc.length,0);
    a.deepEqual(h.state.uploads,[`${id}.hml`]);
});
test('a cleaned-up prediction PDF is rebuilt under its original job without consuming day/week usage', async () => {
    const job=paid({kind:'predict',plan_charge:'free',retain_until:null});
    const h=harness({jobs:[job],ps:exhausted()});
    const r=await h.route('app/api/pdf/[id]/route.ts').GET({}, {params:{id}});
    a.equal(r.body.status,'pending'); a.equal(job.status,'pending');
    a.equal(job.retain_until,null); a.equal(h.state.rpc.length,0);
    a.deepEqual(h.state.uploads,[`${id}.hml`]);
});
test('instructor requests a fresh unmarked job instead of reusing a free print or prediction PDF, without charging',async()=>{
 for(const kind of ['print','predict']){
  const job=paid({kind,plan_charge:'free',stamp:true,retain_until:null,receipt_id:rid});
  const h=harness({jobs:[job],bundle_selections:[{id:rid,user_id:member.id,kind,question_ids:[qid]}],ps:{...exhausted(),unlimited:true,passUntil:'2027-01-01'}});
  const fresh=await h.bundles.prepareBundle(member,{ids:[qid],receiptId:rid},'pdf');
  a.notEqual(fresh.id,id);a.equal(fresh.plan_charge,'teacher');a.equal(fresh.stamp,false);
  a.equal(h.state.rpc.length,1);a.deepEqual([...h.state.rpc[0].p_features],[]);
  a.equal(job.stamp,true);a.equal(job.plan_charge,'free');
 }
});
test('cleaned free print regenerates within the original receipt without new charge or job, and fails closed on a bad receipt',async()=>{
 const job=paid({plan_charge:'free',stamp:true,retain_until:null,receipt_id:rid});
 const h=harness({jobs:[job],bundle_selections:[{id:rid,user_id:member.id,kind:'print',question_ids:[qid]}],ps:exhausted(),missingHml:true});
 for(let i=0;i<2;i++){
  job.status='done';
  const same=await h.bundles.prepareBundle(member,{ids:[qid],receiptId:rid},'pdf');a.equal(same.id,id);
  const r=await h.route('app/api/pdf/[id]/route.ts').GET({}, {params:{id}});
  a.equal(r.body.status,'pending');a.equal(job.status,'pending');a.equal(job.retain_until,null);
 }
 a.equal(h.state.rpc.length,0);a(h.state.events.includes('build'));a.equal(job.stamp,true);
 h.state.bundle_selections[0].user_id='other';job.status='done';
 a.equal((await h.route('app/api/pdf/[id]/route.ts').GET({}, {params:{id}})).status,403);
});
test('HWP confirms only after file preparation; failed build or upload refunds an undelivered reservation',async()=>{
 const body={jobId:id};
 for(const mode of ['success','build','upload']){
  const job=paid({status:'pending'});
  const h=harness({jobs:[job],missingHml:mode==='build',failBuild:mode==='build',failUpload:mode==='upload'});
  const r=await h.route('app/api/predict/hwp/route.ts').POST({json:async()=>body});
  if(mode==='success'){
   a.equal(r.status,200);a.equal(job.hwp_ready,true);
   a(h.state.events.indexOf('upload')<h.state.events.indexOf('claim_bundle_hwp'));
  }else{
   a.equal(r.status,503);a.equal(job.hwp_ready,false);a.equal(job.status,'error');
   a(!h.state.events.includes('claim_bundle_hwp'));a(h.state.events.includes('fail_bundle_hwp'));
  }
 }
 for(const prior of [{hwp_ready:true},{pdf_delivered:true,status:'error'}]){
  const job=paid({...prior}),h=harness({jobs:[job],failUpload:true});
  a.equal((await h.route('app/api/predict/hwp/route.ts').POST({json:async()=>body})).status,503);
  a.equal(job.status,prior.status || 'done');a.equal(job.hwp_ready,prior.hwp_ready || false);
 }
});
test('a newly reserved once-credit HWP that fails file preparation stays unconfirmed and releases that reservation',async()=>{
 const h=harness({bundle_selections:[{id:rid,user_id:member.id,kind:'print',question_ids:[qid]}],ps:{...exhausted(),onceLeft:1,onceTotal:1}});
 const storage=h.admin.storage.from();let uploads=0;
 h.admin.storage.from=()=>({...storage,upload:async(name)=>{
  uploads++;h.state.events.push('upload');
  if(uploads===2){a.equal(h.state.reservation.hwp_ready,false);return {error:{message:'storage down'}};}
  return {error:null};
 }});
 const r=await h.route('app/api/predict/hwp/route.ts').POST({json:async()=>({ids:[qid],receiptId:rid})});
 a.equal(r.status,503);a.equal(h.state.rpc[0].p_charge,'once');a.equal(h.state.rpc[0].p_hwp,true);
 a.equal(h.state.reservation.hwp_ready,false);a.equal(h.state.reservation.status,'error');
 a(!h.state.events.includes('claim_bundle_hwp'));a(h.state.events.includes('fail_bundle_hwp'));
});

test('client source cannot turn prediction questions into print HWP or evade exhausted print counters',async()=>{
 for(const ps of [{onceLeft:1,onceTotal:1},{examLeft:1,examGranted:10,examUntil:'2027-01-01'}]){
  const h=harness({ps:{...exhausted(),...ps},bundle_selections:[{user_id:member.id,id:rid,kind:'predict',question_ids:[qid],created_at:new Date(now).toISOString()}]});
  await a.rejects(h.bundles.prepareBundle(member,{ids:[qid],receiptId:rid,source:'print'},'hwp'),e=>e.status===402);
  a.equal(h.state.uploads.length,0);
 }
 const h=harness({ps:{...exhausted(),examUntil:'2027-01-01',examLeft:0},bundle_selections:[{user_id:member.id,id:rid,kind:'print',question_ids:[qid],created_at:new Date(now).toISOString()}]});
 await a.rejects(h.bundles.prepareBundle(member,{ids:[qid],receiptId:rid,source:'predict'},'pdf'),e=>e.status===402);
 a.equal(h.state.rpc.length,0);
});
test('a stale HWP upgrade is rejected by the atomic claim instead of writing hwp_ready directly',async()=>{
 const h=harness({jobs:[paid({status:'pending'})]});
 h.admin.rpc=async(name,args)=>{if(name==='fail_bundle_hwp')return {};a.equal(name,'claim_bundle_hwp');a.equal(args.p_id,id);return {data:null,error:{message:'BUNDLE_UNAVAILABLE'}};};
 const r=await h.route('app/api/predict/hwp/route.ts').POST({json:async()=>({jobId:id})});
 a.equal(r.status,409);
 a.equal(h.state.jobs[0].hwp_ready,false);
});
test('signed URLs subtract a 60 second margin and never outlive the remaining retention after storage delay',async()=>{
 for(const delay of [10000,61000]){
  let clock=Date.now(); class Clock extends Date { static now(){return clock;} }
  const until=clock+90000;
  const h=harness({DateClass:Clock,jobs:[paid({retain_until:new Date(until).toISOString()})]});let signs=0;
  const original=h.admin.storage.from();
  h.admin.storage.from=()=>({...original,createSignedUrl:async(file,ttl)=>{
   signs++;a.equal(ttl,30);clock+=delay;
   return {data:{signedUrl:'signed'}};
  }});
  const r=await h.route('app/api/pdf/[id]/route.ts').GET({}, {params:{id}});
  a.equal(signs,1);
  if(delay===10000){a.equal(r.status,200);a.equal(r.body.url,'signed');a(clock+30000<=until);}
  else {a.equal(r.status,410);a.equal(r.body.url,undefined);}
 }
 const h=harness({jobs:[paid({retain_until:new Date(Date.now()+30000).toISOString()})]});let signs=0;
 h.admin.storage.from=()=>({createSignedUrl:async()=>{signs++;throw Error('must not sign');}});
 a.equal((await h.route('app/api/pdf/[id]/route.ts').GET({}, {params:{id}})).status,410);a.equal(signs,0);
});

test('generation returns an immutable receipt; overlapping later print history cannot relabel it',async()=>{
 const h=harness({questions:[{id:qid,work_status:'sorted',unit:'math',difficulty:'1'}]});
 const r=await h.route('app/api/predict/generate/route.ts').POST({json:async()=>({units:['math']})});
 a.equal(r.status,200);a.equal(r.body.questions[0].id,qid);a.match(r.body.receiptId,/^[0-9a-f-]{36}$/);
 a.equal(await h.bundles.resolveBundleSource(member,[qid],r.body.receiptId),'predict');
 const printReceipt=await h.bundles.recordBundleSelection(member,'print',[qid]);
 a.equal(await h.bundles.resolveBundleSource(member,[qid],printReceipt),'print');
 a.equal(await h.bundles.resolveBundleSource(member,[qid],r.body.receiptId),'predict');
 h.state.bundle_selections.find(x=>x.id===printReceipt).user_id='someone-else';
 await a.rejects(h.bundles.resolveBundleSource(member,[qid],printReceipt),e=>e.status===403);
});

test('a delivered PDF that failed restoration can be requeued without another charge or losing preview rights',async()=>{
 const job=paid({status:'error',pdf_delivered:true});const h=harness({jobs:[job],ps:exhausted(),bundle_selections:[{id:rid,user_id:member.id,kind:'print',question_ids:[qid]}]});
 await h.previews.previewAccess(member,'predict',[qid],{receiptId:rid});
 await h.bundles.prepareBundle(member,{jobId:id},'pdf');
 a.equal(job.status,'pending');a.equal(job.pdf_delivered,true);a.equal(h.state.rpc.length,0);
});

test('unrecorded or mixed-origin IDs cannot be relabeled as either product even with a valid exam pass',async()=>{
 const other='00000000-0000-4000-8000-000000000003';
 const h=harness({ps:{...exhausted(),examUntil:'2027-01-01',examLeft:0},bundle_selections:[]});
 for(const source of ['print','predict'])await a.rejects(h.bundles.prepareBundle(member,{ids:[qid],receiptId:rid,source},'pdf'),e=>e.status===403);
 h.state.bundle_selections=[{user_id:member.id,id:rid,kind:'print',question_ids:[qid],created_at:new Date(now).toISOString()},
  {user_id:member.id,kind:'predict',question_ids:[other],created_at:new Date(now).toISOString()}];
 await a.rejects(h.bundles.resolveBundleSource(member,[qid,other],rid),e=>e.status===403);
});

test('RPC quota races also request PassModal, and previously delivered restoration errors stay in the cabinet',async()=>{
 const h=harness();
 h.admin.rpc=async()=>({data:null,error:{code:'P0001',message:'PLAN_LIMIT'}});
 await a.rejects(h.bundles.prepareBundle(member,{ids:[qid],receiptId:rid,source:'predict'},'pdf'),e=>e.status===402&&e.needPass);
 const stored=harness({jobs:[paid({status:'error',pdf_delivered:true})]});
 const r=await stored.route('app/api/print/bundles/route.ts').GET();
 a.equal(r.status,200);a.equal(r.body.bundles.length,1);a.equal(r.body.bundles[0].id,id);
});

test('receipt boundaries reject adding or mixing IDs for PDF, HWP and chunked previews even with overlapping histories',async()=>{
 const q2='00000000-0000-4000-8000-000000000003';
 const r2='00000000-0000-4000-8000-000000000005';
 const h=harness({ps:{...exhausted(),examUntil:'2027-01-01',examLeft:0},bundle_selections:[
  {id:rid,user_id:member.id,kind:'print',question_ids:[qid]},
  {id:r2,user_id:member.id,kind:'predict',question_ids:[qid,q2]},
 ]});
 for(const receiptId of [rid,[rid,r2]]){
  for(const format of ['pdf','hwp'])
   await a.rejects(h.bundles.prepareBundle(member,{ids:[qid,q2],receiptId,source:'predict'},format),e=>e.status===403);
  for(const file of ['app/api/predict/content/route.ts','app/api/questions/images/route.ts']){
   const r=await h.route(file).POST({headers:new Headers(),json:async()=>({ids:[qid],setIds:[qid,q2],receiptId,preview:true})});
   a.equal(r.status,403);a.deepEqual(Object.keys(r.body.content || r.body.images),[]);
  }
 }
 // Adding q2 used to switch q1 to unlimited prediction. The print receipt remains print.
 await a.rejects(h.bundles.prepareBundle(member,{ids:[qid],receiptId:rid},'pdf'),e=>e.status===402);
 // The prediction receipt cannot turn into a print HWP even when every ID also has print history.
 for(const ps of [{onceLeft:1,onceTotal:1},{examLeft:1,examGranted:10,examUntil:'2027-01-01'}]){
  Object.assign(h.state.ps,ps);
  const r=await h.route('app/api/predict/hwp/route.ts').POST({json:async()=>({ids:[qid],receiptId:r2,source:'print'})});
  a.equal(r.status,402);a.equal(r.body.needPass,true);
 }
 a.equal(h.state.rpc.length,0);a.equal(h.state.uploads.length,0);
});

test('a subset keeps its receipt kind; foreign, missing, unknown and multiple receipts fail before file or credit work',async()=>{
 const q2='00000000-0000-4000-8000-000000000003';
 const h=harness({bundle_selections:[{id:rid,user_id:member.id,kind:'predict',question_ids:[qid,q2]}]});
 a.equal(await h.bundles.resolveBundleSource(member,[qid],rid),'predict');
 const subset=await h.route('app/api/questions/images/route.ts').POST({headers:new Headers(),json:async()=>({ids:[qid],receiptId:rid,preview:true})});
 a.equal(subset.status,200);
 for(const receiptId of [undefined,null,'','invalid',id,[rid],rid]){
  if(receiptId===rid)h.state.bundle_selections[0].user_id='other-member';
  for(const file of ['app/api/pdf/route.ts','app/api/predict/hwp/route.ts','app/api/predict/content/route.ts','app/api/questions/images/route.ts']){
   const r=await h.route(file).POST({headers:new Headers(),json:async()=>({ids:[qid],receiptId,source:'print',preview:true})});
   a.equal(r.status,receiptId===undefined || receiptId===null || receiptId==='' ? 409 : 403,file);
   if(r.status===409)a.equal(r.body.error,'페이지를 새로 고친 뒤 다시 받아 주세요.');
  }
 }
 a.equal(h.state.rpc.length,0);a.equal(h.state.uploads.length,0);
});

test('legacy jobId re-download needs no receipt but raw IDs never inherit legacy provenance',async()=>{
 const h=harness({jobs:[paid()],bundle_selections:[],ps:exhausted()});
 a.equal((await h.bundles.prepareBundle(member,{jobId:id},'hwp')).id,id);
 await a.rejects(h.bundles.prepareBundle(member,{ids:[qid]},'pdf'),e=>e.status===409);
 await a.rejects(h.bundles.prepareBundle(member,{jobId:id,ids:['00000000-0000-4000-8000-000000000003']},'pdf'),e=>e.status===403);
 h.state.jobs[0].receipt_id=rid;
 await a.rejects(h.bundles.prepareBundle(member,{jobId:id},'pdf'),e=>e.status===403);
 a.equal((await h.route('app/api/pdf/[id]/route.ts').GET({}, {params:{id}})).status,403);
 a.equal(h.state.rpc.length,0);
});

test('print matching issues one server receipt and extends it only with current server candidates',async()=>{
 const q2='00000000-0000-4000-8000-000000000003';
 const h=harness({bundle_selections:[]});let candidate=qid;
 Object.assign(h.deps,{
  '@/lib/print-vision':{readCrop:async()=>({text:'math',unit:'math',concepts:[]})},
  '@/lib/embeddings':{generateEmbedding:async()=>({embedding:[1]})},
  '@/lib/curriculum':{SUBJECT_UNITS:{math:['math']},unitVariants:u=>[u]},
  '@/lib/print-original':{},'@/lib/print-syllable':{},
 });
 h.admin.rpc=async(name)=>{a.equal(name,'match_predict');return {data:[{id:candidate}]};};
 const route=h.route('app/api/print/match/route.ts');
 const one=await route.POST({json:async()=>({image:'image'})});a.equal(one.status,200);
 a.equal(await h.bundles.resolveBundleSource(member,[qid],one.body.receiptId),'print');
 candidate=q2;
 const two=await route.POST({json:async()=>({image:'image',receiptId:one.body.receiptId,ids:[id]})});
 a.equal(two.status,200);a.notEqual(two.body.receiptId,one.body.receiptId);
 a.equal(await h.bundles.resolveBundleSource(member,[qid,q2],two.body.receiptId),'print');
 await a.rejects(h.bundles.resolveBundleSource(member,[q2],one.body.receiptId),e=>e.status===403);
 await a.rejects(h.bundles.resolveBundleSource(member,[id],two.body.receiptId),e=>e.status===403);
 const prediction=await h.bundles.recordBundleSelection(member,'predict',[qid]);
 a.equal((await route.POST({json:async()=>({image:'image',receiptId:prediction})})).status,403);
});
