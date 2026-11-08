// Offline browser geometry check; no development server or live service is used.
const {spawn}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path'),a=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const out=process.argv[2];if(!out)throw Error('output directory required');
const profile=path.join(out,'layout5-cdp-profile');fs.mkdirSync(profile,{recursive:true});
try{fs.unlinkSync(path.join(profile,'DevToolsActivePort'));}catch{}
const browser=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',[
 '--headless','--disable-gpu','--no-first-run','--disable-background-networking','--disable-extensions','--disable-sync',
 '--remote-debugging-address=127.0.0.1','--remote-debugging-port=0','--user-data-dir='+profile,
 pathToFileURL(path.join(out,'layout5.html')).href,
],{windowsHide:true,stdio:'ignore'});
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let ws;
(async()=>{
 try{
  let port;
  for(let i=0;i<100;i++){try{port=Number(fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0]);break;}catch{await pause(100);}}
  a(port,'browser must start');
  let target;
  for(let i=0;i<50;i++){
   target=(await fetch(`http://127.0.0.1:${port}/json/list`).then(r=>r.json())).find(t=>t.type==='page'&&t.url.includes('layout5.html'));
   if(target)break;await pause(100);
  }
  a(target,'local fixture must load');
  ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
  let seq=0;const pending=new Map();
  ws.onmessage=e=>{const msg=JSON.parse(e.data);if(msg.id){const p=pending.get(msg.id);pending.delete(msg.id);msg.error?p.reject(Error(JSON.stringify(msg.error))):p.resolve(msg.result);}};
  const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
  await call('Emulation.setDeviceMetricsOverride',{width:390,height:900,deviceScaleFactor:1,mobile:true});
  await pause(100);
  const {result}=await call('Runtime.evaluate',{returnByValue:true,expression:`(()=>{
   const area=document.querySelector('.rd'), go=document.querySelector('.rd-qb-bar-go'),line=document.querySelector('.rd-qb-passline');
   const box=area.getBoundingClientRect(),g=go.getBoundingClientRect(),l=line.getBoundingClientRect();
   const metrics={viewport:innerWidth,width:box.width,buttonLeft:g.left,buttonRight:g.right,lineRight:l.right,scrollWidth:area.scrollWidth,
    passed:innerWidth===390&&g.left>=box.left&&g.right<=box.right&&l.right<=box.right&&area.scrollWidth<=box.width};
   document.querySelector('#result').textContent=JSON.stringify(metrics);return metrics;
  })()`});
  fs.writeFileSync(path.join(out,'layout5.json'),JSON.stringify(result.value,null,2));
  const shot=await call('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,'layout5.png'),Buffer.from(shot.data,'base64'));
  a.equal(result.value.passed,true,JSON.stringify(result.value));console.log(JSON.stringify(result.value));
  await call('Browser.close').catch(()=>{});
 }finally{ws?.close();browser.kill();}
})().catch(e=>{console.error(e);process.exitCode=1;});
