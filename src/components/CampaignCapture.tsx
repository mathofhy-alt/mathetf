'use client';
import {useEffect} from 'react';
import {safeAttribution} from '@/lib/analytics/campaigns';
export default function CampaignCapture(){useEffect(()=>{try{const p=new URLSearchParams(location.search);if(p.has('campaign')||p.has('origin'))sessionStorage.setItem('mathetf_qb_attribution',JSON.stringify(safeAttribution({campaign:p.get('campaign'),origin:p.get('origin')})));}catch{}},[]);return null;}
