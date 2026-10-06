"use client";
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
export default function SiteSurface({ children }: { children: ReactNode }) {
  const raw = usePathname();
  let path=raw;try{path=decodeURIComponent(raw);}catch{}
  const first=path.split('/')[1];
  // 시험지 상세는 새 디자인(.rd) — 옛 'library' 강제 규칙(h1 굵기·main 여백·모서리)이 이기지 않게 표면을 따로 둔다(10/7)
  const surface=path==='/'?'home':['exam','school','mock','모의고사','schools','region','지역','login','signup','find-id','forgot-password','update-password','unsubscribe','mypage','cart','payments','teacher','guide'].includes(first)?'redesign':first==='question-bank'?'workbench':['mock','모의고사'].includes(first)?'mock':['notice','suggestion'].includes(first)?'community':['login','signup','find-id','forgot-password','update-password','unsubscribe'].includes(first)?'auth':first==='mypage'?'account':['cart','payments'].includes(first)?'commerce':['predict','print-transform'].includes(first)?'tools':first==='admin'?'admin':'library';
  return <main className="site-suite flex-1 w-full flex flex-col" data-surface={surface} data-route={first}>{children}</main>;
}
