import type { PassInfo } from '@/components/question-bank/PassModal';
import { FREE_TRIAL } from './qbPassConfig';

// false 하나로 무료 PDF 뒤 팝업·정답 목적 안내·완성 창 강조를 이전 표시로 되돌린다.
export const ROLE_CTA_V2 = true;
export type ProfilePersona = 'student' | 'parent' | 'teacher' | 'unknown';
export const profilePersona = (value: unknown): ProfilePersona =>
    value === 'student' || value === 'parent' || value === 'teacher' ? value : 'unknown';

export function rolePromoActions(role: ProfilePersona, src: string, createHref: string, paidHref?: string) {
    const base = `/question-bank?src=${encodeURIComponent(src)}&origin=free-pdf`;
    return {
        purchase: role !== 'teacher' && paidHref ? paidHref : null,
        answer: role !== 'teacher' ? `${base}&intent=answer` : null,
        create: role === 'teacher' || role === 'unknown' ? createHref : null,
        similar: `${base}&variant=similar1`,
    };
}

/** 기존 저장 처리와 같은 순서: 무제한 → 주 무료 → 시험대비권 → 1장권. */
export function answerUsage(p: PassInfo | null): { label: string; notice: string } {
    if (!p) return { label: '이용 현황 확인', notice: '저장 시 이용 현황을 다시 확인합니다.' };
    if (p.unlimited || p.passUntil || p.admin) return {
        label: p.passUntil ? '강사 이용권 사용' : '저장 횟수 제한 없음',
        notice: p.passUntil ? '강사 이용권으로 저장합니다. 무료 횟수는 사용하지 않습니다.' : '저장 횟수 제한 없이 이용할 수 있습니다.',
    };
    if (p.freeExamLeft > 0) return {
        label: `주 ${FREE_TRIAL.exam}회`,
        notice: `이번 주 무료 ${p.freeExamLeft}회 남음 중 저장 시 1회를 사용합니다.`,
    };
    if (p.examUntil && p.examLeft > 0) return {
        label: '시험대비권 사용', notice: `시험대비권 ${p.examLeft}건 남음 중 저장 시 1건을 사용합니다.`,
    };
    if (p.sheetLeft > 0) return {
        label: '시험지 1장권 사용', notice: `시험지 1장권 ${p.sheetLeft}장 남음 중 저장 시 1장을 사용합니다.`,
    };
    return { label: '이용권 필요', notice: '이번 주 무료 횟수를 모두 사용했습니다. 저장하려면 이용권이 필요합니다.' };
}

export function answerLinkLabel(p: PassInfo | null): string {
    const usage = answerUsage(p);
    const free = !!p && !p.unlimited && !p.passUntil && !p.admin && p.freeExamLeft > 0;
    return `${free ? '무료로 ' : ''}정답·해설 PDF 만들기 (${usage.label})`;
}

export function isAnswerEntry(params: URLSearchParams, enabled = ROLE_CTA_V2): boolean {
    return enabled && params.get('intent') === 'answer' && !!params.get('src') && !params.has('variant');
}

export const ANSWER_CONTENT_NOTICE = '원본에 포함된 정답·해설만 제공됩니다. 일부 문항에는 없을 수 있습니다.';

export function answerExamTitle(src: string, question: Record<string, any> = {}): string {
    const [sourceSchool, sourceYear, term = '', ...rest] = src.split('_');
    const school = question.school || sourceSchool;
    const year = question.year || question.exam_year || sourceYear;
    const semester = String(question.semester || term).match(/([12])(?:학기)?/);
    const grade = String(question.grade || rest.find(s => /학년/.test(s)) || '').match(/[123]/)?.[0];
    const exam = `${term} ${question.semester || ''}`.match(/중간|기말/)?.[0] || '';
    const subject = question.subject || rest.filter(s => !/학년/.test(s)).join(' ');
    const gradeTerm = [grade ? `${grade}학년` : '', semester ? `${semester[1]}학기` : ''].filter(Boolean).join('-');
    const label = [school, year, gradeTerm, exam, subject].filter(Boolean).join(' ') || '시험지';
    return `${label.slice(0, 94)} 정답·해설`;
}

export const promoV2Title = (src: string, role: ProfilePersona, action: string) => `v2|${role}|${action}|${src}`;
