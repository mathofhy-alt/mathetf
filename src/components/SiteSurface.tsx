"use client";
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
export default function SiteSurface({ children }: { children: ReactNode }) {
  const raw = usePathname();
  let path=raw;try{path=decodeURIComponent(raw);}catch{}
  const first=path.split('/')[1];
  const surface=path==='/'?'home':first==='question-bank'?'workbench':['mock','모의고사'].includes(first)?'mock':['notice','suggestion'].includes(first)?'community':['login','signup','find-id','forgot-password','update-password','unsubscribe'].includes(first)?'auth':first==='mypage'?'account':['cart','payments'].includes(first)?'commerce':['predict','print-transform'].includes(first)?'tools':first==='admin'?'admin':'library';
  return <main className="site-suite flex-1 w-full flex flex-col" data-surface={surface} data-route={first}>{children}</main>;
}
