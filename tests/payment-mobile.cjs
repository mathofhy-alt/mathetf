// Real Next routes/UI; all auth, database and PortOne traffic is local and fake.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/matho/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '..');
const before = process.argv.includes('--before');
const out = process.env.PAYMENT_CAPTURE_DIR || 'C:/selfmade/결제수리/captures_root_review_round5';
fs.mkdirSync(out, { recursive: true });
const base = 'http://127.0.0.1:3132';
const uid = '11111111-1111-4111-8111-111111111111';
const itemId = '22222222-2222-4222-8222-222222222222';
const user = { id: uid, aud: 'authenticated', role: 'authenticated', email: 'payment-test@example.invalid', user_metadata: { phone: '01000000000', marketing_agreed: true }, app_metadata: {}, created_at: new Date().toISOString() };
const b64 = v => Buffer.from(JSON.stringify(v)).toString('base64url');
const token = `${b64({alg:'HS256',typ:'JWT'})}.${b64({sub:uid,role:'authenticated',aud:'authenticated',exp:Math.floor(Date.now()/1000)+3600})}.local-only`;
const auth = { access_token:token, refresh_token:'local-only', token_type:'bearer', expires_in:3600, expires_at:Math.floor(Date.now()/1000)+3600, user };
const item = { id:'33333333-3333-4333-8333-333333333333', user_id:uid, item_id:itemId, title:'모바일 결제 검증 자료', price:1000, item_type:'HWP_DOC' };
let cart = [item], balance = 31600, provider = 'READY', profileMissing = false, adminMode = false, legacyMode = false, workerReady = true, cutoverMode = false;
const orders = new Map(), providerStates = new Map(), cancellations = new Map(), calls = [], results = [];
const server = http.createServer(async (req,res) => {
    const url = new URL(req.url,'http://127.0.0.1:3133');
    const chunks=[]; for await (const c of req) chunks.push(c);
    const body=chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : null;
    calls.push({ method:req.method,path:url.pathname,body });
    res.setHeader('Access-Control-Allow-Origin',base);
    res.setHeader('Access-Control-Allow-Headers',req.headers['access-control-request-headers'] || '*');
    res.setHeader('Access-Control-Allow-Methods','GET,POST,DELETE,PATCH,HEAD,OPTIONS');
    const json=(v,status=200)=>{res.writeHead(status,{'Content-Type':'application/json','Content-Range':'0-0/1'});res.end(req.method==='HEAD'?'':JSON.stringify(v));};
    if(req.method==='OPTIONS')return json({});
    if(url.pathname==='/auth/v1/user')return json(adminMode?{...user,email:'mathofhy@naver.com'}:user);
    if(url.pathname==='/auth/v1/token')return json(auth);
    if(url.pathname.startsWith('/portone/payments/')){
        const id=url.pathname.split('/')[3],order=orders.get(id);
        if(url.pathname.endsWith('/cancel')){providerStates.set(id,'CANCELLED');return json({cancellation:{id:'cancel-'+id,status:'SUCCEEDED'}});}
        return json({id,status:providerStates.get(id)||provider,currency:'KRW',amount:{total:order?.amount},customer:{id:uid},customData:{orderId:id}});
    }
    const table=url.pathname.split('/').pop();
    if(table==='payment_checkout_ready')return json(!legacyMode && workerReady);
    if(table==='payment_transition')return json({direct_insert_retired:cutoverMode});
    if(legacyMode&&table==='payment_orders'&&url.searchParams.get('limit')==='0'&&['legacy_resolution','create_request_id'].includes(url.searchParams.get('select')))return json({code:'42703',message:'local old schema'},400);
    if(table==='record_payment_cancellation'){
        const order=orders.get(body.p_payment_id);
        if(!cancellations.has(order.payment_id)){
            const returned=order.status==='completed'?order.used_points:0;balance+=returned;
            cancellations.set(order.payment_id,{payment_id:order.payment_id,amount:order.amount,returned_points:returned,ledger_state:order.forceConflict?'conflict':'unfulfilled'});
        }
        order.status='cancelled';order.refund_status='succeeded';order.manual_review_required=!!order.forceConflict;return json(null);
    }
    if(table==='close_payment_review'){
        const order=orders.get(body.p_payment_id);order.manual_review_required=false;return json(null);
    }
    if(table==='record_payment_partial_cancellation'){
        const order=orders.get(body.p_payment_id);
        Object.assign(order,{provider_status:'PARTIAL_CANCELLED',manual_review_required:true,review_reason:'partial_cancelled'});
        return json(null);
    }
    if(table==='record_payment_review'){
        const order=orders.get(body.p_payment_id);
        Object.assign(order,{provider_status:body.p_provider_status,manual_review_required:true,review_reason:body.p_reason});
        return json(null);
    }
    if(table==='observe_legacy_payment'){
        const order=orders.get(body.p_payment_id);order.provider_status=body.p_provider_status;order.manual_review_required=body.p_provider_status==='PAID';
        return json(null);
    }
    if(table==='payment_order_ledger_state')return json(orders.get(body.p_payment_id).status==='completed'?'fulfilled':'unfulfilled');
    if(table==='zero_payment_review_state'){
        const order=orders.get(body.p_payment_id);
        return json({ledger:order.internalLedger,canFulfill:order.internalLedger==='fulfilled',canRefund:true,returnPoints:order.actualDebit||0});
    }
    if(table==='resolve_zero_payment'){
        const order=orders.get(body.p_payment_id);
        if(body.p_action==='refund'){balance+=order.actualDebit||0;order.status='cancelled';order.refund_status='succeeded';}
        else order.status='completed';
        order.manual_review_required=false;return json({success:true,refunded:body.p_action==='refund',status:order.status});
    }
    if(table==='resolve_legacy_payment'){
        const order=orders.get(body.p_payment_id);order.legacy_reconciliation=false;order.legacy_resolution=true;order.manual_review_required=false;
        if(body.p_action==='fulfill'){if(order.status!=='completed')balance-=order.used_points;order.status='completed';return json({status:'completed'});}
        if(order.status!=='completed')order.status='superseded';order.refund_status='pending';order.supersede_reason='operator_refund';return json({status:'refund_pending'});
    }
    if(table==='create_payment_order'){
        const pending=[...orders.values()].filter(o=>o.status==='pending' && body.p_previous_payment_ids.includes(o.payment_id));
        const completed=[...orders.values()].find(o=>body.p_previous_payment_ids.includes(o.payment_id)&&o.status==='completed');
        if(completed)return json({recoverPaymentId:completed.payment_id});
        if(!body.p_replace_open && pending.some(o=>o.amount>0))return json({recoverPaymentId:pending[0].payment_id,choiceRequired:true});
        for(const o of pending){o.status='superseded';o.superseded_by=body.p_payment_id;o.refund_status=o.amount>0?'pending':null;}
        orders.set(body.p_payment_id,{...body.p_quote,payment_id:body.p_payment_id,user_id:uid,create_request_id:body.p_request_id,legacy_reconciliation:false,status:'pending',created_at:new Date().toISOString()});
        return json({paymentId:body.p_payment_id});
    }
    if(table==='supersede_payment_order'){
        const order=orders.get(body.p_payment_id);
        if(order.status==='completed')return json({alreadyProcessed:true});
        order.status='superseded';return json({superseded:true});
    }
    if(table==='record_payment_refund'){
        const order=orders.get(body.p_payment_id);order.refund_status=body.p_outcome;return json(null);
    }
    if(table==='defer_payment_reconciliation')return json(null);
    if(table==='complete_payment_order_v2'||table==='complete_payment_order'){
        const order=orders.get(body.p_payment_id);
        if(!order)return json({message:'Order missing'},400);
        const alreadyProcessed=order.status==='completed';
        if(order.status==='superseded')return json({superseded:true});
        if(balance<order.used_points){order.status='superseded';order.refund_status='pending';return json({superseded:true,refundRequired:order.amount>0});}
        if(!alreadyProcessed){balance-=order.used_points;order.status='completed';}
        return json({status:'completed',alreadyProcessed});
    }
    if(table==='payment_orders'&&req.method==='POST'){
        orders.set(body.payment_id,{...body,status:'pending',manual_review_required:false,legacy_reconciliation:false,created_at:new Date().toISOString()});return json(null,201);
    }
    let rows=[];
    if(table==='profiles'&&!profileMissing)rows=[{id:uid,earned_points:balance,persona:'student',purchased_points:0}];
    if(table==='cart_items')rows=[...cart];
    if(table==='exam_materials')rows=cart.map(entry=>({id:entry.item_id,title:entry.title,price:1000,file_type:'HWP'}));
    if(table==='payment_orders')rows=[...orders.values()];
    if(table==='payment_cancellations')rows=[...cancellations.values()];
    if(table==='payment_orders'&&url.searchParams.get('or')==='(manual_review_required.eq.true,and(legacy_reconciliation.eq.true,status.eq.pending))')rows=rows.filter(o=>o.manual_review_required||(o.legacy_reconciliation&&o.status==='pending'));
    if(table==='payment_orders'&&url.searchParams.get('or')==='(and(legacy_reconciliation.eq.true,status.in.(pending,closed)),manual_review_required.eq.true,refund_status.eq.pending,review_reason.eq.bundle_entitlement_review)')rows=rows.filter(o=>(o.legacy_reconciliation&&['pending','closed'].includes(o.status))||o.manual_review_required||o.refund_status==='pending'||o.review_reason==='bundle_entitlement_review');
    for(const [key,value] of url.searchParams){
        if(value.startsWith('eq.'))rows=rows.filter(r=>String(r[key])===value.slice(3));
        if(value.startsWith('in.'))rows=rows.filter(r=>value.slice(3).includes(String(r[key])));
    }
    const ordering=url.searchParams.get('order');
    if(ordering)rows.sort((a,b)=>{for(const part of ordering.split(',')){const [key,dir]=part.split('.');const n=String(a[key]).localeCompare(String(b[key]));if(n)return dir==='desc'?-n:n;}return 0;});
    if(url.searchParams.has('limit'))rows=rows.slice(0,Number(url.searchParams.get('limit')));
    if(table==='cart_items'&&req.method==='DELETE'){cart=cart.filter(r=>!rows.includes(r));return json(null);}
    if(table==='payment_orders'&&req.method==='DELETE'){for(const r of rows)orders.delete(r.payment_id);return json(null);}
    return json(req.headers.accept?.includes('application/vnd.pgrst.object+json')?rows[0]||null:rows);
});
let next,browser;
const log=fs.createWriteStream(path.join(out,`${before?'before':'after'}-server.log`));
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function assertEventually(fn){let last;for(let i=0;i<100;i++){try{return await fn();}catch(e){last=e;await pause(100);}}throw last;}
(async()=>{
    await new Promise(r=>server.listen(3133,'127.0.0.1',r));
    next=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','-p','3132'],{cwd:root,windowsHide:true,env:{...process.env,
        NODE_OPTIONS:`--require=${path.join(__dirname,'payment-local-preload.cjs')}`,
        NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:3133',NEXT_PUBLIC_SUPABASE_ANON_KEY:'local-only',SUPABASE_SERVICE_ROLE_KEY:'local-only',
        PORTONE_API_SECRET:'local-only',NEXT_PUBLIC_LOCAL_PREVIEW:'1',NEXT_TELEMETRY_DISABLED:'1'},stdio:['ignore','pipe','pipe']});
    next.stdout.pipe(log);next.stderr.pipe(log);
    let ready=false;
    for(let i=0;i<180;i++){try{const r=await fetch(base+'/cart');if(r.ok){ready=true;break;}}catch{}if(next.exitCode!==null)throw Error('Next exited');await pause(500);}
    assert(ready,'local Next server ready');
    browser=await chromium.launch({headless:true});
    const safari='Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
    for(const [label,ua] of [['ios-safari',safari],['naver-inapp',safari+' NAVER(inapp; search; 2000; 12.9.0; 18)']]){
        cart=[item];balance=31600;orders.clear();providerStates.clear();calls.length=0;provider='READY';
        const context=await browser.newContext({viewport:{width:390,height:844},userAgent:ua,isMobile:true,hasTouch:true});
        await context.route('**/*',r=>['127.0.0.1','localhost'].includes(new URL(r.request().url()).hostname)?r.continue():r.abort());
        await context.addCookies([{name:'sb-127-auth-token',value:'base64-'+b64(auth),domain:'127.0.0.1',path:'/'}]);
        await context.addInitScript(()=>{
            localStorage.setItem('mathetf_notify_dismissed','1');localStorage.setItem('mathetf_teacher_cta_dismissed','1');
            window.__sdkCalls=0;
            window.PortOne={requestPayment:async options=>{
                window.__sdkCalls++;sessionStorage.setItem('sdkCalls',String(Number(sessionStorage.getItem('sdkCalls')||0)+1));window.__sdkOptions=options;
                if(window.__paymentWindow)window.location.href='/fixture-payment';
                if(window.__redirectSDK)window.location.href=options.redirectUrl+'?paymentId='+options.paymentId+(window.__cancelCode?'&code=USER_CANCELLED':'');
                return new Promise(()=>{});
            }};
        });
        const page=await context.newPage();
        const orderRequests=[];
        page.on('request',r=>{if(r.url()===base+'/api/payments/orders')orderRequests.push(r.postDataJSON());});
        page.on('dialog',d=>d.dismiss());
        let release;
        const gate=new Promise(r=>release=r);
        await page.route('**/rest/v1/profiles?*',async route=>{if(new URL(route.request().url()).searchParams.get('select')==='earned_points')await gate;await route.continue();});
        await page.goto(base+'/cart',{waitUntil:'domcontentloaded',timeout:90000});
        const all=page.locator('.rd-cart-points-all');
        await all.waitFor({timeout:45000});await all.scrollIntoViewIfNeeded();
        const loadingDisabled=await all.isDisabled();
        await page.screenshot({path:path.join(out,`${before?'before':'after'}-${label}-loading.png`)});
        if(before){
            assert.equal(loadingDisabled,false);await all.click();release();
            await page.getByText('보유: 31,600P',{exact:true}).waitFor();
            assert.equal(await page.locator('#rd-cart-points-input').inputValue(),'0');
            await page.locator('.rd-cart-pay').click();await page.waitForFunction(()=>window.__sdkCalls===1);
            const created=[...orders.values()].at(-1);assert.equal(created.used_points,0);assert.equal(created.amount,1000);
            await page.reload();await page.locator('.rd-cart-pay').waitFor();await page.locator('.rd-cart-pay').click();
            await page.waitForResponse(r=>r.url().includes('/api/payments/complete'));
            await page.screenshot({path:path.join(out,`before-${label}-blocked.png`)});
            results.push({label,loadingDisabled,usedPoints:created.used_points,amount:created.amount,pendingPreserved:await page.evaluate(()=>Object.keys(localStorage).some(k=>k.startsWith('mathetf_pending_payment_')))});
        }else{
            assert.equal(loadingDisabled,true);release();
            await page.getByText('보유: 31,600P',{exact:true}).waitFor();await all.click();
            assert.equal(await page.locator('#rd-cart-points-input').inputValue(),'1000');
            assert.match(await page.locator('.rd-cart-rows').innerText(),/포인트 할인/);
            assert.equal(await page.locator('.rd-cart-total b').innerText(),'0원');
            const geometry=await all.evaluate(el=>{const r=el.getBoundingClientRect();return {width:innerWidth,hit:el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)),scrollWidth:document.documentElement.scrollWidth};});
            assert.equal(geometry.width,390);assert.equal(geometry.hit,true);assert(geometry.scrollWidth<=390);
            const layout=await page.locator('.rd-cart-paybar').evaluate(el=>({position:getComputedStyle(el).position,width:el.getBoundingClientRect().width,parent:document.querySelector('.rd-cart-sum').getBoundingClientRect().width}));
            assert.equal(layout.position,'static');assert(layout.width>=layout.parent);
            await page.screenshot({path:path.join(out,`after-${label}-points.png`)});
            await page.getByRole('button',{name:'포인트로 결제',exact:true}).click();
            await page.waitForURL('**/mypage',{timeout:60000});
            await page.locator('.rd-my-h1').waitFor({timeout:30000});
            const created=[...orders.values()].at(-1);assert.equal(created.used_points,1000);assert.equal(created.amount,0);assert.equal(created.status,'completed');assert.equal(cart.length,0);assert.equal(balance,30600);
            assert.equal(await page.evaluate(()=>Number(sessionStorage.getItem('sdkCalls')||0)),0);
            assert.equal(orderRequests.at(-1).usedPoints,1000);
            await page.screenshot({path:path.join(out,`after-${label}-completed.png`)});
            results.push({label,loadingDisabled,geometry,usedPoints:created.used_points,amount:created.amount,status:created.status,cartCount:cart.length,balance,sdkCalls:0});
            const seed=async(status='READY')=>{
                cart=[item];balance=31600;orders.clear();providerStates.clear();provider=status;
                const oldId='order-'+'c'.repeat(32);
                orders.set(oldId,{payment_id:oldId,user_id:uid,kind:'cart',amount:1000,total:1000,used_points:0,points:0,items:[{item_id:itemId,title:item.title,price:1000}],name:item.title,legacy_reconciliation:false,status:'pending',created_at:new Date().toISOString()});
                await page.evaluate(({uid,oldId})=>localStorage.setItem(`mathetf_pending_payment_${uid}_cart`,oldId),{uid,oldId});
                await page.goto(base+'/cart');await page.getByText('보유: 31,600P',{exact:true}).waitFor();
                return oldId;
            };
            const oldId=await seed();await page.locator('.rd-cart-points-all').click();
            await page.getByRole('button',{name:'포인트로 결제',exact:true}).click();
            await page.getByRole('dialog',{name:'이전 결제 확인'}).waitFor();
            await page.screenshot({path:path.join(out,`after-${label}-retry-choice.png`)});
            await page.getByRole('button',{name:'결제를 끝냈어요 · 잠시 뒤 확인',exact:true}).click();
            await assertEventually(async()=>assert.equal(await page.locator('.rd-cart-pay').isDisabled(),false));assert.equal(orders.size,1);assert.equal(orders.get(oldId).status,'pending');
            await page.getByRole('button',{name:'포인트로 결제',exact:true}).click();
            await page.getByRole('button',{name:'결제하지 않았어요 · 새로 결제하기',exact:true}).click();await page.waitForURL('**/mypage');
            assert.equal(orders.size,2);assert.equal([...orders.values()].filter(o=>o.status==='completed').length,1);assert.equal(orders.get(oldId).status,'superseded');assert.equal(balance,30600);assert.equal(cart.length,0);
            assert.equal(await page.evaluate(()=>Number(sessionStorage.getItem('sdkCalls')||0)),0);
            results.push({label,scenario:'READY wrong-point order recovered',newAmount:0,sdkCalls:0});
            providerStates.set(oldId,'PAID');
            await page.goto(base+`/payments/return?paymentId=${oldId}`);
            await page.getByText('상품을 지급하지 않고 카드 결제를 전액 취소했습니다.',{exact:false}).waitFor();
            assert.equal(providerStates.get(oldId),'CANCELLED');assert.equal(orders.get(oldId).refund_status,'succeeded');assert.equal([...orders.values()].filter(o=>o.status==='completed').length,1);
            await page.screenshot({path:path.join(out,`after-${label}-late-refund.png`)});
            results.push({label,scenario:'late PAID return automatically refunded',refundStatus:'succeeded',fulfilled:1});
            await seed('PENDING');await page.locator('.rd-cart-pay').click();
            await page.waitForResponse(r=>r.url().includes('/api/payments/complete'));
            assert.equal(orders.size,1);
            await page.getByRole('link',{name:'다시 확인 · 미결제 주문 정리'}).click();
            const check=page.getByRole('button',{name:'결제 결과 다시 확인',exact:true});await check.waitFor();await assertEventually(async()=>assert.equal(await check.isDisabled(),false));
            await page.screenshot({path:path.join(out,`after-${label}-pending.png`)});
            provider='PAID';await check.click();await page.waitForURL('**/mypage');assert.equal(orders.size,1);assert.equal(cart.length,0);
            results.push({label,scenario:'PENDING then PAID',orders:1,cartCount:0});
            cart=[item];balance=31600;orders.clear();providerStates.clear();provider='PAID';
            await page.goto(base+'/cart');await page.getByText('보유: 31,600P',{exact:true}).waitFor();
            await page.evaluate(()=>{window.__redirectSDK=true;window.__cancelCode=true;});
            await page.locator('.rd-cart-pay').click();await page.waitForURL('**/mypage');
            assert.equal(orders.size,1);assert.equal([...orders.values()][0].status,'completed');assert.equal(cart.length,0);
            assert.equal(await page.evaluate(()=>Number(sessionStorage.getItem('sdkCalls'))),1);
            results.push({label,scenario:'mobile redirect with cancel code but PAID',completed:true,cartCount:0});
            const cancelled=await seed('READY');
            await page.goto(base+`/payments/return?paymentId=${cancelled}&code=USER_CANCELLED`);
            await page.getByRole('link',{name:'결제창을 닫았어요 · 장바구니에서 새로 결제',exact:true}).waitFor();
            assert.equal(await page.evaluate(({uid})=>localStorage.getItem(`mathetf_pending_payment_${uid}_cart`),{uid}),cancelled);
            await page.screenshot({path:path.join(out,`after-${label}-cancelled.png`)});
            results.push({label,scenario:'READY return keeps recovery until server replacement',pendingPointer:cancelled,cartCount:cart.length});
            await page.goBack();await page.locator('.rd-cart-points-all').waitFor();
            await page.getByText('보유: 31,600P',{exact:true}).waitFor();await page.locator('.rd-cart-points-all').click();
            await page.getByRole('button',{name:'포인트로 결제',exact:true}).click();await page.getByRole('button',{name:'결제하지 않았어요 · 새로 결제하기',exact:true}).click();await page.waitForURL('**/mypage');assert.equal(cart.length,0);
            results.push({label,scenario:'back navigation then point checkout',completed:true});
            const zero=await seed('PAID');Object.assign(orders.get(zero),{amount:0,used_points:1000});
            await page.evaluate(()=>{window.__redirectSDK=true;});
            await page.locator('.rd-cart-pay').click();await page.waitForURL('**/mypage');
            assert.equal(orders.get(zero).status,'superseded');assert.equal(balance,31600);assert.equal([...orders.values()].filter(o=>o.status==='completed').length,1);
            await page.goto(base+`/payments/return?paymentId=${zero}`);
            await page.getByText('대체된 주문입니다.',{exact:false}).waitFor();assert.equal(balance,31600);
            results.push({label,scenario:'zero-won selection replaced; delayed return cannot spend points',balance,fulfilled:1});
            const insufficient=await seed('PAID');Object.assign(orders.get(insufficient),{total:2000,used_points:1000});balance=0;
            await page.goto(base+`/payments/return?paymentId=${insufficient}`);
            await page.getByText('상품을 지급하지 않고 카드 결제를 전액 취소했습니다.',{exact:false}).waitFor();
            assert.equal(providerStates.get(insufficient),'CANCELLED');assert.equal(orders.get(insufficient).refund_status,'succeeded');assert.equal([...orders.values()].filter(o=>o.status==='completed').length,0);assert.equal(balance,0);
            await page.screenshot({path:path.join(out,`after-${label}-insufficient-refund.png`)});
            results.push({label,scenario:'approved card but insufficient points: refunded without grant',refundStatus:'succeeded',fulfilled:0});
            // Exact reported flow: a real 1,000-won order opens the mock card
            // page, browser Back returns, then full points replace it at once.
            cart=[item];balance=31600;orders.clear();providerStates.clear();provider='READY';
            await page.evaluate(()=>{for(const k of Object.keys(localStorage))if(k.startsWith('mathetf_pending_payment_'))localStorage.removeItem(k);sessionStorage.setItem('sdkCalls','0');});
            await page.route('**/fixture-payment',route=>route.fulfill({contentType:'text/html',body:'<html lang="ko"><title>카드 결제</title><body><h1>카드 결제 1,000원</h1></body></html>'}));
            await page.goto(base+'/cart');await page.getByText('보유: 31,600P',{exact:true}).waitFor();
            await page.evaluate(()=>{window.__paymentWindow=true;});await page.locator('.rd-cart-pay').click();await page.waitForURL('**/fixture-payment');
            const cardId=[...orders.keys()][0];assert.equal(orders.get(cardId).amount,1000);
            await page.goBack();await page.getByText('보유: 31,600P',{exact:true}).waitFor();
            await page.locator('.rd-cart-points-all').click();assert.equal(await page.locator('#rd-cart-points-input').inputValue(),'1000');
            await page.screenshot({path:path.join(out,`after-${label}-representative-back-points.png`)});
            await page.getByRole('button',{name:'포인트로 결제',exact:true}).click();
            await page.getByRole('button',{name:'결제하지 않았어요 · 새로 결제하기',exact:true}).click();await page.waitForURL('**/mypage');
            assert.equal(orders.get(cardId).status,'superseded');assert.equal([...orders.values()].filter(o=>o.status==='completed').length,1);assert.equal(balance,30600);assert.equal(cart.length,0);
            assert.equal(await page.evaluate(()=>Number(sessionStorage.getItem('sdkCalls'))),1);
            results.push({label,scenario:'actual card 1000 -> browser Back -> full points -> explicit replacement',completed:true,balance,sdkCalls:1});
            cart=[item];balance=0;orders.clear();providerStates.clear();profileMissing=true;
            await page.goto(base+'/cart');await page.getByText('보유: 0P',{exact:true}).waitFor();assert.equal(await page.locator('.rd-cart-pay').isDisabled(),false);
            assert.equal(await page.locator('.rd-cart-points-all').isDisabled(),false);assert.equal(await page.locator('.rd-cart-total b').innerText(),'1,000원');
            await page.screenshot({path:path.join(out,`after-${label}-missing-profile-zero.png`)});profileMissing=false;
            results.push({label,scenario:'missing profile is zero points',checkoutEnabled:true});
            const reviewId=await seed('PAID');orders.get(reviewId).legacy_reconciliation=true;
            await page.goto(base+`/payments/return?paymentId=${reviewId}`);
            await page.getByText('이전 결제를 운영자 확인 대상으로 기록했습니다.',{exact:false}).waitFor();
            assert.equal(await page.evaluate(({uid})=>localStorage.getItem(`mathetf_pending_payment_${uid}_cart`),{uid}),null);
            assert.deepEqual(await page.evaluate(({uid})=>JSON.parse(localStorage.getItem(`mathetf_review_payments_${uid}_cart`)),{uid}),[reviewId]);
            await page.screenshot({path:path.join(out,`after-${label}-legacy-review.png`)});
            cart=[{...item,item_id:'44444444-4444-4444-8444-444444444444',title:'별도 구매 자료'}];
            await page.goto(base+'/cart');await page.getByText('보유: 31,600P',{exact:true}).waitFor();
            await page.locator('.rd-cart-points-all').click();await page.getByRole('button',{name:'포인트로 결제',exact:true}).click();await page.waitForURL('**/mypage');
            assert.equal(orders.get(reviewId).status,'pending');assert.equal([...orders.values()].filter(o=>o.status==='completed').length,1);
            results.push({label,scenario:'legacy review retains separate reference and permits unrelated purchase',legacyStatus:'pending',otherCompleted:true});
            adminMode=true;await page.goto(base+'/admin/payment-reviews');
            await page.getByRole('heading',{name:'결제 검토함',exact:true}).waitFor();
            await page.getByRole('listitem').filter({hasText:item.title}).getByRole('button',{name:'승인·원장 확인',exact:true}).click();
            await page.getByText('원장 대조: 미지급 확인',{exact:true}).waitFor();
            await page.getByRole('textbox',{name:'확인 근거',exact:true}).fill('승인 금액과 회원 원장을 확인함');
            assert((await page.evaluate(()=>document.documentElement.scrollWidth))<=390);
            await page.screenshot({path:path.join(out,`after-${label}-admin-review.png`),fullPage:true});
            await page.getByRole('button',{name:'확인한 주문 지급 확정',exact:true}).click();
            await page.getByText('상품 지급을 확정했습니다.',{exact:true}).waitFor();assert.equal(orders.get(reviewId).status,'completed');
            adminMode=false;results.push({label,scenario:'site review inbox inspects legacy approval and confirms delivery',legacyStatus:'completed'});
            const cancelledPending=await seed('CANCELLED');
            await page.goto(base+`/payments/return?paymentId=${cancelledPending}`);
            await page.getByText('상품을 지급하지 않고 카드 결제를 전액 취소했습니다.',{exact:false}).waitFor();
            assert.equal(orders.get(cancelledPending).status,'cancelled');assert.equal(balance,31600);
            results.push({label,scenario:'pending full cancellation persists without delivery or point debit',status:'cancelled',balance});
            const conflictId=await seed('CANCELLED');cancellations.delete(conflictId);
            Object.assign(orders.get(conflictId),{status:'completed',used_points:500,forceConflict:true});balance=31100;
            await page.goto(base+`/payments/return?paymentId=${conflictId}`);
            await page.getByText('상품을 지급하지 않고 카드 결제를 전액 취소했습니다.',{exact:false}).waitFor();
            assert.equal(balance,31600);assert.equal(orders.get(conflictId).manual_review_required,true);
            adminMode=true;await page.goto(base+'/admin/payment-reviews');
            await page.getByRole('button',{name:'승인·원장 확인',exact:true}).click();
            await page.getByText('전액 취소 확정: 1,000원 · 포인트 반환: 500P',{exact:true}).waitFor();
            const closeReview=page.getByRole('button',{name:'취소·포인트 반환 확인 후 검토 종결',exact:true});
            assert.equal(await closeReview.isDisabled(),true);
            await page.getByRole('textbox',{name:'확인 근거',exact:true}).fill('카드 전액 취소와 사용 포인트 500P 반환 확인');
            assert.equal(await closeReview.isDisabled(),false);assert((await page.evaluate(()=>document.documentElement.scrollWidth))<=390);
            await page.screenshot({path:path.join(out,`after-${label}-close-review.png`),fullPage:true});
            await closeReview.click();await page.getByText('검토를 종결했습니다. 해당 상품을 다시 구매할 수 있습니다.',{exact:true}).waitFor();
            assert.equal(orders.get(conflictId).manual_review_required,false);assert.equal(balance,31600);
            adminMode=false;results.push({label,scenario:'modern cancelled ledger conflict can be closed after evidence',reviewClosed:true,balance});
            const partialId=await seed('PARTIAL_CANCELLED');cancellations.delete(partialId);
            Object.assign(orders.get(partialId),{status:'completed',used_points:500,total:1500});balance=31100;
            await page.goto(base+`/payments/return?paymentId=${partialId}`);
            await page.getByText('이전 결제를 운영자 확인 대상으로 기록했습니다.',{exact:false}).waitFor();
            assert.equal(orders.get(partialId).manual_review_required,true);assert.equal(balance,31100);
            adminMode=true;await page.goto(base+'/admin/payment-reviews');
            await page.getByRole('button',{name:'승인·원장 확인',exact:true}).click();
            await page.getByText('부분 취소 검토:',{exact:false}).waitFor();
            const partialRefund=page.getByRole('button',{name:'확인한 주문 카드 전액 취소',exact:true});
            assert.equal(await partialRefund.isDisabled(),true);
            await page.getByRole('textbox',{name:'확인 근거',exact:true}).fill('부분 취소 내역과 상품 지급 및 사용 포인트를 확인함');
            assert.equal(await partialRefund.isDisabled(),false);
            assert.equal(await page.getByRole('button',{name:'확인한 주문 지급 확정',exact:true}).isDisabled(),true);
            assert((await page.evaluate(()=>document.documentElement.scrollWidth))<=390);
            await page.screenshot({path:path.join(out,`after-${label}-partial-review.png`),fullPage:true});
            await partialRefund.click();await page.getByText('전액 취소와 포인트 반환을 확정했습니다.',{exact:true}).waitFor();
            assert.equal(orders.get(partialId).status,'cancelled');assert.equal(balance,31600);
            adminMode=false;results.push({label,scenario:'modern partial cancellation is reviewed and fully cancelled with point return',reviewClosed:true,balance});
            const pendingPartialId=await seed('PARTIAL_CANCELLED');cancellations.delete(pendingPartialId);
            Object.assign(orders.get(pendingPartialId),{used_points:500,total:1500});
            await page.goto(base+`/payments/return?paymentId=${pendingPartialId}`);
            await page.getByText('이전 결제를 운영자 확인 대상으로 기록했습니다.',{exact:false}).waitFor();
            assert.equal(orders.get(pendingPartialId).status,'pending');assert.equal(orders.get(pendingPartialId).manual_review_required,true);assert.equal(balance,31600);
            assert.equal(await page.evaluate(({uid})=>localStorage.getItem(`mathetf_pending_payment_${uid}_cart`),{uid}),null);
            cart=[{...item,item_id:'44444444-4444-4444-8444-444444444444',title:'부분 취소와 무관한 자료'}];
            await page.goto(base+'/cart');await page.getByText('보유: 31,600P',{exact:true}).waitFor();
            await page.locator('.rd-cart-points-all').click();await page.getByRole('button',{name:'포인트로 결제',exact:true}).click();await page.waitForURL('**/mypage');
            assert.equal(orders.get(pendingPartialId).status,'pending');assert.equal(balance,30600);
            adminMode=true;await page.goto(base+'/admin/payment-reviews');
            await page.getByRole('listitem').filter({hasText:item.title}).getByRole('button',{name:'승인·원장 확인',exact:true}).click();
            await page.getByText('원장 대조: 미지급 확인',{exact:true}).waitFor();
            const pendingRefund=page.getByRole('button',{name:'확인한 주문 카드 전액 취소',exact:true});
            assert.equal(await pendingRefund.isDisabled(),true);
            await page.getByRole('textbox',{name:'확인 근거',exact:true}).fill('지급 전 부분 취소로 상품과 포인트 차감 없음 확인');
            assert.equal(await pendingRefund.isDisabled(),false);
            assert.equal(await page.getByRole('button',{name:'확인한 주문 지급 확정',exact:true}).isDisabled(),true);
            assert((await page.evaluate(()=>document.documentElement.scrollWidth))<=390);
            await page.screenshot({path:path.join(out,`after-${label}-pending-partial-review.png`),fullPage:true});
            await pendingRefund.click();await page.getByText('전액 취소와 포인트 반환을 확정했습니다.',{exact:true}).waitFor();
            assert.equal(orders.get(pendingPartialId).status,'cancelled');assert.equal(cancellations.get(pendingPartialId).returned_points,0);assert.equal(balance,30600);
            adminMode=false;results.push({label,scenario:'pending partial review permits unrelated purchase and audited remaining cancellation without delivery or point credit',reviewClosed:true,balance});
            for(const action of ['refund','fulfill']){
                const zeroId=await seed('READY');
                Object.assign(orders.get(zeroId),{amount:0,total:1000,used_points:1000,status:'pending',manual_review_required:true,review_reason:'ledger_conflict',internalLedger:action==='fulfill'?'fulfilled':'conflict',actualDebit:1000});
                adminMode=true;const priorLookups=calls.filter(c=>c.path.startsWith('/portone/')).length;
                await page.goto(base+'/admin/payment-reviews');
                await page.getByRole('listitem').filter({hasText:item.title}).getByRole('button',{name:'승인·원장 확인',exact:true}).click();
                await page.getByText('전액 포인트 주문: 내부 원장으로 확인합니다.',{exact:false}).waitFor();
                const button=page.getByRole('button',{name:action==='refund'?'확인한 포인트 주문 취소·차감 반환':'확인한 주문 지급 확정',exact:true});
                assert.equal(await button.isDisabled(),true);
                await page.getByRole('textbox',{name:'확인 근거',exact:true}).fill('실제 포인트 차감과 내부 상품 지급 원장을 확인함');
                assert.equal(await button.isDisabled(),false);assert((await page.evaluate(()=>document.documentElement.scrollWidth))<=390);
                await page.screenshot({path:path.join(out,`after-${label}-zero-${action}.png`),fullPage:true});
                const previousBalance=balance;await button.click();
                await page.getByText(action==='refund'?'전액 취소와 포인트 반환을 확정했습니다.':'상품 지급을 확정했습니다.',{exact:true}).waitFor();
                assert.equal(orders.get(zeroId).manual_review_required,false);assert.equal(balance,previousBalance+(action==='refund'?1000:0));
                assert.equal(calls.filter(c=>c.path.startsWith('/portone/')).length,priorLookups);
                adminMode=false;results.push({label,scenario:`zero-card internal admin ${action} without provider lookup`,balance});
            }
        }
        if(!before){
            legacyMode=true;await pause(5200);
            for(const status of ['READY','FAILED']){
                const resumedId=await seedLegacy(status);
                await page.locator('.rd-cart-points-all').click();
                await page.getByRole('button',{name:'포인트로 결제',exact:true}).click();
                const dialog=page.getByRole('dialog',{name:'이전 결제 확인'});await dialog.waitFor();
                assert.match(await dialog.innerText(),/카드 1,000원 · 포인트 0P/);
                assert.equal(orders.size,1);assert.equal(balance,31600);
                await page.getByRole('button',{name:'돌아가기',exact:true}).click();
                await assertEventually(async()=>assert.equal(await page.locator('.rd-cart-pay').isDisabled(),false));
                await page.getByRole('button',{name:'포인트로 결제',exact:true}).click();await dialog.waitFor();
                assert((await page.evaluate(()=>document.documentElement.scrollWidth))<=390);
                await page.screenshot({path:path.join(out,`after-${label}-legacy-${status.toLowerCase()}-resume.png`),fullPage:true});
                provider='PAID';
                await page.evaluate(()=>{window.PortOne.requestPayment=async options=>{window.__sdkOptions=options;sessionStorage.setItem('legacySdkOptions',JSON.stringify(options));return {};};});
                await page.getByRole('button',{name:'위 상품·금액으로 이전 주문 결제',exact:true}).click();await page.waitForURL('**/mypage');
                const sdk=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('legacySdkOptions')));
                assert.equal(sdk.paymentId,resumedId);assert.equal(sdk.totalAmount,1000);
                assert.equal(orders.size,1);assert.equal(orders.get(resumedId).status,'completed');assert.equal(balance,31600);
                results.push({label,scenario:`legacy ${status}: card resumes original ID after explicit consent`,paymentId:resumedId,orders:1,balance});
            }
            const zeroId=await seedLegacy('READY');Object.assign(orders.get(zeroId),{amount:0,used_points:1000});
            await page.locator('.rd-cart-pay').click();
            const dialog=page.getByRole('dialog',{name:'이전 결제 확인'});await dialog.waitFor();
            assert.match(await dialog.innerText(),/카드 0원 · 포인트 1,000P/);assert.equal(balance,31600);assert.equal(orders.get(zeroId).status,'pending');
            await page.screenshot({path:path.join(out,`after-${label}-legacy-zero-resume.png`),fullPage:true});
            await page.getByRole('button',{name:'돌아가기',exact:true}).click();
            await assertEventually(async()=>assert.equal(await page.locator('.rd-cart-pay').isDisabled(),false));
            assert.equal(balance,31600);await page.locator('.rd-cart-pay').click();await dialog.waitFor();
            await page.getByRole('button',{name:'위 상품·금액으로 이전 주문 결제',exact:true}).click();await page.waitForURL('**/mypage');
            assert.equal(orders.size,1);assert.equal(balance,30600);assert.equal(orders.get(zeroId).status,'completed');
            results.push({label,scenario:'legacy zero: changed points require explicit consent before debit',orders:1,balance});
            legacyMode=false;await pause(5200);
            // Preparation/inverse fallback must not rediscover a separated review.
            workerReady=false;cutoverMode=false;
            const isolated=await seedLegacy('PAID');Object.assign(orders.get(isolated),{legacy_reconciliation:true,manual_review_required:true});
            cart=[{...item,item_id:'44444444-4444-4444-8444-444444444444',title:'검토와 무관한 구매'}];
            await page.goto(base+'/cart');await page.getByText('보유: 31,600P',{exact:true}).waitFor();
            await page.locator('.rd-cart-points-all').click();await page.getByRole('button',{name:'포인트로 결제',exact:true}).click();await page.waitForURL('**/mypage');
            assert.equal(orders.size,2);assert.equal(orders.get(isolated).status,'pending');assert.equal(orders.get(isolated).manual_review_required,true);assert.equal(balance,30600);
            results.push({label,scenario:'round11 worker unready legacy releases unrelated reviewed checkout',orders:2,balance});
            // After cutover, zero-card checkout must not ask worker readiness.
            cutoverMode=true;await seedLegacy('READY');orders.clear();
            await page.locator('.rd-cart-points-all').click();
            const callStart=calls.length;await page.getByRole('button',{name:'포인트로 결제',exact:true}).click();await page.waitForURL('**/mypage');
            assert.equal(orders.size,1);assert.equal([...orders.values()][0].status,'completed');assert.equal(balance,30600);
            assert.equal(calls.slice(callStart).some(c=>c.path.includes('/portone/')||c.path.endsWith('/payment_checkout_ready')),false);
            results.push({label,scenario:'round11 cutover worker outage still permits full-point checkout',orders:1,balance});
            cutoverMode=false;workerReady=true;
        }
        async function seedLegacy(status){
            cart=[item];balance=31600;orders.clear();providerStates.clear();provider=status;
            const id='order-'+'d'.repeat(32);
            orders.set(id,{payment_id:id,user_id:uid,kind:'cart',amount:1000,total:1000,used_points:0,points:0,items:[{item_id:itemId,title:item.title,price:1000}],name:item.title,status:'pending',created_at:new Date().toISOString()});
            await page.evaluate(({uid})=>{for(const k of Object.keys(localStorage))if(k.startsWith(`mathetf_pending_payment_${uid}_`))localStorage.removeItem(k);},{uid});
            await page.goto(base+'/cart');await page.getByText('보유: 31,600P',{exact:true}).waitFor();return id;
        }
        await context.close();console.log(JSON.stringify(results.at(-1)));
    }
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{
    fs.writeFileSync(path.join(out,`${before?'before':'after'}-results.json`),JSON.stringify({results,calls},null,2));
    await browser?.close();
    if(next?.pid)spawnSync('taskkill',['/pid',String(next.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});
    server.close();log.end();
});
