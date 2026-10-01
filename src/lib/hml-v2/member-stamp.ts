import { escapeXml, validateHml } from './validate';

/** Only annotate metadata: leave all equations, paragraphs and binary images untouched. */
export function stampMemberId(hml: string, email: string | undefined): string {
    if (!email?.trim() || /[\x00-\x1f\x7f]/.test(email)) throw new Error('회원 아이디를 확인하지 못했습니다.');
    validateHml(hml);
    const stamp = `[mathETF member: ${escapeXml(email.trim())}]`;
    const annotate = (value: string) => {
        const original = value.replace(/\s*\[mathETF member: [^\]]*\]/g, '').trimEnd();
        return original ? `${original}\n${stamp}` : stamp;
    };
    let output = hml.replace(/<SHAPEOBJECT\b[^>]*>[\s\S]*?<\/SHAPEOBJECT>/g, shape => {
        if (/<SHAPECOMMENT\b/.test(shape)) return shape.replace(/<SHAPECOMMENT\b[^>]*(?:\/>|>([\s\S]*?)<\/SHAPECOMMENT>)/g,
            (_match, text = '') => `<SHAPECOMMENT>${annotate(text)}</SHAPECOMMENT>`);
        const comment = `<SHAPECOMMENT>${stamp}</SHAPECOMMENT>`;
        return shape.includes('<CAPTION') ? shape.replace('<CAPTION', `${comment}<CAPTION`) : shape.replace('</SHAPEOBJECT>', `${comment}</SHAPEOBJECT>`);
    });
    // Text-only papers still carry the account identity in document metadata.
    output = output.replace(/<DOCSUMMARY\b[^>]*>[\s\S]*?<\/DOCSUMMARY>/, summary => {
        if (/<COMMENTS\b/.test(summary)) return summary.replace(/<COMMENTS\b[^>]*(?:\/>|>([\s\S]*?)<\/COMMENTS>)/,
            (_match, text = '') => `<COMMENTS>${annotate(text)}</COMMENTS>`);
        return summary.replace('</DOCSUMMARY>', `<COMMENTS>${stamp}</COMMENTS></DOCSUMMARY>`);
    });
    if (!output.includes(stamp)) throw new Error('시험지에 회원 정보를 기록하지 못했습니다.');
    validateHml(output);
    return output;
}
