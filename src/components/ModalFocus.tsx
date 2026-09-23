'use client';
import {useEffect} from 'react';
/** Shared keyboard focus for the last visible modal. Does not affect ordinary inline panels. */
export default function ModalFocus(){useEffect(()=>{
 let active:HTMLElement|null=null,previous:HTMLElement|null=null;
 const elements=(d:HTMLElement)=>Array.from(d.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]')).filter(e=>e.getClientRects().length>0);
 const refresh=()=>{const dialogs=Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]')).filter(e=>e.getClientRects().length>0);const last=dialogs.at(-1)||null;if(last===active)return;
 if(last){previous=document.activeElement as HTMLElement;active=last;elements(last)[0]?.focus();}else{active=null;if(previous?.isConnected)previous.focus();}};
 const key=(e:KeyboardEvent)=>{if(e.key!=='Tab'||!active)return;const items=elements(active),first=items[0],last=items.at(-1);if(!first){e.preventDefault();return;}if(e.shiftKey&&(document.activeElement===first||!active.contains(document.activeElement))){e.preventDefault();last?.focus();}else if(!e.shiftKey&&(document.activeElement===last||!active.contains(document.activeElement))){e.preventDefault();first.focus();}};
 const observer=new MutationObserver(refresh);observer.observe(document.body,{childList:true,subtree:true});document.addEventListener('keydown',key);refresh();return()=>{observer.disconnect();document.removeEventListener('keydown',key);};
 },[]);return null;}
