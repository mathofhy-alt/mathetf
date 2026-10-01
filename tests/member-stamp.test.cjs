require('./register.cjs');
const {test}=require('node:test'), a=require('node:assert/strict');
const {DOMParser}=require('xmldom');
const {stampMemberId}=require('../src/lib/hml-v2/member-stamp.ts');
const wrap=body=>`<?xml version="1.0"?><HWPML><HEAD><DOCSUMMARY><COMMENTS>original</COMMENTS></DOCSUMMARY></HEAD><BODY><SECTION>${body}</SECTION></BODY></HWPML>`;
test('stamps every object, preserves original descriptions and is idempotent',()=>{
 const xml=wrap('<EQUATION><SHAPEOBJECT><SIZE/><SHAPECOMMENT>수식 설명</SHAPECOMMENT><CAPTION/></SHAPEOBJECT><SCRIPT>x&lt;2</SCRIPT></EQUATION><PICTURE><SHAPEOBJECT><SIZE/><SHAPECOMMENT /></SHAPEOBJECT></PICTURE><TABLE><SHAPEOBJECT><SIZE/><CAPTION/></SHAPEOBJECT></TABLE>');
 const out=stampMemberId(xml,'teacher@example.com');
 a.equal((out.match(/teacher@example.com/g)||[]).length,4);
 a(out.includes('수식 설명\n[mathETF member: teacher@example.com]'));
 a(out.includes('<SCRIPT>x&lt;2</SCRIPT>'));
 a.equal(stampMemberId(out,'teacher@example.com'),out);
 const changed=stampMemberId(out,'next@example.com');a(!changed.includes('teacher@example.com'));
});
test('text-only files, XML-sensitive identities and missing authentication',()=>{
 const out=stampMemberId(wrap('<P><TEXT><CHAR>시험지</CHAR></TEXT></P>'),'a&b@example.com');
 const doc=new DOMParser().parseFromString(out,'text/xml');
 a(doc.getElementsByTagName('COMMENTS')[0].textContent.includes('a&b@example.com'));
 a(out.includes('<CHAR>시험지</CHAR>'));
 a.throws(()=>stampMemberId(wrap(''),undefined));a.throws(()=>stampMemberId('<broken>','a@b.com'));
});
test('real mathETF fixture keeps every byte outside metadata unchanged',()=>{
 const fs=require('fs');const xml=fs.readFileSync(require('path').join(__dirname,'../verify_output.hml'),'utf8');
 const strip=s=>s.replace(/<SHAPECOMMENT\b[^>]*(?:\/>|>[\s\S]*?<\/SHAPECOMMENT>)/g,'').replace(/<COMMENTS\b[^>]*(?:\/>|>[\s\S]*?<\/COMMENTS>)/g,'');
 const out=stampMemberId(xml,'stamp-test@example.com');a.equal(strip(out),strip(xml));
 a.equal(stampMemberId(out,'stamp-test@example.com'),out);
});
