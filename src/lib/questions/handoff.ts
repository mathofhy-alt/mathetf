import {DRAFT_KEY,parseDraft} from './draft';
export function sendToExamCart(ids:string[],title:string,origin:'predict'|'print'){
 const unique=[...new Set(ids)].slice(0,50);if(!unique.length)throw Error('문항을 먼저 선택해주세요.');
 const old=parseDraft(localStorage.getItem(DRAFT_KEY));
 if(old?.cartIds.length&&!confirm('기존에 담은 문항을 선택한 결과로 바꾸시겠습니까?'))return;
 localStorage.setItem(DRAFT_KEY,JSON.stringify({version:1,updatedAt:Date.now(),cartIds:unique,selectedDbIds:[],excludedQuestionIds:[],selectedExamIds:[],filters:null,title:title.slice(0,100),questionsPerColumn:2,viewMode:'review',autoOpen:false}));
 window.location.href=`/question-bank?resume=1&origin=${origin}`;
}
