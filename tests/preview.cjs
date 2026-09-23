// Local review harness. Optional read-only source adapter; all writes stay local.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),crypto=require('node:crypto'),{spawn}=require('node:child_process');
const root=path.join(__dirname,'..');
for(const name of ['.env','.env.local','.env.development','.env.development.local','.env.production','.env.production.local'])if(fs.existsSync(path.join(root,name)))throw new Error('Preview refuses environment files. Use a separate checkout without production credentials.');
const fixtures=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(__dirname,'fixtures/question-scope.json.gz'))));
const catalog=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(__dirname,'fixtures/public-catalog.json.gz'))));
const uid='11111111-1111-4111-8111-111111111111';
const user={id:uid,aud:'authenticated',role:'authenticated',email:'preview@mathetf.invalid',email_confirmed_at:new Date().toISOString(),user_metadata:{name:'체험 사용자',phone:'01000000000'},app_metadata:{provider:'email',providers:['email']},created_at:new Date().toISOString()};
const base64=v=>Buffer.from(JSON.stringify(v)).toString('base64url');
const token=`${base64({alg:'HS256',typ:'JWT'})}.${base64({sub:uid,aud:'authenticated',role:'authenticated',email:user.email,exp:Math.floor(Date.now()/1000)+86400})}.local-preview-signature`;
const auth={access_token:token,refresh_token:'local-preview-refresh',expires_in:86400,expires_at:Math.floor(Date.now()/1000)+86400,token_type:'bearer',user};
const store=new Map(),items=[],folders=[];
const reviewStatePath=path.join(__dirname,'output/review-session.json');
if(fs.existsSync(reviewStatePath)){
 const state=JSON.parse(fs.readFileSync(reviewStatePath,'utf8'));
 if(state.userId!==uid)throw new Error('Invalid local review snapshot');
 items.push(...state.items);folders.push(...state.folders);
 for(const [key,value] of state.files)store.set(key,Buffer.from(value,'base64'));
}

const realPath=path.join(__dirname,'output/real-questions.json.gz');
const real=fs.existsSync(realPath)?JSON.parse(zlib.gunzipSync(fs.readFileSync(realPath))):{questions:[],images:[]};
const realById=new Map(real.questions.map(q=>[q.id,q]));
const imageById=new Map();for(const im of real.images){if(!imageById.has(im.question_id))imageById.set(im.question_id,[]);imageById.get(im.question_id).push(im);}
const sourceConfigPath=path.join(__dirname,'output/readonly-source-config.json');
const sourceConfig=fs.existsSync(sourceConfigPath)?JSON.parse(fs.readFileSync(sourceConfigPath,'utf8')):null;
const sourceEnvArg=process.argv.includes('--offline')?null:process.argv.find(arg=>arg.startsWith('--readonly-source-env='))||(sourceConfig?.envPath?'--readonly-source-env='+sourceConfig.envPath:null);
const livePath=path.join(__dirname,'output/live-question-metadata.json.gz');
if(sourceEnvArg&&!fs.existsSync(livePath))throw Error('Refresh question metadata before connecting originals');
const live=sourceEnvArg?JSON.parse(zlib.gunzipSync(fs.readFileSync(livePath))):null;
const questions=(live?.questions||fixtures.questions).map(q=>({...q,is_off_curriculum:q.is_off_curriculum??false,key_concepts:q.key_concepts||[],...realById.get(q.id)}));
const questionById=new Map(questions.map(q=>[q.id,q]));
const source=sourceEnvArg?require('./readonly-source.cjs').createReader({envPath:sourceEnvArg.slice('--readonly-source-env='.length),cacheDir:path.join(__dirname,'output/source-cache'),allowedIds:new Set(questionById.keys())}):null;
const hydrated=new Set();
async function hydrate(ids){
 if(!source)return;
 const pending=[...new Set(ids)].filter(id=>!hydrated.has(id)&&questionById.has(id));
 if(!pending.length)return;
 for(const data of await source.ensure(pending)){Object.assign(questionById.get(data.question.id),data.question);imageById.set(data.question.id,data.images);hydrated.add(data.question.id);}
}
console.log(JSON.stringify({reviewQuestions:questions.length,originals:source?'read-only with local cache':'offline subset'}));

