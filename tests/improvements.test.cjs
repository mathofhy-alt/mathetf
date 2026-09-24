require('./register.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
const {PGlite}=require('@electric-sql/pglite');
const {resolveScope,toScopeRule}=require('../src/lib/questions/scope.ts');
const {readAllPages}=require('../src/lib/questions/catalog.ts');
const {safeReturnPath}=require('../src/lib/auth-return.ts');
const {parseDraft}=require('../src/lib/questions/draft.ts');
const {cartQuote,verifyPaidPayment}=require('../src/lib/payments/order.ts');
const {payOrder}=require('../src/lib/payments/client.ts');
const {validateHml,validateQuestionXml,examFilename}=require('../src/lib/hml-v2/validate.ts');
const {generateHmlFromTemplate}=require('../src/lib/hml-v2/generator.ts');
const fixture=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(__dirname,'fixtures/question-scope.json.gz'))));
const audit=require('./fixtures/source-link-audit.json');
const uid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const migrations=['202609200001_question_scope.sql','202609200002_payment_orders.sql','202609200003_question_bank_events.sql','202609200004_growth_metrics.sql','20260926_retire_seller_settlements.sql'];
async function database(){
 const db=new PGlite();
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
 CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY); CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
 CREATE TABLE profiles(id uuid PRIMARY KEY,purchased_points bigint DEFAULT 0,earned_points bigint DEFAULT 0);
 CREATE TABLE exam_materials(id uuid PRIMARY KEY,title text,school text);
 CREATE TABLE questions(id uuid PRIMARY KEY,source_db_id text,school text,grade text,year text,semester text,subject text,work_status text,question_number integer,difficulty text,unit text,is_off_curriculum boolean,key_concepts text[],question_type text);
 CREATE TABLE payment_history(id uuid DEFAULT gen_random_uuid(),user_id uuid,payment_id text,merchant_uid text,amount bigint,points_added bigint,status text);
 CREATE TABLE purchased_items(id uuid DEFAULT gen_random_uuid(),user_id uuid,payment_id text,item_type text,item_id text,title text,price_paid bigint);
 CREATE TABLE point_transactions(id uuid DEFAULT gen_random_uuid(),user_id uuid,type text,amount bigint,description text,related_id uuid);
 CREATE TABLE folders(id uuid PRIMARY KEY,user_id uuid);
 CREATE TABLE user_items(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,folder_id uuid,type text,name text,reference_id uuid,details jsonb);
 `);
 for(const file of migrations)await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations',file),'utf8'));
 return db;
}
test('Catalog reads all 1,094 materials, handles exact page boundaries and reports failures',async()=>{
 const rows=fixture.materials;assert.equal(rows.length,1094);
 assert.equal((await readAllPages(async(a,b)=>({data:rows.slice(a,b+1),error:null}))).length,1094);
 assert.equal((await readAllPages(async(a,b)=>({data:rows.slice(0,1000).slice(a,b+1),error:null}))).length,1000);
 await assert.rejects(readAllPages(async()=>({data:null,error:new Error('offline')})));
});
test('Actual metadata: all 32 verified source bundles and exact 20/21-paper selection',async()=>{
 const db=await database();
 try{
  for(let i=0;i<fixture.questions.length;i+=1000) await db.query('INSERT INTO questions SELECT * FROM jsonb_populate_recordset(NULL::questions,$1::jsonb)',[JSON.stringify(fixture.questions.slice(i,i+1000))]);
  for(const row of audit){
   if(!row.expectedQuestionIds.length && row.id !== '97672baf-c3cc-4c9a-a1b5-3a98987090f3'){assert.throws(()=>resolveScope(fixture.materials,[row.id]));continue;}
   const scope=resolveScope(fixture.materials,[row.id]);
   const result=await db.query('SELECT id FROM question_bank_candidates($1::jsonb)',[JSON.stringify(scope)]);
   assert.deepEqual(result.rows.map(q=>q.id).sort(),[...row.expectedQuestionIds].sort(),row.title);
  }
  const selected=audit.filter(r=>r.expectedQuestionIds.length);
  for(const n of [1,20,21,32]){
   const chosen=selected.slice(0,n),scope=resolveScope(fixture.materials,chosen.map(r=>r.id));
   const result=await db.query('SELECT id FROM question_bank_candidates($1::jsonb)',[JSON.stringify(scope)]);
   assert.deepEqual(result.rows.map(q=>q.id).sort(),[...new Set(chosen.flatMap(r=>r.expectedQuestionIds))].sort());
  }
  const empty=await db.query('SELECT id FROM question_bank_candidates($1::jsonb)',['[]']);assert.equal(empty.rows.length,0);
  const all=resolveScope(fixture.materials,fixture.materials.filter(m=>!audit.find(a=>a.id===m.id&&!a.expectedQuestionIds.length)).map(m=>m.id));
  const start=Date.now();const total=await db.query('SELECT count(*)::int AS n FROM question_bank_candidates($1::jsonb)',[JSON.stringify(all)]);console.log('All-catalog candidate count/time:',total.rows[0].n,Date.now()-start,'ms');assert.ok(total.rows[0].n>1000);
  const facets=await db.query('SELECT question_bank_facets($1::jsonb,false) result',[JSON.stringify(all)]);assert.ok(facets.rows[0].result.length>0);
  const automatic=await db.query('SELECT question_bank_random($1::jsonb,$2::uuid[],$3,$4::text[],1,10,50,false) result',[JSON.stringify(all),[], '',[]]);
  const generated=automatic.rows[0].result;assert.equal(generated.questions.length,50);assert.equal(new Set(generated.questions.map(q=>q.id)).size,50);assert.ok(generated.questions.every(q=>q.is_off_curriculum===false));
  const narrow=await db.query('SELECT question_bank_random($1::jsonb,$2::uuid[],$3,$4::text[],1,10,50,true) result',[JSON.stringify(resolveScope(fixture.materials,[selected[0].id])),selected[0].expectedQuestionIds,'',[]]);assert.equal(narrow.rows[0].result.questions.length,0);

  const mockLinks=require('../src/lib/questions/verified-mock-links.json');
  const counts=await db.query("SELECT m.key,count(q.id)::int n FROM jsonb_each($1::jsonb) m LEFT JOIN LATERAL question_bank_candidates(jsonb_build_array(jsonb_build_object('sources',jsonb_build_array(m.value->>'source'),'grade',m.value->>'grade'))) q ON true GROUP BY m.key",[JSON.stringify(mockLinks)]);
  for(const row of counts.rows)assert.equal(row.n,mockLinks[row.key].questionCount,row.key);
  const excluded=fixture.questions.slice(0,1100).map(q=>q.id);
  const filtered=await db.query('SELECT id FROM question_bank_candidates($1::jsonb,$2::uuid[])',[JSON.stringify(all),excluded]);assert.ok(filtered.rows.every(q=>!excluded.includes(q.id)));
  assert.throws(()=>resolveScope(fixture.materials,[{id:uid(99999),school:fixture.materials[0].school}]));
  const legit=fixture.materials.find(m=>!audit.some(a=>a.id===m.id&&!a.expectedQuestionIds.length));assert.deepEqual(resolveScope(fixture.materials,[{...legit,school:'FORGED',source_db_id:'FORGED'}]),[toScopeRule(legit)]);
  await assert.rejects(db.exec("SET ROLE authenticated; SELECT * FROM question_bank_candidates('[]');"));await db.exec('RESET ROLE');
 }finally{await db.close();}
});
test('Automatic selection includes candidates after row 1,000 and never repeats excluded IDs',async()=>{
 const db=await database();try{
  const rows=Array.from({length:1500},(_,i)=>({id:uid(10000+i),source_db_id:'large-pool',school:'검사학교',work_status:'sorted',subject:'대수',unit:'로그',difficulty:'3',is_off_curriculum:false}));
  await db.query('INSERT INTO questions SELECT * FROM jsonb_populate_recordset(NULL::questions,$1::jsonb)',[JSON.stringify(rows)]);
  const result=await db.query('SELECT question_bank_random($1::jsonb,$2::uuid[],$3,$4::text[],1,10,50,false) result',[JSON.stringify([{sources:['large-pool']}]),rows.slice(0,1000).map(q=>q.id),'',[]]);
  const chosen=result.rows[0].result;assert.equal(chosen.availableCount,500);assert.equal(chosen.questions.length,50);assert.equal(new Set(chosen.questions.map(q=>q.id)).size,50);assert.ok(chosen.questions.every(q=>Number(q.id.slice(-12))>=11000));
 }finally{await db.close();}
});
test('Return path rejects open redirects and restores the complete exam draft',()=>{
 for(const value of ['https://evil.example','//evil.example','/\\evil.example','/%2f%2fevil.example','/login?next=/signup','/foo\nbar'])assert.equal(safeReturnPath(value),'/');
 assert.equal(safeReturnPath('/question-bank?src=abc&resume=1'),'/question-bank?src=abc&resume=1');
 const d={version:1,updatedAt:Date.now(),cartIds:[uid(1),uid(2)],selectedDbIds:[uid(3)],excludedQuestionIds:[uid(4)],selectedExamIds:[uid(5)],filters:{units:['로그'],concepts:[],subjects:[],keywords:[],difficulty:['3'],includeOffCurriculum:true},title:'내 시험지',questionsPerColumn:3,viewMode:'review',autoOpen:true};
 assert.deepEqual(parseDraft(JSON.stringify(d)),d);assert.equal(parseDraft('{'),null);assert.equal(parseDraft(JSON.stringify({...d,updatedAt:1})),null);
});
test('Server quotes ignore browser prices and reject negative, fractional and invalid point inputs',()=>{
 const materials=[{id:uid(1),file_type:'DB',title:'원본',price:1000}];
 const quote=cartQuote([{item_id:uid(1),price:0,title:'forged',item_type:'MOCK_EXAM'}],materials,0);
 assert.equal(quote.amount,1000);assert.equal(quote.items[0].item_type,'PERSONAL_DB');assert.equal(quote.items[0].title,'원본');
 for(const used of [-1,0.5,1001,'0',NaN])assert.throws(()=>cartQuote([{item_id:uid(1)}],materials,used));
 assert.throws(()=>cartQuote([{item_id:uid(1)},{item_id:uid(1)}],materials,0));assert.throws(()=>cartQuote([{item_id:uid(2)}],materials,0));
 const order={payment_id:'order-test',user_id:uid(1),amount:1100};const paid={id:order.payment_id,status:'PAID',currency:'KRW',amount:{total:1100},customer:{id:uid(1)},customData:JSON.stringify({orderId:'order-test'})};
 verifyPaidPayment(order,paid);for(const bad of [{status:'READY'},{currency:'USD'},{customer:{id:uid(2)}},{amount:{total:1}},{customData:'{}'},{id:'wrong'}])assert.throws(()=>verifyPaidPayment(order,{...paid,...bad}));
 assert.throws(()=>verifyPaidPayment(order,{...paid,status:'READY'}),{message:'PAYMENT_PENDING'});
});
test('A payment still READY keeps its original order and does not open another checkout',async()=>{
 const originalFetch=global.fetch,originalWindow=global.window,originalStorage=global.localStorage;
 const user={id:uid(1),email:'test@mathetf.invalid',user_metadata:{}};
 const storageKey=`mathetf_pending_payment_${user.id}_cart`,paymentId='order-'+ 'b'.repeat(32);
 const saved=new Map([[storageKey,paymentId]]);let newOrders=0;
 global.localStorage={getItem:key=>saved.get(key)||null,setItem:(key,value)=>saved.set(key,value),removeItem:key=>saved.delete(key)};
 global.window={location:{origin:'https://mathetf.invalid'},PortOne:{requestPayment:async()=>{throw Error('A second checkout must not open');}}};
 global.fetch=async url=>{if(url==='/api/payments/orders')newOrders++;return {ok:false,json:async()=>({success:false,code:'PAYMENT_PENDING',message:'결제가 아직 진행 중입니다.'})};};
 try{
  await assert.rejects(payOrder(user,{kind:'cart',items:[{item_id:uid(2)}],usedPoints:0}),/진행 중/);
  assert.equal(newOrders,0);assert.equal(saved.get(storageKey),paymentId);
 }finally{global.fetch=originalFetch;global.window=originalWindow;global.localStorage=originalStorage;}
});
test('A material purchase opens an ordinary card payment without escrow',async()=>{
 const originalFetch=global.fetch,originalWindow=global.window,originalStorage=global.localStorage;
 const saved=new Map();let paymentRequest;
 global.localStorage={getItem:key=>saved.get(key)||null,setItem:(key,value)=>saved.set(key,value),removeItem:key=>saved.delete(key)};
 global.window={location:{origin:'https://mathetf.invalid'},PortOne:{requestPayment:async request=>{paymentRequest=request;return {paymentId:request.paymentId,transactionType:'PAYMENT'};}}};
 global.fetch=async(url)=>({ok:true,json:async()=>url==='/api/payments/orders'
  ?{paymentId:'order-'+ 'a'.repeat(32),amount:1100,name:'검증용 자료'}
  :{success:true,kind:'cart',points:0}});
 try{
  await payOrder({id:uid(1),email:'test@mathetf.invalid',user_metadata:{}},{kind:'cart',items:[{item_id:uid(2)}],usedPoints:0});
  assert.equal(paymentRequest.payMethod,'CARD');assert.equal(paymentRequest.totalAmount,1100);
  assert.equal('isEscrow' in paymentRequest,false);
  assert.equal(saved.size,0);
 }finally{global.fetch=originalFetch;global.window=originalWindow;global.localStorage=originalStorage;}
});
test('Local PostgreSQL transactions: replay, wrong owner, rollback, retry, points without seller rewards',async()=>{
 const db=await database();try{
  for(const n of [1,2,3]){await db.query('INSERT INTO auth.users VALUES($1)',[uid(n)]);await db.query('INSERT INTO profiles(id,earned_points) VALUES($1,1000)',[uid(n)]);}
  async function order(id,quote,user=uid(1)){await db.query('INSERT INTO payment_orders(payment_id,user_id,kind,amount,total,used_points,points,items,name) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[id,user,quote.kind,quote.amount,quote.total,quote.used_points,quote.points,JSON.stringify(quote.items),quote.name]);}
  const complete=(id,user=uid(1))=>db.query('SELECT complete_payment_order($1,$2)',[id,user]);
  await assert.rejects(order('order-topup-forbidden',{kind:'topup',amount:1100,total:1100,used_points:0,points:1000,items:[],name:'금지된 충전'}));
  const first=cartQuote([{item_id:uid(19)}],[{id:uid(19),file_type:'PDF',title:'첫 자료',price:1100}],0);
  await order('order-first',first);await assert.rejects(complete('order-first',uid(2)));
  await Promise.all([complete('order-first'),complete('order-first')]);
  assert.equal((await db.query('SELECT purchased_points::int n FROM profiles WHERE id=$1',[uid(1)])).rows[0].n,0);
  assert.equal((await db.query('SELECT count(*)::int n FROM payment_history')).rows[0].n,1);
  const cart=cartQuote([{item_id:uid(20)}],[{id:uid(20),file_type:'DB',title:'검증 자료',price:1000}],1000);
  // Previously prepared orders may still carry reward fields. Completing them must not pay a seller.
  cart.items[0].reward_user_id=uid(2);cart.items[0].submission_id=uid(21);
  await db.query('INSERT INTO exam_materials(id,title) VALUES($1,$2),($3,$4)',[uid(20),'검증 자료',uid(21),'원본 제보']);
  await order('order-cart',cart);
  await db.exec(`CREATE FUNCTION fail_purchase() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'Injected grant failure'; END;$$; CREATE TRIGGER fail_grant BEFORE INSERT ON purchased_items FOR EACH ROW EXECUTE FUNCTION fail_purchase();`);
  await assert.rejects(complete('order-cart'));
  assert.equal((await db.query("SELECT count(*)::int n FROM payment_history WHERE payment_id='order-cart'")).rows[0].n,0);
  assert.equal((await db.query('SELECT earned_points::int n FROM profiles WHERE id=$1',[uid(1)])).rows[0].n,1000);
  assert.equal((await db.query("SELECT status FROM payment_orders WHERE payment_id='order-cart'")).rows[0].status,'pending');
  await db.exec('DROP TRIGGER fail_grant ON purchased_items');await complete('order-cart');await complete('order-cart');
  assert.equal((await db.query('SELECT earned_points::int n FROM profiles WHERE id=$1',[uid(1)])).rows[0].n,0);
  assert.equal((await db.query('SELECT earned_points::int n FROM profiles WHERE id=$1',[uid(2)])).rows[0].n,1000);
  assert.equal((await db.query('SELECT count(*)::int n FROM submission_earnings')).rows[0].n,0);
  await order('order-insufficient',cart);await assert.rejects(complete('order-insufficient'));
  await assert.rejects(db.exec(`SET ROLE authenticated; SELECT complete_payment_order('order-first','${uid(1)}');`));await db.exec('RESET ROLE');
 }finally{await db.close();}
});
test('Saved item and success event commit atomically; client cannot claim server completion',async()=>{
 const db=await database();try{
  await db.query('INSERT INTO profiles(id) VALUES($1)',[uid(1)]);
  const save=(folder=null,track=true)=>db.query('SELECT save_exam_item($1,$2,$3,$4,$5,$6,$7) item',[uid(1),folder,'시험지',uid(9),JSON.stringify({question_count:3}),uid(8),track]);
  await assert.rejects(save(uid(333)));assert.equal((await db.query('SELECT count(*)::int n FROM user_items')).rows[0].n,0);
  const result=await save();assert.ok(result.rows[0].item.id);
  const metrics=await db.query('SELECT * FROM question_bank_metrics(28)');assert.equal(Number(metrics.rows[0].events),1);assert.equal(metrics.rows[0].event,'qb_save');
  await assert.rejects(db.exec("INSERT INTO question_bank_events(event,source) VALUES('qb_save','client')"));
  await db.exec(`CREATE FUNCTION fail_event() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'Injected analytics failure'; END;$$; CREATE TRIGGER fail_event BEFORE INSERT ON question_bank_events FOR EACH ROW EXECUTE FUNCTION fail_event();`);
  await assert.rejects(save());assert.equal((await db.query('SELECT count(*)::int n FROM user_items')).rows[0].n,1);
  await save(null,false);assert.equal((await db.query('SELECT count(*)::int n FROM user_items')).rows[0].n,2);
 }finally{await db.close();}
});
test('HML preserves escaped titles, equations and images and rejects broken XML/references',()=>{
 const template=fs.readFileSync(path.join(__dirname,'../수학ETF양식.hml'),'utf8');
 const image={id:uid(2),question_id:uid(1),original_bin_id:'1',format:'png',size_bytes:68,created_at:'2026-09-20',data:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jvWQAAAAASUVORK5CYII='};
 const question={id:uid(1),question_number:1,plain_text:'검증',content_xml:'<P ParaShape="0" Style="0"><TEXT CharShape="0"><CHAR>문항 1</CHAR><EQUATION><SCRIPT>x^2 + 1</SCRIPT></EQUATION><PICTURE><IMAGE BinItem="1"/></PICTURE></TEXT></P>'};
 const originalLog=console.log;let result;try{console.log=()=>{};result=generateHmlFromTemplate(template,[{question,images:[image]}],{title:'A & B <실험>',questionsPerColumn:2});}finally{console.log=originalLog;}
 validateHml(result.hmlContent);assert.equal(result.questionCount,1);assert.match(result.hmlContent,/x\^2/);assert.equal(new (require('xmldom').DOMParser)().parseFromString(result.hmlContent,'text/xml').getElementsByTagName('TITLE')[0].textContent,'A & B <실험>');
 assert.throws(()=>validateQuestionXml('<P><TEXT>broken</P>'));
 assert.throws(()=>validateHml('<HWPML><BODY></HWPML>'));assert.throws(()=>validateHml(result.hmlContent.replace('BinItem="1"','BinItem="999"')));
 assert.ok(!/[\\/:*?"<>|\r\n]/.test(examFilename('x/y\n:*?')));
 fs.mkdirSync(path.join(__dirname,'output'),{recursive:true});fs.writeFileSync(path.join(__dirname,'output/compatibility-sample.hml'),result.hmlContent);
 for(const n of [20,50]) {
  const rows=Array.from({length:n},(_,i)=>({question:{...question,id:uid(100+i),question_number:i+1},images:[{...image,id:uid(200+i),question_id:uid(100+i)}]}));
  let multi;try{console.log=()=>{};multi=generateHmlFromTemplate(template,rows,{title:`${n}문항 검사`,questionsPerColumn:n===20?1:3});}finally{console.log=originalLog;}
  validateHml(multi.hmlContent);assert.equal(multi.questionCount,n);assert.equal(multi.imageCount,n);
  fs.writeFileSync(path.join(__dirname,`output/compatibility-${n}-questions.hml`),multi.hmlContent);
 }

});

test('Entry context, school initials, Korea-time deadline and campaign privacy',()=>{
 const {samePaper,entryFilters}=require('../src/lib/questions/entry.ts');
 const {schoolMatches,schoolDestination,questionBankHref,examSeason}=require('../src/lib/discovery.ts');
 const {isPersonalDbFree}=require('../src/lib/config.ts');
 const {safeAttribution}=require('../src/lib/analytics/campaigns.ts');
 assert.ok(schoolMatches('하나고','ㅎㄴ'));assert.ok(schoolMatches('하나고','하 나'));assert.ok(!schoolMatches('하나고','대원'));
 assert.ok(!schoolDestination('육군사관학교').startsWith('/school/'));
 const url=new URL(questionBankHref({school:'하나고',subject:'공통수학2',region:'서울',semester:2}),'https://mathetf.com');assert.equal(url.searchParams.get('school'),'하나고');assert.equal(url.searchParams.get('semester'),'2');
 const paper={school:'하나고',grade:1,semester:2,exam_type:'기말고사',exam_year:2025,subject:'공통수학2'};
 assert.ok(samePaper(paper,{...paper,grade:'1'}));for(const patch of [{school:'다른고'},{subject:'공통수학1'},{exam_year:2024},{exam_type:'중간고사'},{grade:2}])assert.ok(!samePaper(paper,{...paper,...patch}));
 assert.equal(entryFilters('수학(하)').curriculum,'2015');assert.deepEqual(entryFilters('공통수학2').subjects,['공통수학2']);
 assert.ok(isPersonalDbFree(new Date('2027-05-26T14:59:59.999Z')));assert.ok(!isPersonalDbFree(new Date('2027-05-26T15:00:00.000Z')));
 assert.equal(examSeason(new Date('2026-07-31T15:00:00Z')).semester,'2');
 const clean=safeAttribution({campaign:'email@example.com',origin:'private@email.com',device:'mobile',email:'private@email.com'});assert.equal(clean.campaign,null);assert.equal(clean.origin,'direct');assert.equal(clean.device,'mobile');assert.ok(!JSON.stringify(clean).includes('@'));
});
test('Fixed demo is exactly five usable questions; mock links are exact original sources',()=>{
 const demo=require('../src/lib/questions/demo-set.json'),links=require('../src/lib/questions/verified-mock-links.json');
 assert.equal(new Set(demo.ids).size,5);for(const id of demo.ids){const q=fixture.questions.find(q=>q.id===id);assert.ok(q);assert.equal(q.work_status,'sorted');assert.equal(q.is_off_curriculum,false);}
 for(const [slug,link] of Object.entries(links)){
  assert.ok(link.dbIds.every(id=>fixture.materials.some(d=>d.id===id)),slug);
  assert.deepEqual(resolveScope(fixture.materials,link.dbIds,slug),[{sources:[link.source],...(link.grade?{grade:link.grade}:{})}]);
  const qs=fixture.questions.filter(q=>q.source_db_id===link.source&&q.work_status==='sorted'&&(!link.grade||q.grade===link.grade));assert.equal(qs.length,link.questionCount,slug);assert.ok(qs.length>0);assert.ok(!link.source.includes('변형'),slug);
  const grade=slug.match(/고[123]/)?.[0];if(grade)assert.ok(qs.every(q=>q.grade===grade),slug);
 }
 assert.equal(Object.keys(links).length,115);
});
test('Growth reporting uses first events and mature 7-day cohorts, excludes other site and denies public access',async()=>{
 const db=await database();try{
  const add=async(event,user,days,session=uid(88),origin=null)=>db.query("INSERT INTO question_bank_events(event,source,user_id,session_id,created_at,origin) VALUES($1,$2,$3,$4,now()-make_interval(days=>$5),$6)",[event,['qb_save','qb_file_response'].includes(event)?'server':'client',user,session,days,origin]);
  await add('qb_enter',uid(1),12,uid(88),'home');await add('qb_save',uid(1),12);await add('qb_save',uid(1),9);await add('qb_file_response',uid(1),12);await add('qb_file_response',uid(1),9);
  await add('qb_save',uid(2),10);await add('qb_save',uid(3),2);await add('qb_save',uid(3),1);await add('qb_save',uid(4),40);await add('qb_save',uid(4),3);
  const out=(await db.query('SELECT question_bank_growth(28) d')).rows[0].d;
  assert.equal(out.firstSavedUsers,3);assert.equal(out.firstFileUsers,1);assert.equal(out.matureUsers,2);assert.equal(out.returnedUsers,1);assert.equal(out.starts,1);assert.equal(out.channels[0].channel,'home');assert.equal(out.channels[0].first_file_users,1);
  await assert.rejects(db.exec("INSERT INTO question_bank_events(event,source,site) VALUES('qb_enter','client','another-site')"));
  await assert.rejects(db.exec('SET ROLE authenticated; SELECT question_bank_growth(28)'));await db.exec('RESET ROLE');
 }finally{await db.close();}
});

test('Reloading the same paper restores the draft, while a different paper starts its own scope',()=>{
 const {draftContext,shouldRestoreDraft}=require('../src/lib/questions/draft.ts');
 const same=new URLSearchParams('material=paper-a&origin=exam');
 const draft={cartIds:['q1'],entryContext:draftContext(same)};
 assert.ok(shouldRestoreDraft(draft,same));
 assert.ok(shouldRestoreDraft(draft,new URLSearchParams('origin=guide&material=paper-a')));
 assert.ok(!shouldRestoreDraft(draft,new URLSearchParams('material=paper-b')));
 assert.ok(!shouldRestoreDraft(draft,new URLSearchParams('demo=1')));
 assert.ok(shouldRestoreDraft(draft,new URLSearchParams('resume=1')));
 assert.ok(shouldRestoreDraft(draft,new URLSearchParams()));
 assert.ok(!shouldRestoreDraft({...draft,cartIds:[]},same));
 assert.ok(!shouldRestoreDraft(null,same));
});


test('Season entry retains the Korean calendar boundary and worksheet scope',()=>{
 const {examSeason,questionBankHref}=require('../src/lib/discovery.ts');
 const {draftContext,shouldRestoreDraft}=require('../src/lib/questions/draft.ts');
 for(const [at,semester,exam] of [
  ['2026-02-28T14:59:59Z','1',''],['2026-02-28T15:00:00Z','1','중간고사'],
  ['2026-04-30T15:00:00Z','1','기말고사'],['2026-07-31T15:00:00Z','2','중간고사'],
  ['2026-10-31T15:00:00Z','2','기말고사'],['2026-12-31T15:00:00Z','1','']]){
   const season=examSeason(new Date(at));assert.equal(season.semester,semester);assert.equal(season.exam,exam);
   const params=new URL(questionBankHref({...season,origin:'home'}),'https://mathetf.com').searchParams;
   assert.equal(params.get('semester'),semester);assert.equal(params.get('exam')||'',exam);
   const draft={cartIds:[uid(1)],entryContext:draftContext(params)};
   assert.ok(shouldRestoreDraft(draft,params));
   const changed=new URLSearchParams(params);changed.set('semester',semester==='1'?'2':'1');assert.ok(!shouldRestoreDraft(draft,changed));
 }
});

test('Migrations enforce RPC permissions, retired earnings access and the 20-exam cap',async()=>{
 const db=await database();try{
  await db.exec("CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; GRANT USAGE ON SCHEMA auth TO authenticated;");
  for(const n of [1,2]){await db.query('INSERT INTO auth.users VALUES($1)',[uid(n)]);await db.query('INSERT INTO profiles(id) VALUES($1)',[uid(n)]);}
  const names=['question_bank_candidates','question_bank_facets','question_bank_random','complete_payment_order','save_exam_item','question_bank_metrics','question_bank_growth'];
  const perms=await db.query("SELECT proname,has_function_privilege('anon',oid,'EXECUTE') a,has_function_privilege('authenticated',oid,'EXECUTE') u,has_function_privilege('service_role',oid,'EXECUTE') s FROM pg_proc WHERE proname=ANY($1::text[])",[names]);
  assert.equal(perms.rows.length,7);for(const f of perms.rows){assert.equal(f.a,false,f.proname);assert.equal(f.u,false,f.proname);assert.equal(f.s,true,f.proname);}
  for(const n of [1,2])await db.query("INSERT INTO payment_orders(payment_id,user_id,kind,amount,total,items,name) VALUES($1,$2,'cart',1100,1100,'[{\"item_id\":\"00000000-0000-4000-8000-000000000019\",\"price\":1100}]','권한 검사')",['order-owner-'+n,uid(n)]);
  await db.query('INSERT INTO exam_materials(id,title) VALUES($1,$2),($3,$4)',[uid(20),'판매 자료',uid(21),'원본 제보']);
  for(const n of [1,2])await db.query('INSERT INTO submission_earnings(submission_id,db_item_id,purchase_id,buyer_id,submitter_id,sale_amount,earnings_amount) VALUES($1,$2,$3,$4,$5,1000,700)',[uid(21),uid(20),'order-earning-'+n,uid(n===1?2:1),uid(n)]);
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[uid(1)]);await db.exec('SET ROLE authenticated');
  assert.deepEqual((await db.query('SELECT payment_id FROM payment_orders')).rows.map(r=>r.payment_id),['order-owner-1']);
  await assert.rejects(db.query('SELECT purchase_id FROM submission_earnings'));
  await assert.rejects(db.exec("INSERT INTO submission_earnings(submission_id,db_item_id,purchase_id,buyer_id,submitter_id,sale_amount,earnings_amount) VALUES('00000000-0000-4000-8000-000000000021','00000000-0000-4000-8000-000000000020','forged','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001',1000,700)"));
  await assert.rejects(db.exec("UPDATE payment_orders SET status='completed'"));await db.exec('RESET ROLE');
  await db.query('INSERT INTO folders(id,user_id) VALUES($1,$2)',[uid(77),uid(2)]);
  const save=(folder=null)=>db.query('SELECT save_exam_item($1,$2,$3,$4,$5,$6,$7)',[uid(1),folder,'한도 검사',uid(7),JSON.stringify({question_count:1}),uid(8),true]);
  await assert.rejects(save(uid(77)));
  for(let i=0;i<20;i++)await save();await assert.rejects(save());
  assert.equal((await db.query('SELECT count(*)::int n FROM user_items')).rows[0].n,20);
  assert.equal((await db.query("SELECT count(*)::int n FROM question_bank_events WHERE event='qb_save'")).rows[0].n,20);
  await db.exec('SET ROLE anon');await assert.rejects(db.query('SELECT * FROM question_bank_events'));await assert.rejects(db.query('SELECT * FROM payment_orders'));await db.exec('RESET ROLE');
 }finally{await db.close();}
});

test('Resolved Sangmun paper is selectable; missing grade-2 paper remains unavailable',()=>{
 const {unavailableDbs}=require('../src/lib/questions/scope.ts');
 const id='97672baf-c3cc-4c9a-a1b5-3a98987090f3';
 assert.equal(unavailableDbs[id],undefined);
 assert.deepEqual(resolveScope(fixture.materials,[id]),[{sources:['상문고등학교_2022_2학기기말_수학(하)']}]);
 assert.throws(()=>resolveScope(fixture.materials,['fe34d2ea-2f6b-4c1a-a774-33ab238b2141']),/고2 문항 등록 준비 중/);
});

test('Normal entry keeps old filters without automatically searching; explicit resume preserves work',()=>{
 const {shouldSearchRestoredDraft}=require('../src/lib/questions/draft.ts');
 const empty={cartIds:[],selectedDbIds:['saved-scope']};
 assert.equal(shouldSearchRestoredDraft(empty,new URLSearchParams()),false);
 assert.equal(shouldSearchRestoredDraft(empty,new URLSearchParams('resume=1')),true);
 assert.equal(shouldSearchRestoredDraft({...empty,cartIds:['selected-question']},new URLSearchParams()),true);
});
