
import { DOMParser, XMLSerializer } from 'xmldom';

function sanitizeHmlAttributes(xml: string): string {
    const doc = new DOMParser().parseFromString(`<ROOT>${xml}</ROOT>`, 'text/xml');

    const allowedTags = new Set([
        'P', 'TEXT', 'CHAR', 'EQUATION', 'SHAPEOBJECT', 'SHAPECOMPONENT', 'SHAPECOMMENT',
        'DRAWINGOBJECT', 'AUTONUM', 'AUTONUMFORMAT', 'PARAMARGIN', 'PARABORDER',
        'LEFTBORDER', 'RIGHTBORDER', 'TOPBORDER', 'BOTTOMBORDER',
        'ROTATIONINFO', 'RENDERINGINFO', 'TRANSMATRIX', 'SCAMATRIX', 'ROTMATRIX',
        'IMAGERECT', 'IMAGECLIP', 'INSIDEMARGIN', 'OUTSIDEMARGIN', 'IMAGE', 'EFFECTS', 'SCRIPT',
        'TABLE', 'ROW', 'CELL', 'PARALIST', 'CELLMARGIN', 'POSITION', 'SIZE', 'PICTURE', 'TAB', 'CAPTION',
        'ROOT', 'WRAP', 'ENDNOTE'
    ]);

    const allElements = doc.getElementsByTagName('*');
    for (let i = allElements.length - 1; i >= 0; i--) {
        const el = allElements[i];
        if (el.nodeType === 1) {
            const fullTagName = el.tagName.toUpperCase();
            const localTagName = fullTagName.includes(':') ? fullTagName.split(':')[1] : fullTagName;

            if (localTagName !== 'ROOT' && !allowedTags.has(localTagName)) {
                // Strip unknown
                while (el.firstChild) {
                    el.parentNode?.insertBefore(el.firstChild, el);
                }
                el.parentNode?.removeChild(el);
                continue;
            }

            const tagName = localTagName;

            // [SAFETY] Orphan Wrap logic copied from route.ts
            const needsWrap = (tagName === 'EQUATION' || tagName === 'SHAPEOBJECT' || tagName === 'PICTURE');
            if (needsWrap) {
                const parent = el.parentNode as any;
                const parentTag = parent?.tagName?.toUpperCase();

                // [FIXED LOGIC]
                const isOrphan = ['P', 'TEXT', 'ROOT', 'WRAP'].includes(parentTag);

                if (isOrphan) {
                    const charWrapper = doc.createElement('CHAR');
                    el.parentNode?.insertBefore(charWrapper, el);
                    charWrapper.appendChild(el);
                }
            }
        }
    }
    return new XMLSerializer().serializeToString(doc);
}

const input = `<SHAPEOBJECT><PICTURE/></SHAPEOBJECT>`;
const output = sanitizeHmlAttributes(input);
console.log('Input:', input);
console.log('Output:', output);

if (output.includes('<CHAR><PICTURE')) {
    console.error('FAIL: PICTURE illegally wrapped in CHAR inside SHAPEOBJECT');
}
if (output.includes('<CHAR><SHAPEOBJECT')) {
    console.log('INFO: SHAPEOBJECT wrapped in CHAR (Expected behavior for orphan SHAPEOBJECT)');
}