const matches=(q,r)=>r.sources ? r.sources.includes(q.source_db_id)&&(!r.grade||String(q.grade)===r.grade):q.school===r.school&&(!r.grade||String(q.grade)===r.grade)&&(!r.year||String(q.year)===r.year)&&(!r.semesters||r.semesters.includes(q.semester))&&(!r.semesterPrefix||q.semester?.startsWith(r.semesterPrefix))&&(!r.subjects||r.subjects.includes(q.subject));
function filterRows(rows,params){
 for(const [key,term] of params){if(['select','order','offset','limit','on_conflict','or'].includes(key))continue;
  const dot=term.indexOf('.');const op=term.slice(0,dot),value=term.slice(dot+1);
  if(op==='neq')rows=rows.filter(r=>String(r[key])!==value);
  if(op==='not'&&value.startsWith('in.')){const vs=value.slice(3).replace(/^\(|\)$/g,'').split(',').map(x=>x.replace(/^"|"$/g,''));rows=rows.filter(r=>!vs.includes(String(r[key])));}
  if(op==='eq')rows=rows.filter(r=>String(r[key])===value);
  if(op==='is')rows=rows.filter(r=>value==='null'?r[key]==null:String(r[key])===value);
  if(op==='in'){const vs=value.replace(/^\(|\)$/g,'').split(',').map(x=>x.replace(/^"|"$/g,''));rows=rows.filter(r=>vs.includes(String(r[key])));}
  if(op==='ilike'||op==='like')rows=rows.filter(r=>String(r[key]||'').includes(value.replace(/%/g,'')));
 }
 const order=params.get('order');if(order){const [k,dir]=order.split(',')[0].split('.');rows=[...rows].sort((a,b)=>String(a[k]||'').localeCompare(String(b[k]||''),'ko',{numeric:true})*(dir==='desc'?-1:1));}
 return rows;
}
const server=http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1:54329');const chunks=[];for await(const chunk of req)chunks.push(chunk);const raw=Buffer.concat(chunks);let body={};try{body=JSON.parse(raw.toString());}catch{}
 res.setHeader('Access-Control-Allow-Origin','http://localhost:3100');res.setHeader('Access-Control-Allow-Headers','*');res.setHeader('Access-Control-Allow-Methods','GET,POST,PATCH,DELETE,HEAD,OPTIONS');res.setHeader('Access-Control-Expose-Headers','Content-Range');
 const json=(value,status=200)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(req.method==='HEAD'?'':JSON.stringify(value));};
 if(req.method==='OPTIONS')return json({});
 if(url.pathname==='/review/content-status')return json({questions:questions.length,hydrated:hydrated.size,source:source?'read-only':'offline',stats:source?.stats});
 try {
 if(url.pathname.startsWith('/auth/v1/token'))return json(auth);
 if(url.pathname==='/auth/v1/user')return req.headers.authorization?.startsWith('Bearer eyJ')?json(user):json({message:'No local session'},401);
 if(url.pathname==='/auth/v1/logout')return json({});
 if(url.pathname.startsWith('/storage/v1/object/')){
  const key=url.pathname.replace('/storage/v1/object/','').replace(/^authenticated\//,'');
  if(req.method==='POST'){store.set(key,raw);return json({Key:key});}
  if(req.method==='GET'){if(!store.has(key))return json({message:'Not found'},404);res.writeHead(200,{'Content-Type':key.endsWith('.json')?'application/json':'application/xml'});return res.end(store.get(key));}
  return json([]);
 }

 if(url.pathname==='/rest/v1/rpc/question_bank_facets' || url.pathname==='/rest/v1/rpc/question_bank_random'){
  let pool=questions.filter(q=>q.work_status==='sorted'&&(body.p_scope||[]).some(r=>matches(q,r))&&(body.p_include_off||q.is_off_curriculum===false));
  if(url.pathname.endsWith('question_bank_facets')){
   const map=new Map();for(const q of pool)map.set(`${q.subject}|${q.unit}|${q.is_off_curriculum}`,{subject:q.subject,unit:q.unit,key_concepts:q.key_concepts,is_off_curriculum:q.is_off_curriculum});return json([...map.values()]);
  }
  pool=pool.filter(q=>!(body.p_excluded||[]).includes(q.id)&&(!body.p_subject||q.subject===body.p_subject)&&(!(body.p_units||[]).length||body.p_units.includes(q.unit))&&Number(q.difficulty)>=body.p_min&&Number(q.difficulty)<=body.p_max);
  const chosen=pool.sort(()=>Math.random()-0.5).slice(0,body.p_count);await hydrate(chosen.map(q=>q.id));return json({questions:chosen.map(q=>({...q,question_images:imageById.get(q.id)||[]})),availableCount:pool.length});
 }
 if(url.pathname==='/rest/v1/rpc/question_bank_growth')return json({days:28,starts:0,firstSavedUsers:0,firstFileUsers:0,fileUsers:0,matureUsers:0,returnedUsers:0,emptySearches:0,saveFailures:0,channels:[]});
 let rows=[];

 if(url.pathname==='/rest/v1/rpc/question_bank_candidates')rows=questions.filter(q=>q.work_status==='sorted'&&(body.p_scope||[]).some(r=>matches(q,r))&&!(body.p_excluded||[]).includes(q.id));
 else if(url.pathname==='/rest/v1/rpc/save_exam_item'){
  const item={id:crypto.randomUUID(),user_id:body.p_user_id,folder_id:body.p_folder_id,type:'saved_exam',name:body.p_name,reference_id:body.p_reference_id,details:body.p_details,created_at:new Date().toISOString()};items.push(item);return json(item);
 }else if(url.pathname==='/rest/v1/exam_materials')rows=catalog.materials;
 else if(url.pathname==='/rest/v1/mock_exams')rows=catalog.mocks;
 else if(url.pathname==='/rest/v1/schools')rows=catalog.schools;
 else if(url.pathname==='/rest/v1/questions')rows=questions;
 else if(url.pathname==='/rest/v1/profiles')rows=[{id:uid,email:user.email,purchased_points:0,earned_points:0,name:'체험 사용자'}];
 else if(url.pathname==='/rest/v1/folders'){if(req.method==='POST'){const f={id:crypto.randomUUID(),...body};folders.push(f);rows=[f];}else rows=folders;}
 else if(url.pathname==='/rest/v1/user_items'){
  if(req.method==='POST'){const added=(Array.isArray(body)?body:[body]).map(i=>({id:crypto.randomUUID(),created_at:new Date().toISOString(),...i}));items.push(...added);rows=added;}else rows=items;
 }else if(url.pathname==='/rest/v1/question_images'){
  const term=url.searchParams.get('question_id');
  const ids=term?.startsWith('in.')?term.slice(3).replace(/^\(|\)$/g,'').split(',').map(id=>id.replace(/^"|"$/g,'')):term?.startsWith('eq.')?[term.slice(3)]:[];
  if(ids.length){await hydrate(ids);rows=ids.flatMap(id=>imageById.get(id)||[]);}else rows=[...imageById.values()].flat();
 }
 else if(url.pathname==='/rest/v1/payment_orders')return json({message:'Real payments are disabled in this preview'},503);
 else if(!url.pathname.startsWith('/rest/v1/'))return json({message:'Preview endpoint unavailable'},404);
 rows=filterRows(rows,url.searchParams);const count=rows.length;const from=Number(url.searchParams.get('offset')||0),limit=Number(url.searchParams.get('limit')||1000);rows=rows.slice(from,from+limit);
 const select=url.searchParams.get('select')||'*';
 if(['/rest/v1/questions','/rest/v1/rpc/question_bank_candidates'].includes(url.pathname)&&(select==='*'||select.includes('content_xml')||select.includes('question_images(')))await hydrate(rows.map(q=>q.id));
 if(select.includes('question_images('))rows=rows.map(q=>{
  const out={};for(const col of select.split(/,(?![^()]*\))/)){if(col.startsWith('question_images('))out.question_images=imageById.get(q.id)||[];else out[col]=q[col];}return out;
 });
 if(!select.includes('*')&&!select.includes('(')){const cols=select.split(',');rows=rows.map(r=>Object.fromEntries(cols.map(k=>[k,r[k]])));}
 res.setHeader('Content-Range',`${from}-${Math.max(from,from+rows.length-1)}/${count}`);
 if(req.headers.accept?.includes('vnd.pgrst.object'))return rows.length===1?json(rows[0]):json({message:'Not found',code:'PGRST116'},406);
 json(rows);
 }catch(error){console.error('Review original load:',error.message);return json({message:'실제 문항 원본을 불러오지 못했습니다. 다시 시도해주세요.'},503);}
});

