import Link from 'next/link';
import {materialReadiness,questionBankHref} from '@/lib/discovery';
import AccessPolicy from './AccessPolicy';
export default function MaterialReady({row,hasDb}:{row:any;hasDb:boolean}){
 const status=materialReadiness(row);
 return <section className="material-ready my-5 rounded-2xl bg-white border p-5 sm:p-6"><h2 className="font-bold">이 자료에서 할 수 있는 일</h2><dl className="grid sm:grid-cols-3 gap-3 mt-3 text-sm"><div><dt>문제 PDF</dt><dd>{status.pdf?'회원 무료 · 하루 10회 한도':'파일 준비 중'}</dd></div><div><dt>시험지 미리보기</dt><dd>{status.preview?'아래에서 확인':'미리보기 준비 중'}</dd></div><div><dt>등록·검수</dt><dd>{status.verified?'등록 자료 검수 완료':'검수 상태 확인 중'}</dd></div></dl><p className="my-3 text-xs text-slate-500">등록 검수와 파일 제공·문항 연결 준비는 서로 다릅니다. 원래 시험 과목: {row.subject||'정보 확인 중'} · 기출 문항의 분류는 현행 교육과정과 다를 수 있습니다.</p>
 {hasDb?<Link className="product-button primary mb-4" href={questionBankHref({material:row.id,origin:'exam'})}>이 회차에서 문항 골라 시험지 만들기</Link>:<p className="my-3 text-sm text-amber-800">이 회차의 문항별 출제 자료는 준비 중입니다. 제공되는 원본 파일을 이용해주세요.</p>}<AccessPolicy compact/></section>;
}
