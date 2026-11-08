require('./register.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const JSZip = require('jszip');
const { NextRequest } = require('next/server');
const { uploadProof, registerMaterial } = require('../src/lib/material-registration.ts');
const { ensurePrivateOriginals } = require('../src/lib/private-originals.ts');
const { privateOriginalStorage } = require('../scripts_patched/original-storage.cjs');
const { materialArchive } = require('../src/lib/material-archive.ts');
const { GET: image } = require('../src/app/api/og-image/route.ts');
const uid = '11111111-1111-4111-8111-111111111111';
const uuid = '22222222-2222-4222-8222-222222222222';
const key = `${uid}/123_${uuid}.hwpx`;
const now = Date.now();
const metadata = { school:'검증고', region:'서울', district:'강남', subject:'기하', title:'검증자료', exam_type:'중간고사', exam_year:2026, grade:2, semester:1, file_type:'HWP', content_type:'해설', price:0, file_path:'hwpx-originals/secret.hml', uploader_id:'attacker', source_db_id:'secret' };

test('listing registration verifies server proof, uploaded object, owner, expiry, and fixes price/path/identity', async () => {
    const rows = [];
    const sb = {
        storage:{ from: bucket => ({ list: async folder => {
            assert.equal(bucket,'exam-materials'); assert.equal(folder,uid);
            return { data:[{ name:key.split('/')[1], metadata:{ size:4 } }] };
        } }) },
        from: table => ({ insert: async row => { assert.equal(table,'exam_materials'); rows.push(row); return {}; } }),
    };
    const proof = uploadProof(uid,key,4,'test-secret',now);
    await registerMaterial(sb,{ id:uid,email:'test@example.invalid' },{ proof, metadata },'test-secret',now);
    assert.equal(rows.length,1); assert.equal(rows[0].file_path,key); assert.equal(rows[0].id,uuid);
    assert.equal(rows[0].price,2000); assert.equal(rows[0].uploader_id,uid); assert.equal(rows[0].source_db_id,undefined);
    for (const bad of [proof+'x',uploadProof('other',key,4,'test-secret',now),uploadProof(uid,key,4,'test-secret',now-3*3600_000),uploadProof(uid,key,5,'test-secret',now),uploadProof(uid,uid+'/../../secret.hml',4,'test-secret',now)]) {
        await assert.rejects(registerMaterial(sb,{ id:uid },{ proof:bad, metadata },'test-secret',now));
    }
    await assert.rejects(registerMaterial(sb,{ id:uid },{ proof, metadata:{ ...metadata,content_type:'개인DB' } },'test-secret',now));
    assert.equal(rows.length,1);
});

test('original storage creation is private and public/unverifiable buckets stop ingestion', async () => {
    const events = [];
    const storage = {
        listBuckets: async () => ({ data:[] }),
        createBucket: async (name,options) => { events.push(options); return {}; },
        getBucket: async () => ({ data:{ public:false } }),
    };
    await ensurePrivateOriginals({ storage },true);
    assert.equal(events[0].public,false);
    for (const checked of [{ data:{ public:true } },{ error:{ message:'failed' } },{ data:{} }]) {
        await assert.rejects(ensurePrivateOriginals({ storage:{ getBucket:async()=>checked } }));
        await assert.rejects(privateOriginalStorage({ storage:{ getBucket:async()=>checked } }));
    }
    let called = 0;
    const originals = await privateOriginalStorage({ storage:{ getBucket:storage.getBucket,from:bucket=>{
        assert.equal(bucket,'hwpx-originals'); return { upload:async()=>{called++;},download:async()=>{called++;} };
    } } });
    await originals.upload(`raw_uploads/${uuid}.hml`,Buffer.from('original'),{});
    await originals.download(`raw_uploads/${uuid}.hwpx`);
    for (const bad of ['../x.hml',`raw_uploads/${uuid}.webp`,`raw_uploads/%2e%2e/${uuid}.hml`,'hwpx/raw_uploads/x.hml']) assert.throws(()=>originals.upload(bad,Buffer.from('x'),{}));
    assert.equal(called,2);
});

test('image proxy enforces allowed buckets, canonical keys, raster extensions, exact image MIME and no redirects', async () => {
    const original = global.fetch, oldUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    process.env.NEXT_PUBLIC_SUPABASE_URL='http://storage.invalid';
    let calls=0, mime='image/webp';
    global.fetch=async(url,options)=>{calls++;assert.equal(options.redirect,'error');return new Response('image',{headers:{'Content-Type':mime}});};
    try {
        for(const value of ['hwpx/raw_uploads/test.hml','hwpx/raw_uploads/x.webp','hwpx-originals/x.webp','exam-materials/x.jpg','exam-free-problems/x.pdf','question-assets/x.svg','question-assets/%2e%2e/x.webp','/question-assets/x.webp','hwpx/auto_captures/\\x.webp']) {
            assert.equal((await image(new NextRequest('http://local/api/og-image?'+new URLSearchParams({path:value})))).status,400,value);
        }
        assert.equal(calls,0);
        for(const bucket of ['hwpx','exam-previews','mock-previews','question-assets']) {
            const r=await image(new NextRequest('http://local/api/og-image?'+new URLSearchParams({path:bucket+'/previews/x.webp'})));
            assert.equal(r.status,200); assert.equal(r.headers.get('content-type'),'image/webp'); assert.equal(r.headers.get('x-content-type-options'),'nosniff');
        }
        for(const value of ['text/xml','application/octet-stream','text/html','image/svg+xml','image/png','']) {
            mime=value;
            const r=await image(new NextRequest('http://local/api/og-image?path=exam-previews/x.webp'));
            assert.equal(r.status,415,value);assert.equal(r.headers.get('cache-control'),'no-store');
        }
    } finally {global.fetch=original;if(oldUrl===undefined)delete process.env.NEXT_PUBLIC_SUPABASE_URL;else process.env.NEXT_PUBLIC_SUPABASE_URL=oldUrl;}
});

test('admin archive awaits every file and includes all contents, unique names and Unicode filenames', async () => {
    const reads=[];
    const sb={storage:{from:bucket=>({download:async key=>{assert.equal(bucket,'exam-materials');reads.push(key);await new Promise(r=>setTimeout(r,10));return {data:new Blob([key])};}})}};
    const files=[1,2,3].map(n=>({path:`${uid}/${n}.hwp`,name:'한글원본.hwp'}));
    const bytes=await materialArchive(sb,files);const zip=await JSZip.loadAsync(bytes);
    assert.equal(Object.keys(zip.files).length,3);assert.deepEqual(reads,files.map(f=>f.path));
    for(const [i,file] of files.entries())assert.equal(await zip.file(`${String(i+1).padStart(3,'0')}_한글원본.hwp`).async('string'),file.path);
    reads.length=0;await assert.rejects(materialArchive(sb,[...files,{path:'x/../../secret',name:'x'}]));assert.equal(reads.length,0);
    await assert.rejects(materialArchive(sb,Array(101).fill(files[0])));
    await assert.rejects(materialArchive({storage:{from:()=>({download:async()=>({error:{}})})}},files));
});

test('exam detail uses the stored grade-specific source key for questions and the creation link', async () => {
    const source=fs.readFileSync(path.join(__dirname,'../src/app/exam/[id]/page.tsx'),'utf8');
    const ast=ts.createSourceFile('page.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
    const statement=ast.statements.find(n=>ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>d.name.getText(ast)==='getExam'));
    assert.ok(statement);
    const saved='검증고_2026_1학기중간_2학년_기하';
    const calls=[];
    const full={id:uuid,school:'검증고',exam_year:2026,semester:1,grade:2,exam_type:'중간고사',subject:'기하',source_db_id:saved};
    const client={from(table){const call={table};calls.push(call);const q={select(columns){call.columns=columns;return q;},eq(col,value){call[col]=value;return q;},neq(){return q;},is(){return q;},order(){return q;},limit(){return q;},single:async()=>({data:Object.fromEntries(call.columns.split(',').map(k=>[k.trim(),full[k.trim()]]))}),then(resolve){return Promise.resolve({data:table==='questions'?[{unit:'벡터',difficulty:3,key_concepts:[]}]:[]}).then(resolve);}};return q;}};
    const js=ts.transpileModule(statement.getText(ast)+'\nglobalThis.getExam=getExam;',{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
    const context={cache:f=>f,createAdminClient:()=>client,buildSourceDbId:require('../src/lib/examKey.ts').buildSourceDbId};vm.runInNewContext(js,context);
    const result=await context.getExam(uuid);assert.equal(result.sourceKey,saved);assert.equal(result.composition.total,1);
    assert.equal(calls.find(c=>c.table==='questions').source_db_id,saved);
    assert.match(source,/encodeURIComponent\(sourceKey\)/);assert.equal(new URL(`/question-bank?src=${encodeURIComponent(result.sourceKey)}`,'http://local').searchParams.get('src'),saved);
});

test('patched operational entrypoints contain no public original upload and all TypeScript copies parse', () => {
    const dir=path.join(__dirname,'../scripts_patched');
    const entries = fs.readdirSync(dir);
    assert.equal(entries.filter(n => n.endsWith('.ts')).length, 8, 'all eight reviewed uploaders must ship');
    assert.equal(entries.filter(n => n.endsWith('.py')).length, 12, 'all twelve reviewed drivers must ship');
    for(const name of fs.readdirSync(dir).filter(n=>n.endsWith('.ts'))) {
        const source=fs.readFileSync(path.join(dir,name),'utf8');
        assert.doesNotMatch(source,/storage\.from\(['"]hwpx['"]\)\.upload/);
        assert.match(source,/await privateOriginalStorage/);assert.match(source,/originals\.upload/);
        assert.deepEqual(ts.transpileModule(source,{reportDiagnostics:true,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).diagnostics,[]);
    }
    assert.match(fs.readFileSync(path.join(dir,'reingest_empty_files.js'),'utf8'),/originals\.download\(f.storage_path\)/);
});

test('server HWPX merger rejects public buckets and invalid source keys before any storage read', async () => {
    const { HwpxMerger } = require('../src/lib/hwpx/merger.ts');
    for (const [bucket,source] of [['hwpx',`raw_uploads/${uuid}.hwpx`],['hwpx-originals','raw_uploads/../../secret.hwpx'],['hwpx-originals','raw_uploads/%2e%2e/secret.hwpx']]) {
        await assert.rejects(HwpxMerger.merge({ templatePath:'unused',outputFilename:'unused.hwpx',bucket,sources:[{ path:source,question_number:1 }] }),/Invalid private original source/);
    }
});
