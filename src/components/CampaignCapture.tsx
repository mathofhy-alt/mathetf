'use client';
import {useEffect} from 'react';
import {safeAttribution} from '@/lib/analytics/campaigns';
import {safeSignupAttribution} from '@/lib/analytics/signup-attribution';
export default function CampaignCapture(){useEffect(()=>{try{const p=new URLSearchParams(location.search);if(p.has('campaign')||p.has('origin'))sessionStorage.setItem('mathetf_qb_attribution',JSON.stringify(safeAttribution({campaign:p.get('campaign'),origin:p.get('origin')})));
 const referrer = document.referrer ? new URL(document.referrer).hostname : '';
 const source = p.get('utm_source') || (p.has('kclid') || /(^|\.)kakao\.com$/.test(referrer) ? 'kakao' : null);
 const attribution=safeSignupAttribution({source,medium:p.get('utm_medium'),campaign:p.get('utm_campaign')});
 if(attribution)sessionStorage.setItem('mathetf_signup_attribution',JSON.stringify(attribution));
 }catch{}},[]);return null;}