// Buffer static assets in the review proxy: Next 14's streaming file reader fails on this Windows host.
const proxy=http.createServer(async(req,res)=>{
 const pathname=new URL(req.url,'http://localhost:3100').pathname;
 if(pathname.startsWith('/_next/static/')){
  const base=path.resolve(root,'.next-review/static');const file=path.resolve(base,decodeURIComponent(pathname.slice('/_next/static/'.length)));
  if(file.startsWith(base+path.sep))try{const bytes=await fs.promises.readFile(file);res.writeHead(200,{'Content-Type':file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'application/octet-stream'});res.end(bytes);return;}catch{}
 }
 const upstream=http.request({hostname:'127.0.0.1',port:3101,path:req.url,method:req.method,headers:req.headers},response=>{if(response.headers.location)response.headers.location=response.headers.location.replace('http://localhost:3101','http://localhost:3100').replace('http://127.0.0.1:3101','http://localhost:3100');res.writeHead(response.statusCode,response.headers);response.pipe(res);});
 upstream.on('error',()=>{res.writeHead(503);res.end('Local review is starting. Refresh shortly.');});req.pipe(upstream);
});
proxy.on('upgrade',(req,socket,head)=>{const upstream=require('node:net').connect(3101,'127.0.0.1',()=>{upstream.write(`${req.method} ${req.url} HTTP/1.1\r\n`+Object.entries(req.headers).map(([k,v])=>`${k}: ${v}`).join('\r\n')+'\r\n\r\n');upstream.write(head);socket.pipe(upstream);upstream.pipe(socket);});upstream.on('error',()=>socket.destroy());socket.on('error',()=>upstream.destroy());});
proxy.listen(3100,'127.0.0.1');
server.listen(54329,'127.0.0.1',()=>{
 const env={...process.env,NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:54329',NEXT_PUBLIC_SUPABASE_ANON_KEY:'local-preview-anon',SUPABASE_SERVICE_ROLE_KEY:'local-preview-service',NEXT_PUBLIC_LOCAL_PREVIEW:'1',NEXT_PUBLIC_REVIEW_ORIGINALS:source?'1':'0',VERCEL_ENV:'development',PORTONE_API_SECRET:'',NEXT_PUBLIC_PORTONE_STORE_ID:'',NEXT_PUBLIC_PORTONE_CHANNEL_KEY:'',NEXT_PUBLIC_GA_MEASUREMENT_ID:'',NEXT_TELEMETRY_DISABLED:'1'};
 const launch=()=>{
  const app=spawn(process.execPath,[path.join(root,'node_modules/next/dist/bin/next'),'start','-H','127.0.0.1','-p','3101'],{cwd:root,env,stdio:'inherit',windowsHide:true});
  app.on('exit',()=>{server.close();proxy.close();});
  console.log('LOCAL REVIEW: http://localhost:3100/question-bank | preview@mathetf.invalid / local-preview');
  process.on('SIGINT',()=>{app.kill();server.close();proxy.close();});
 };
 if(process.argv.includes('--reuse-build'))launch();
 else{
  console.log('Compiling isolated preview before starting...');
  const build=spawn(process.execPath,[path.join(root,'node_modules/next/dist/bin/next'),'build','--experimental-build-mode','compile'],{cwd:root,env,stdio:'inherit',windowsHide:true});
  build.on('exit',code=>{if(code===0)launch();else{server.close();proxy.close();process.exitCode=code||1;}});
 }
});
