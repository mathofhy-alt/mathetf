
import fs from 'fs';
import { DOMParser, XMLSerializer } from 'xmldom';

function flattenEndnotes(xml: string, log: (msg: string) => void): string {
    if (!xml.includes('<ENDNOTE')) return xml;

    let match;
    let result = '';
    let lastIndex = 0;
    const endnoteRegex = /<ENDNOTE[^>]*>([\s\S]*?)<\/ENDNOTE>/gi;

    while ((match = endnoteRegex.exec(xml)) !== null) {
        const prefix = xml.slice(lastIndex, match.index);
        result += prefix;

        let content = match[1];

        // [Logic: DOM extraction SAME as route.ts]
        if (content.includes('<PARALIST')) {
            try {
                const doc = new DOMParser().parseFromString(`<WRAP>${content}</WRAP>`, 'text/xml');
                const root = doc.documentElement;
                const paralist = root.getElementsByTagName('PARALIST')[0];
                if (paralist) {
                    const serializer = new XMLSerializer();
                    let innerXml = '';
                    const cleanAttributes = (node: any) => {
                        if (node.nodeType === 1) {
                            node.removeAttribute('Style'); node.removeAttribute('ParaShape'); node.removeAttribute('CharShape');
                            if (node.hasChildNodes()) { for (let j = 0; j < node.childNodes.length; j++) cleanAttributes(node.childNodes[j]); }
                        }
                    };
                    for (let k = 0; k < paralist.childNodes.length; k++) {
                        const child = paralist.childNodes[k];
                        cleanAttributes(child);
                        innerXml += serializer.serializeToString(child);
                    }
                    if (innerXml.trim().length > 0) {
                        log(`[TRACE] Unleashed PARALIST content (Length: ${innerXml.length})`);
                        content = innerXml;
                    }
                }
            } catch (e) { log(`[ERROR] DOMParser Exception: ${e}`); }
        }

        // [FIXED LOGIC starts here]

        // 1. Capture all Open-like CHAR tags (Namespace Aware)
        // Note: tsx might not support matchAll on older node, but we use Array.from if needed, or loop.
        // Node 14+ supports matchAll.
        const charOpenMatches = Array.from(result.matchAll(/<([\w:]*CHAR)\b[^>]*>/g));

        // 2. Count explicitly Self-Closing tags
        const selfClosingMatches = result.match(/<[\w:]*CHAR\b[^>]*\/>/g) || [];
        // 3. Count Closing tags
        const closeMatches = result.match(/<\/[\w:]*CHAR>/g) || [];

        const realOpenCount = charOpenMatches.length - selfClosingMatches.length;
        const closeCount = closeMatches.length;
        const isInsideChar = realOpenCount > closeCount;

        // Determine the actual tag name used
        let validationTagName = 'CHAR';
        if (isInsideChar && charOpenMatches.length > 0) {
            validationTagName = charOpenMatches[charOpenMatches.length - 1][1];
        }

        let breakoutTemplateStart = `</TEXT></P>`;
        let breakoutTemplateEnd = `<P><TEXT>`;

        if (isInsideChar) {
            log(`[TRACE] Endnote found inside <${validationTagName}> (Nesting: ${realOpenCount} vs ${closeCount}). Using Deep Breakout.`);
            breakoutTemplateStart = `</${validationTagName}></TEXT></P>`;
            breakoutTemplateEnd = `<P><TEXT><${validationTagName}>`;
        } else {
            log(`[TRACE] Endnote found outside <CHAR> (Nesting: ${realOpenCount} vs ${closeCount}). Using Standard Breakout.`);
        }

        result += breakoutTemplateStart + content + breakoutTemplateEnd;
        lastIndex = endnoteRegex.lastIndex;
    }

    result += xml.slice(lastIndex);
    return result;
}

async function run() {
    const log = (msg: string) => console.log(msg);

    const namespaceInput = `
    <HP:P>
        <HP:TEXT>
            <HP:CHAR>
                Text Before Endnote
                <ENDNOTE>
                    <PARALIST>
                        <P><TEXT><CHAR>Hidden Content 1</CHAR></TEXT></P>
                    </PARALIST>
                </ENDNOTE>
                Text After Endnote
            </HP:CHAR>
        </HP:TEXT>
    </HP:P>
    `;
    console.log("\n--- Namespace CHAR Test (Fixed) ---");
    const processed = flattenEndnotes(namespaceInput, log);
    console.log("Processed:", processed);

    // Verification
    if (processed.includes('</HP:CHAR>')) {
        console.log("SUCCESS: Detected HP:CHAR closing.");
    } else {
        console.log("FAILURE: Did not close HP:CHAR.");
    }

    if (processed.includes('<HP:CHAR>')) {
        console.log("SUCCESS: Re-opened HP:CHAR.");
    }
}

run();
