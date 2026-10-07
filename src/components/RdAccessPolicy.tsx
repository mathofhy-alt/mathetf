import { Check } from 'lucide-react';
import { FREE_ACCESS_LABEL, FREE_PDF_DAILY_LIMIT, SAVED_EXAM_LIMIT, PERSONAL_DB_FREE_MODE } from '@/lib/config';

/**
 * 2026-10 새 디자인용 이용 범위 안내 — 강사 안내(/teacher)·사용법(/guide#access) 전용.
 * 내용은 옛 AccessPolicy(아직 옛 화면에서 씀)와 같다. 무료 종료일은 쓰지 않는다(FREE_ACCESS_LABEL 그대로).
 */
export default function RdAccessPolicy({ headingId, title = '이용 범위와 파일 형식' }: { headingId: string; title?: string }) {
    const items = [
        '시험지 미리보기 1쪽은 누구나, 전체 쪽은 회원이 볼 수 있습니다.',
        `회원은 제공 회차의 해설 없는 전체 문제 PDF를 무료로 받습니다. 하루 ${FREE_PDF_DAILY_LIMIT}회까지입니다.`,
        '문제+해설 PDF와 HWP는 자료별로 따로 구매합니다.',
        '직접 만든 시험지는 한글 호환 HML로 받고, PDF는 한글에서 저장합니다.',
        `만든 시험지는 최대 ${SAVED_EXAM_LIMIT}개까지 보관됩니다.`,
    ];
    return (
        <div className="rd-tc-access">
            <div className="rd-tc-access-head">
                <h2 id={headingId} className="rd-x-h2">{title}</h2>
                <p className="rd-tc-access-free">{PERSONAL_DB_FREE_MODE ? FREE_ACCESS_LABEL : '구매한 출제 자료와 무료 공개 자료로 시험지를 만들 수 있습니다.'}</p>
            </div>
            <ul className="rd-tc-access-list">
                {items.map((t) => (
                    <li key={t}><Check size={20} aria-hidden="true" /><span>{t}</span></li>
                ))}
            </ul>
        </div>
    );
}
