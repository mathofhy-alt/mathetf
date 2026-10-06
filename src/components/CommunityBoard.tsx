"use client";
import {useEffect,useMemo,useState} from 'react';
import Link from 'next/link';
import type {User} from '@supabase/supabase-js';
import {Search,X,ChevronRight,FileText,Lock,PenLine} from 'lucide-react';
import {createClient} from '@/utils/supabase/client';
import Header from './Header';
type Entry={id:string;title:string;created_at:string;views:number;author_nickname?:string};
export default function CommunityBoard({kind}:{kind:'notice'|'suggestion'}){
 const notice=kind==='notice';const localPreview=process.env.NEXT_PUBLIC_LOCAL_PREVIEW==='1';const supabase=useMemo(()=>createClient(),[]);
 const [items,setItems]=useState<Entry[]>([]);const [user,setUser]=useState<User|null>(null);const [query,setQuery]=useState('');
 const [state,setState]=useState<'loading'|'ready'|'error'>('loading');const [retry,setRetry]=useState(0);
 useEffect(()=>{let alive=true;const controller=new AbortController();setState('loading');
  // 글 목록은 공개 정보다. 로그인 확인 지연·실패가 목록 표시를 막지 않게 분리한다.
  supabase.auth.getUser().then(auth=>{if(alive)setUser(auth.data.user);}).catch(()=>{if(alive)setUser(null);});
  (async()=>{try{
   let rows:Entry[]=[];
   if(notice){const {data,error}=await supabase.from('notices').select('id,title,created_at,views').order('created_at',{ascending:false});if(error)throw error;rows=data||[];}
   else {const res=await fetch('/api/suggestions',{signal:controller.signal});const result=await res.json();if(!res.ok||!Array.isArray(result.items))throw Error();rows=result.items;}
   if(alive){setItems(rows);setState('ready');}
  }catch{if(alive)setState('error');}})();return()=>{alive=false;controller.abort();};
 },[notice,retry,supabase]);
 const visible=items.filter(item=>item.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
 const date=(value:string)=>new Intl.DateTimeFormat('ko-KR',{year:'numeric',month:'2-digit',day:'2-digit',timeZone:'Asia/Seoul'}).format(new Date(value));
 return <div className="rd rd-x rd-bd"><Header user={user}/>
  <section className="rd-wrap rd-x-top rd-bd-top">
   <nav className="rd-bd-tabs" aria-label="게시판">
    <Link href="/notice" aria-current={notice?'page':undefined}>공지사항</Link>
    <Link href="/suggestion" aria-current={!notice?'page':undefined}>건의사항</Link>
   </nav>
   <div className="rd-bd-head">
    <div className="rd-bd-head-txt">
     <h1 className="rd-x-h1 rd-bd-h1">{notice?'수학ETF의 새로운 소식.':'함께 만드는 수학ETF.'}</h1>
     <p className="rd-lead">{notice?'서비스의 변화와 이용 안내를 차곡차곡 기록합니다.':'불편했던 순간도, 떠오른 아이디어도 들려주세요.'}</p>
    </div>
    {(!notice||user?.email==='mathofhy@naver.com')&&<Link className="rd-btn rd-btn-primary rd-bd-write" href={user?`/${kind}/write`:`/login?next=${encodeURIComponent('/suggestion/write')}`}><PenLine size={18}/>{notice?'공지 작성':'의견 남기기'}</Link>}
   </div>
   {!notice&&<p className="rd-bd-note"><Lock size={16}/><span>제목은 목록에 공개됩니다. 본문은 글 비밀번호로 확인하는 비밀글로 등록됩니다.</span></p>}
   {!notice&&localPreview&&<p role="note" className="rd-bd-note is-warn">이곳은 검토 화면이라 운영 건의사항 글은 표시되지 않습니다. 기존 글은 <a href="https://mathetf.com/suggestion">실제 홈페이지 건의사항</a>에서 확인할 수 있습니다.</p>}
  </section>
  <section className="rd-wrap rd-bd-main" aria-label={notice?'공지사항 목록':'건의사항 목록'}>
   <div className="rd-bd-tools">
    <p className="rd-bd-count">{notice?'공지사항':'건의사항'} <b>{state==='ready'?visible.length:'—'}</b></p>
    <label className="rd-cat-search rd-bd-search"><Search size={18} aria-hidden/><input aria-label="게시글 제목 검색" value={query} onChange={e=>setQuery(e.target.value)} placeholder="제목으로 찾기"/>{query&&<button type="button" aria-label="검색어 지우기" onClick={()=>setQuery('')}><X size={16}/></button>}</label>
   </div>
   {state==='loading'?<div className="rd-bd-empty" role="status"><p>소식을 불러오고 있습니다.</p></div>
   :state==='error'?<div className="rd-bd-empty" role="alert"><FileText size={32} aria-hidden/><h3>목록을 불러오지 못했습니다.</h3><button className="rd-btn rd-btn-gray" onClick={()=>setRetry(n=>n+1)}>다시 불러오기</button></div>
   :!visible.length?<div className="rd-bd-empty"><FileText size={32} aria-hidden/><h3>{query?'검색 결과가 없습니다.':notice?'새로운 소식을 준비하고 있습니다.':'첫 번째 의견을 기다리고 있습니다.'}</h3><p>{query?'다른 제목으로 검색해 보세요.':notice?'새 공지가 등록되면 이곳에서 확인할 수 있습니다.':'더 편리한 수학ETF를 위한 의견을 남겨주세요.'}</p>{query&&<button className="rd-btn rd-btn-gray" onClick={()=>setQuery('')}>전체 글 보기</button>}</div>
   :<ul className="rd-bd-list">{visible.map(item=><li key={item.id}><Link href={`/${kind}/${item.id}`} className="rd-bd-row">
     <div className="rd-bd-row-txt">
      <span className={notice?'rd-bd-tag is-accent':'rd-bd-tag'}>{notice?'공지':<><Lock size={12} aria-hidden/>비밀글</>}</span>
      <h3>{item.title}</h3>
      <p className="rd-bd-meta"><span>{date(item.created_at)}</span><span>조회 {item.views||0}</span>{!notice&&<span>{item.author_nickname||'익명'}</span>}</p>
     </div>
     <ChevronRight size={20} aria-hidden/>
    </Link></li>)}</ul>}
   <div className="rd-bd-links">
    <Link href={notice?'/suggestion':'/notice'} className="rd-link">{notice?'의견 남기러 가기':'공지사항 살펴보기'}</Link>
    <Link href="/guide" className="rd-link">이용 가이드</Link>
   </div>
  </section>
 </div>;
}
