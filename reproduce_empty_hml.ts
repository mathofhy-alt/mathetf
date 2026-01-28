
import fs from 'fs';
import path from 'path';
import { DOMParser, XMLSerializer } from 'xmldom';
import { generateHmlFromTemplate } from './src/lib/hml-v2/generator';

// [COPIED FROM route.ts]
function sanitizeHmlAttributes(xmlContent: string, log: (msg: string) => void): string {
    try {
        // Pre-escape naked ampersands that aren't entities (prevents parser crash)
        const escapedContent = xmlContent.replace(/&(?!(amp|lt|gt|quot|apos|#\d+|#x[a-fA-F0-9]+);)/g, '&amp;');
        const doc = new DOMParser().parseFromString(`<ROOT>${escapedContent}</ROOT>`, 'text/xml');
        let elements = doc.getElementsByTagName('*');

        // [CRITICAL FIX] Nuclear Unwrapping: Remove document-level wrappers if they exist in DB content
        // Tags to completely remove while keeping children: HWPML, BODY, SECTION
        const docLevelTags = new Set(['HWPML', 'BODY', 'SECTION']);
        for (let i = elements.length - 1; i >= 0; i--) {
            const el = elements[i];
            const tagNameFull = el.tagName.toUpperCase();
            const localName = tagNameFull.includes(':') ? tagNameFull.split(':')[1] : tagNameFull;
            if (docLevelTags.has(localName)) {
                log(`[NUCLEAR] Stripping document-level wrapper <${el.tagName}>.`);
                while (el.firstChild) { el.parentNode?.insertBefore(el.firstChild, el); }
                el.parentNode?.removeChild(el);
            }
        }

        // Re-fetch all elements after unwrapping
        const allElements = doc.getElementsByTagName('*');

        // Strict Whitelist of Allowed HML Body Tags
        const allowedTags = new Set([
            'P', 'TEXT', 'CHAR', 'EQUATION', 'SHAPEOBJECT', 'SHAPECOMPONENT', 'SHAPECOMMENT',
            'DRAWINGOBJECT', 'AUTONUM', 'AUTONUMFORMAT', 'PARAMARGIN', 'PARABORDER',
            'LEFTBORDER', 'RIGHTBORDER', 'TOPBORDER', 'BOTTOMBORDER',
            'ROTATIONINFO', 'RENDERINGINFO', 'TRANSMATRIX', 'SCAMATRIX', 'ROTMATRIX',
            'IMAGERECT', 'IMAGECLIP', 'INSIDEMARGIN', 'OUTSIDEMARGIN', 'IMAGE', 'EFFECTS', 'SCRIPT',
            'TABLE', 'ROW', 'CELL', 'PARALIST', 'CELLMARGIN', 'POSITION', 'SIZE', 'PICTURE', 'TAB', 'CAPTION',
            'ROOT', 'WRAP', // Internal wrappers
            'ENDNOTE' // [CRITICAL] Allow ENDNOTE so we can sanitize inside it before flattening
        ]);
        // [SAFETY] Stripped: SECDEF, COLDEF, PAGEDEF, HEADER, FOOTER (Handled by template)

        // Iterate backwards so we can safely delete nodes
        for (let i = allElements.length - 1; i >= 0; i--) {
            const el = allElements[i];
            if (el.nodeType === 1) { // Element
                // [FIX] Prefix-insensitive tag name extraction
                const fullTagName = el.tagName.toUpperCase();
                const localTagName = fullTagName.includes(':') ? fullTagName.split(':')[1] : fullTagName;

                // 1. Tag Whitelist Check
                if (localTagName !== 'ROOT' && !allowedTags.has(localTagName)) {
                    log(`[WARN] Stripping Unknown Tag <${fullTagName}> (Keep children).`);
                    // Unwrap children (replace node with its children)
                    while (el.firstChild) {
                        el.parentNode?.insertBefore(el.firstChild, el);
                    }
                    el.parentNode?.removeChild(el);
                    continue; // Node is gone, next
                }

                const tagName = localTagName;

                // 2. Attribute Blacklist Check
                const attrsToRemove = [];
                for (let j = 0; j < el.attributes.length; j++) {
                    const attr = el.attributes[j];
                    const name = attr.name;
                    // [CRITICAL FIX] DO NOT strip BinData or ImageID. They are vital for image and equation display.
                    // We only strip Style-related attributes that we regnerate in generator.ts
                    if (name.match(/^(Style|ParaShape|CharShape|FaceName|BorderFill)$/i)) {
                        attrsToRemove.push(name);
                    }
                }
                if (attrsToRemove.length > 0) {
                    attrsToRemove.forEach(attrName => el.removeAttribute(attrName));
                }

                // [SAFETY] Inject Default Attributes for P (Paragraph) tags if missing
                // Naked <P> tags might crash Hancom. We must ensure they have safe defaults.
                if (tagName === 'P') {
                    if (!el.getAttribute('ParaShape')) el.setAttribute('ParaShape', '0');
                    if (!el.getAttribute('Style')) el.setAttribute('Style', '0');
                }

                // [SAFETY] Orphan Wrap: Ensure SHAPEOBJECT, EQUATION, and PICTURE are inside CHAR
                // But only if they are directly inside TEXT or P (orphans).
                // They MUST NOT be wrapped in CHAR if they are inside TABLE or EQUATION.
                const needsWrap = (tagName === 'EQUATION' || tagName === 'SHAPEOBJECT' || tagName === 'PICTURE');
                if (needsWrap) {
                    const parent = el.parentNode as any;
                    const parentTag = parent?.tagName?.toUpperCase();
                    if (parentTag === 'TEXT' || parentTag === 'P') {
                        // Create CHAR wrapper
                        const charWrapper = doc.createElement('CHAR');
                        el.parentNode?.insertBefore(charWrapper, el);
                        charWrapper.appendChild(el);
                    }
                }
            }
        }
        const serializer = new XMLSerializer();
        let serialized = serializer.serializeToString(doc);

        // [v20.0] Robust ROOT Stripping: Universal whitespace and case handling
        serialized = serialized.replace(/^\s*<ROOT[^>]*>/i, '').replace(/<\/ROOT>\s*$/i, '');

        // [SAFETY] Post-Processing:
        // 1. Strip Control Characters (Low ASCII) which crash Hancom
        serialized = serialized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');

        // [v19.0/v20.0] Forced Expansion: Standard layout tags MUST be expanded for Hancom visibility
        serialized = serialized.replace(/<(P|TEXT|CHAR|TABLE|ROW|CELL|PARALIST|SHAPEOBJECT|PICTURE|EQUATION|COLUMNLINE)\b([^>]*)\/>/gi, '<$1$2></$1>');

        return serialized;
    } catch (e) {
        log(`[ERROR] DOM Sanitization Failed: ${e}. Returning original.`);
        return xmlContent;
    }
}

async function run() {
    const templatePath = path.join(process.cwd(), '재조립양식.hml');
    if (!fs.existsSync(templatePath)) {
        console.error("Template not found!");
        return;
    }
    const templateContent = fs.readFileSync(templatePath, 'utf-8');

    // 1. Test Key: Malformed Input (simulating potential DB issue)
    // Case A: Normal content
    const caseA = `<P ParaShape="0" Style="0"><TEXT CharShape="0"><CHAR>Case A: Normal Content</CHAR></TEXT></P>`;

    // Case B: Naked Text
    const caseB = `Case B: Just Text`;

    // Case C: HWPML Wrapper (Should be stripped)
    const caseC = `<HWPML><BODY><SECTION><P><TEXT><CHAR>Case C: Wrapped</CHAR></TEXT></P></SECTION></BODY></HWPML>`;

    // Case D: Unknown Tags (Should be stripped but content kept)
    const caseD = `<DIV>Case D: Div Content</DIV>`;

    const questions = [
        { id: 'cA', content: caseA },
        { id: 'cB', content: caseB },
        { id: 'cC', content: caseC },
        { id: 'cD', content: caseD },
    ];

    const questionsWithImages = questions.map((q, idx) => {
        let content = q.content;
        console.log(`\n--- Processing ${q.id} ---`);
        content = sanitizeHmlAttributes(content, console.log);
        console.log(`Sanitized ${q.id}:`, content);

        // Logic from route.ts (roughly)
        if (content.length > 0 && !content.startsWith('<P')) {
            content = `<P ParaShape="0" Style="0"><TEXT CharShape="0"><CHAR>${content}</CHAR></TEXT></P>`;
        }

        return {
            question: { content_xml: content, id: q.id, question_number: idx + 1 },
            images: []
        };
    });

    const result = generateHmlFromTemplate(templateContent, questionsWithImages);
    fs.writeFileSync('reproduce_empty_output.hml', result.hmlContent);
    console.log(`\nGenerated reproduce_empty_output.hml (${result.hmlContent.length} bytes)`);

    // Check if content is actually in the file
    if (result.hmlContent.includes('Case A') && result.hmlContent.includes('Case C') && result.hmlContent.includes('Case D')) {
        console.log("SUCCESS: Content found in output.");
    } else {
        console.log("FAILURE: Content MISSING in output.");
    }
}

run();
