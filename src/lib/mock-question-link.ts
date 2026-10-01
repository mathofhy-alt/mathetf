import verified from './questions/verified-mock-links.json';
import { questionBankHref } from './discovery';

export function mockQuestionHref(exam: { slug: string; materialDbs?: { id: string }[] }): string | null {
    if ((verified as Record<string, unknown>)[exam.slug]) return questionBankHref({ mock: exam.slug, origin: 'mock' });
    return exam.materialDbs?.length ? questionBankHref({ round: exam.slug, origin: 'mock' }) : null;
}
