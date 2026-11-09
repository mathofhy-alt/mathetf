'use client';

import type { PassInfo } from './PassModal';
import { ANSWER_CONTENT_NOTICE, answerUsage } from '@/lib/role-cta';

export default function AnswerPdfBanner({ info, disabled, onGenerate }: { info: PassInfo | null; disabled: boolean; onGenerate: () => void }) {
    return <section aria-label="정답·해설 PDF 안내" className="rd-answer-pdf">
        <p>정답·해설이 포함된 PDF는 아래 버튼을 눌러 저장한 뒤 받을 수 있습니다. <span role="status">{answerUsage(info).notice}</span></p>
        <button type="button" className="rd-btn rd-btn-primary rd-btn-block" disabled={disabled} onClick={onGenerate}>이대로 정답·해설 PDF 받기</button>
        <small>{ANSWER_CONTENT_NOTICE}</small>
    </section>;
}
