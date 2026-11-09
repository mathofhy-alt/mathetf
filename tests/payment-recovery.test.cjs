require('./register.cjs');
const {test}=require('node:test'),a=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const {verifyPaidPayment}=require('../src/lib/payments/order.ts');
const {payOrder,clearPendingPayment}=require('../src/lib/payments/client.ts');
const uid='11111111-1111-4111-8111-111111111111',item='22222222-2222-4222-8222-222222222222';
const paymentId='order-'+'a'.repeat(32),newId='order-'+'b'.repeat(32);
const user={id:uid,email:'payment@example.invalid',user_metadata:{phone:'01000000000'}};
const input={kind:'cart',items:[{item_id:item}],usedPoints:1000};
const baseOrder={payment_id:paymentId,user_id:uid,kind:'cart',status:'pending',amount:1000,total:1000,used_points:0,items:[{item_id:item}],created_at:new Date().toISOString()};
function serverHarness({status='READY',order=baseOrder,lookupStatus=200,userId=uid}={}){
    const calls={lookup:0,rpc:0,deleted:[]};
    order={...order};
    const sb={from(table){const q={select(){return q;},eq(){return q;},limit:async()=>({data:[],error:null}),in(k,ids){calls.deleted.push({table,k,ids});return Promise.resolve({error:null});},delete(){return q;},single:async()=>({data:order?.user_id===userId?{...order}:null,error:null})};return q;},rpc:async name=>{if(name==='payment_checkout_ready')return {data:true,error:null};if(name==='supersede_payment_order'){order.status='superseded';return {data:{superseded:true},error:null};}if(name==='defer_payment_reconciliation')return {error:null};calls.rpc++;return {data:{status:'completed',alreadyProcessed:false},error:null};}};
    function load(file){const mod={exports:{}};
    const code=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/lib/payments',file+'.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
    vm.runInNewContext(code,{module:mod,exports:mod.exports,process:{env:{PORTONE_API_SECRET:'local-only'}},AbortSignal,Set,console,
        fetch:async()=>{calls.lookup++;return {ok:lookupStatus===200,status:lookupStatus,json:async()=>({id:paymentId,status,currency:'KRW',amount:{total:order.amount},customer:{id:uid},customData:{orderId:paymentId}})};},
        require:n=>n==='next/server'?{NextResponse:{json:(body,options)=>({body,status:options?.status||200})}}:n==='@/utils/supabase/server'?{createClient:()=>({auth:{getUser:async()=>({data:{user:{id:userId}}})}})}:n==='@/utils/supabase/server-admin'?{createAdminClient:()=>sb}:n==='./order'?require('../src/lib/payments/order.ts'):n==='./reconcile'?load('reconcile'):n==='../schemaCapabilities'?load('../schemaCapabilities'):(()=>{throw Error(n);})()});return mod.exports;}
    return {calls,complete:body=>load('complete').completeOrder({json:async()=>({paymentId,...body})})};
}
test('READY at any age requires a choice; pending approvals never expire into a new charge',async()=>{
    for(const age of [0,86400000]){
        const order={...baseOrder,created_at:new Date(Date.now()-age).toISOString()};
        const h=serverHarness({order});a.equal((await h.complete()).body.code,'PAYMENT_RETRY_CHOICE');a.equal(h.calls.rpc,0);
        for(const status of ['PENDING','PAY_PENDING','CANCEL_PENDING','VIRTUAL_ACCOUNT_ISSUED']){
            const h=serverHarness({order,status});a.equal((await h.complete()).body.code,'PAYMENT_PENDING');a.equal(h.calls.rpc,0);
        }
    }
});
test('PAID completes original order even when retry basket/points differ; removes only purchased cart rows',async()=>{
    const h=serverHarness({status:'PAID'});const res=await h.complete({retryInput:input});
    a.equal(res.body.success,true);a.equal(h.calls.rpc,1);a.deepEqual(JSON.parse(JSON.stringify(h.calls.deleted)),[{table:'cart_items',k:'item_id',ids:[item]}]);
    const completed=serverHarness({status:'PAID',order:{...baseOrder,status:'completed'}});a.equal((await completed.complete()).body.alreadyProcessed,true);a.equal(completed.calls.lookup,1);a.equal(completed.calls.rpc,0);
});
test('zero-won completion skips provider; changed zero-won selection is released without spending points',async()=>{
    const order={...baseOrder,amount:0,used_points:1000};
    const h=serverHarness({order});a.equal((await h.complete({retryInput:input})).body.success,true);a.equal(h.calls.lookup,0);a.equal(h.calls.rpc,1);
    const changed=serverHarness({order});a.equal((await changed.complete({retryInput:{...input,usedPoints:0}})).body.code,'PAYMENT_SUPERSEDED');a.equal(changed.calls.rpc,0);
    a.equal((await changed.complete()).body.code,'PAYMENT_SUPERSEDED');
});
test('provider outage and wrong owner cannot release a payment; permanent provider states require persisted review',async()=>{
    for(const args of [{lookupStatus:500}]){
        const h=serverHarness(args);a.equal((await h.complete()).body.code,'ORDER_RETRY');a.equal(h.calls.rpc,0);
    }
    for(const status of ['UNKNOWN_FUTURE','PARTIAL_CANCELLED']){
        const h=serverHarness({status});a.equal((await h.complete()).body.code,'PAYMENT_MANUAL_REVIEW');a.equal(h.calls.rpc,1);a.equal(h.calls.deleted.length,0);
    }
    const missing=serverHarness({lookupStatus:404});a.equal((await missing.complete()).body.code,'PAYMENT_RETRY_CHOICE');
    const stranger=serverHarness({userId:item});a.equal((await stranger.complete()).status,404);a.equal(stranger.calls.lookup,0);
});
test('paid details must match server identity, amount, currency and custom order id',()=>{
    const paid={id:paymentId,status:'PAID',currency:'KRW',amount:{total:1000},customer:{id:uid},customData:{orderId:paymentId}};
    verifyPaidPayment(baseOrder,paid);
    for(const bad of [{id:newId},{amount:{total:1}},{currency:'USD'},{customer:{id:item}},{customData:{orderId:newId}}])a.throws(()=>verifyPaidPayment(baseOrder,{...paid,...bad}),/PAYMENT_MISMATCH/);
});
function clientHarness(t,{pending=paymentId,code='PAYMENT_NOT_PAID',sdk=async()=>({}),completeSuccess=false}={}){
    if(!t.paymentOriginals){
        t.paymentOriginals={fetch:global.fetch,window:global.window,localStorage:global.localStorage};
        t.after(()=>Object.assign(global,t.paymentOriginals));
    }
    const storageKey=`mathetf_pending_payment_${uid}_cart`,saved=new Map(pending?[[storageKey,pending]]:[]),calls=[];
    const events={};
    global.localStorage={getItem:k=>saved.get(k)||null,setItem:(k,v)=>saved.set(k,v),removeItem:k=>saved.delete(k)};
    global.window={location:{origin:'http://localhost:3129'},dispatchEvent(){},addEventListener:(n,fn)=>events[n]=fn,removeEventListener:n=>delete events[n],PortOne:{requestPayment:async opts=>{calls.push({sdk:opts});return sdk(opts);}}};
    global.fetch=async(url,options)=>{
        const body=JSON.parse(options.body);calls.push({url,body});
        if(url==='/api/payments/orders')return {ok:true,json:async()=>({paymentId:newId,amount:0,usedPoints:1000,name:'검증 자료'})};
        const success=body.paymentId===newId||completeSuccess;
        return {ok:success,json:async()=>success?{success:true,kind:'cart'}:{success:false,code,message:code}};
    };
    return {saved,calls,storageKey,events};
}
test('unpaid recovery passes previous ID to server replacement and completes full-point order without SDK',async t=>{
    const h=clientHarness(t);await payOrder(user,input);
    a.deepEqual(h.calls.filter(c=>c.url).map(c=>c.url),['/api/payments/complete','/api/payments/orders','/api/payments/complete']);
    a.equal(h.calls.find(c=>c.url==='/api/payments/orders').body.supersedePaymentId,paymentId);a.equal(h.calls.find(c=>c.url==='/api/payments/orders').body.usedPoints,1000);a.equal(h.calls.filter(c=>c.sdk).length,0);a.equal(h.saved.size,0);
});
test('previous PAID completes and never creates a second order even for changed cart',async t=>{
    const h=clientHarness(t,{completeSuccess:true});await payOrder(user,input);a.equal(h.calls.length,1);a.equal(h.saved.size,0);
});
test('pending/unavailable result retains pointer and prevents new orders',async t=>{
    for(const code of ['PAYMENT_PENDING','ORDER_RETRY']){
        const h=clientHarness(t,{code});await a.rejects(payOrder(user,input));a.equal(h.calls.length,1);a.equal(h.saved.get(h.storageKey),paymentId);
    }
});
test('simultaneous clicks share the exact checkout promise and spend once',async t=>{
    const h=clientHarness(t,{pending:null});const p=payOrder(user,input),q=payOrder(user,input);a.equal(p,q);await Promise.all([p,q]);a.equal(h.calls.filter(c=>c.url==='/api/payments/orders').length,1);
});
test('stale callbacks cannot erase a newer pending order',t=>{
    const h=clientHarness(t,{pending:newId});clearPendingPayment(uid,'cart',paymentId);a.equal(h.saved.get(h.storageKey),newId);
});
test('SDK failure must still reconcile PAID; SDK cancellation cannot discard pending approval',async t=>{
    const h=clientHarness(t,{pending:null});let status='PAID';
    global.fetch=async(url,options)=>{
        h.calls.push({url});return {ok:status==='PAID'||url.endsWith('/orders'),json:async()=>url.endsWith('/orders')?{paymentId:newId,amount:1000,name:'자료'}:status==='PAID'?{success:true,kind:'cart'}:{success:false,code:'PAYMENT_PENDING',message:'승인 확인 중'}};
    };
    window.PortOne.requestPayment=async()=>{throw Error('SDK disconnected');};
    await payOrder(user,{...input,usedPoints:0});a.equal(h.saved.size,0);a.equal(h.calls.filter(c=>c.url.endsWith('/complete')).length,1);
    status='PENDING';window.PortOne.requestPayment=async()=>({code:'CANCELLED'});
    await a.rejects(payOrder(user,{...input,usedPoints:0}));a.equal(h.saved.get(h.storageKey),newId);
});
test('bfcache back navigation settles a suspended SDK and reconciles the original order',async t=>{
    const h=clientHarness(t,{pending:null});
    global.fetch=async url=>url.endsWith('/orders')?{ok:true,json:async()=>({paymentId:newId,amount:1000,name:'자료'})}:{ok:false,json:async()=>({success:false,code:'PAYMENT_NOT_PAID',message:'미결제'})};
    window.PortOne.requestPayment=()=>new Promise(()=>{});
    const promise=payOrder(user,{...input,usedPoints:0});
    while(!h.events.pageshow)await new Promise(r=>setImmediate(r));
    h.events.pageshow({persisted:true});await a.rejects(promise);a.equal(h.saved.get(h.storageKey),newId);
});
test('recent READY offers wait or explicit replacement; wait preserves pointer and creates no order',async t=>{
    const h=clientHarness(t,{code:'PAYMENT_RETRY_CHOICE'});let replace=false;
    window.confirm=()=>replace;
    await a.rejects(payOrder(user,input));a.equal(h.calls.length,1);a.equal(h.saved.get(h.storageKey),paymentId);
    replace=true;h.calls.length=0;await payOrder(user,input);
    const request=h.calls.find(c=>c.url==='/api/payments/orders').body;a.equal(request.replaceOpen,true);a.equal(request.supersedePaymentId,paymentId);a.equal(h.saved.size,0);
});
test('lost creation response preserves request id and recovers completed order on retry',async t=>{
    const h=clientHarness(t,{pending:null});const requests=[];let lost=true;
    global.fetch=async(url,options)=>{
        const body=JSON.parse(options.body);
        if(url.endsWith('/orders')){requests.push(body.requestId);if(lost){lost=false;throw Error('lost create response');}return {ok:true,json:async()=>({recoverPaymentId:paymentId})};}
        return {ok:true,json:async()=>({success:true,kind:'cart'})};
    };
    await a.rejects(payOrder(user,input),/lost create/);a.equal(h.saved.get(h.storageKey+'_request'),requests[0]);
    await payOrder(user,input);a.equal(requests[0],requests[1]);a.equal(h.saved.size,0);
});
test('recovered unapproved order gets a new creation key only after explicit replacement choice',async t=>{
    const h=clientHarness(t,{pending:null});const requests=[];window.confirm=()=>true;
    global.fetch=async(url,options)=>{
        const body=JSON.parse(options.body);
        if(url.endsWith('/orders')){requests.push(body);return {ok:true,json:async()=>requests.length===1?{recoverPaymentId:paymentId}:{paymentId:newId,amount:0,usedPoints:1000}};}
        return {ok:body.paymentId===newId,json:async()=>body.paymentId===newId?{success:true,kind:'cart'}:{code:'PAYMENT_RETRY_CHOICE'}};
    };
    await payOrder(user,input);a.equal(requests.length,2);a.notEqual(requests[0].requestId,requests[1].requestId);a.equal(requests[1].replaceOpen,true);a.equal(h.saved.size,0);
});

test('manual review moves the old recovery pointer to a separate record and allows another checkout',async t=>{
 const h=clientHarness(t,{code:'PAYMENT_MANUAL_REVIEW'});await payOrder(user,input);
 a.equal(h.calls.filter(c=>c.url==='/api/payments/orders').length,1);
 a.equal(h.calls.find(c=>c.url==='/api/payments/orders').body.supersedePaymentId,undefined);
 a.equal(h.saved.get(h.storageKey),undefined);
 a.deepEqual(JSON.parse(h.saved.get(`mathetf_review_payments_${uid}_cart`)),[paymentId]);
});

test('durable refund pending moves the recovery pointer aside and allows an unrelated checkout',async t=>{
 const h=clientHarness(t,{code:'PAYMENT_REFUND_PENDING'});await payOrder(user,input);
 a.equal(h.calls.filter(c=>c.url==='/api/payments/orders').length,1);
 a.equal(h.calls.find(c=>c.url==='/api/payments/orders').body.supersedePaymentId,undefined);
 a.equal(h.saved.get(h.storageKey),undefined);
 a.deepEqual(JSON.parse(h.saved.get(`mathetf_review_payments_${uid}_cart`)),[paymentId]);
});
