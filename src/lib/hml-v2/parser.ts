/**
 * HML V2 Parser (Template-Based Implementation)
 * 
 * Extracts questions and images from HML files.
 * 
 * Key HML Structure (discovered from user-provided file):
 * - HEAD > MAPPINGTABLE > BINDATALIST > BINITEM (image metadata)
 * - BODY > SECTION > P (content with PICTURE > IMAGE tags)
 * - TAIL > BINDATASTORAGE > BINDATA (Base64 image data)
 */

import { DOMParser, XMLSerializer } from 'xmldom';
import type { ExtractedImage, ExtractedQuestion, ParseResult } from './types';

/**
 * Parse an HML file and extract questions with their images
 */
export function parseHmlV2(hmlContent: string): ParseResult {
    if (!hmlContent || hmlContent.trim().length === 0) {
        return { questions: [], images: [], headXml: undefined };
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(hmlContent, 'text/xml');

    console.log(`[HML-V2 Parser] Root element: ${doc.documentElement?.tagName}`);
    if (!doc.documentElement) {
        console.error('[HML-V2 Parser] XML Parsing failed: Document has no root element.');
    }

    // Step 1: Extract all binary data from TAIL > BINDATASTORAGE
    const images = extractImages(doc);
    console.log(`[HML-V2 Parser] Extracted ${images.length} images`);

    // Step 2: Extract image metadata from HEAD > MAPPINGTABLE > BINDATALIST
    const imageMetaMap = extractImageMetadata(doc);
    console.log(`[HML-V2 Parser] Found ${imageMetaMap.size} BINITEM entries`);

    // NEW: Extract Style Name mappings from HEAD > MAPPINGTABLE > STYLELIST
    const styleNameMap = extractStyleNames(doc);
    console.log(`[HML-V2 Parser] Found ${styleNameMap.size} Style Name entries`);

    // Step 3: Merge metadata into images
    images.forEach(img => {
        const meta = imageMetaMap.get(img.binId);
        if (meta) {
            img.format = meta.format.toLowerCase();
        }
    });

    // NEW: Extract BorderFill definitions
    const borderFillMap = extractBorderFills(doc);
    console.log(`[HML-V2 Parser] Found ${borderFillMap.size} BorderFill definitions`);

    // NEW: Extract ParaShape Alignments
    const paraAlignMap = extractParaAligns(doc);
    console.log(`[HML-V2 Parser] Found ${paraAlignMap.size} ParaShape Alignments`);

    // NEW: Extract BINITEM Index Map (Index -> BinDataId)
    const binItemMap = extractBinItemMap(doc);
    console.log(`[HML-V2 Parser] Found ${binItemMap.size} BINITEM mappings`);

    // Step 4: Extract questions from BODY
    const questions = extractQuestions(doc, styleNameMap, borderFillMap, paraAlignMap, images, binItemMap);
    console.log(`[HML-V2 Parser] Extracted ${questions.length} questions`);

    return { questions, images };
}

/**
 * Helper to get elements by tag name considering namespace
 */
function getTags(parent: Document | Element, tagName: string): Element[] {
    const combined = new Set<Element>();
    const names = [tagName, `hp:${tagName.toLowerCase()}`, `hp:${tagName.toUpperCase()}`];
    for (const name of names) {
        const els = parent.getElementsByTagName(name);
        for (let i = 0; i < els.length; i++) combined.add(els[i]);
    }
    return Array.from(combined);
}

function extractBinItemMap(doc: Document): Map<string, string> {
    const map = new Map<string, string>();
    const binItems = getTags(doc, 'BINITEM');
    for (let i = 0; i < binItems.length; i++) {
        const binDataId = binItems[i].getAttribute('BinData');
        if (binDataId) {
            map.set(String(i + 1), binDataId);
        }
    }
    return map;
}

function extractBorderFills(doc: Document): Map<string, string> {
    const borderMap = new Map<string, string>();
    const borderFills = getTags(doc, 'BORDERFILL');
    const serializer = new XMLSerializer();

    for (const bf of borderFills) {
        const id = bf.getAttribute('Id');
        if (id) {
            const cloned = bf.cloneNode(true) as Element;
            cloned.removeAttribute('Id');
            const xml = serializer.serializeToString(cloned);
            const cleanXml = xml.replace(/\sxmlns(:[a-z0-9]+)?="[^"]*"/gi, '');
            borderMap.set(id, cleanXml);
        }
    }
    return borderMap;
}

function extractParaAligns(doc: Document): Map<string, string> {
    const paraMap = new Map<string, string>();
    const paraShapes = getTags(doc, 'PARASHAPE');
    for (const ps of paraShapes) {
        const id = ps.getAttribute('Id');
        const align = ps.getAttribute('Align');
        if (id && align) paraMap.set(id, align);
    }
    return paraMap;
}

function extractImages(doc: Document): ExtractedImage[] {
    const images: ExtractedImage[] = [];
    const binDataElements = getTags(doc, 'BINDATA');

    for (let i = 0; i < binDataElements.length; i++) {
        const el = binDataElements[i];
        const id = el.getAttribute('Id') || String(i + 1);
        const rawBase64 = el.textContent || '';
        const cleanBase64 = rawBase64.replace(/[^A-Za-z0-9+/=]/g, '');
        const sizeBytes = Math.floor(cleanBase64.length * 3 / 4);

        images.push({
            binId: id,
            format: 'jpg',
            data: cleanBase64,
            sizeBytes
        });
    }
    return images;
}

function extractImageMetadata(doc: Document): Map<string, { format: string; type: string }> {
    const metaMap = new Map<string, { format: string; type: string }>();
    const binItems = getTags(doc, 'BINITEM');

    for (let i = 0; i < binItems.length; i++) {
        const item = binItems[i];
        const binDataId = item.getAttribute('BinData') || String(i + 1);
        const format = item.getAttribute('Format') || 'jpg';
        const type = item.getAttribute('Type') || 'Embedding';
        metaMap.set(binDataId, { format, type });
    }
    return metaMap;
}

function extractStyleNames(doc: Document): Map<string, string> {
    const styleMap = new Map<string, string>();
    const styles = getTags(doc, 'STYLE');

    for (const style of styles) {
        const id = style.getAttribute('Id');
        const name = style.getAttribute('Name');
        if (id && name) {
            styleMap.set(id, name);
        }
    }
    return styleMap;
}

/**
 * Extract questions from BODY > SECTION
 * 
 * Splits content by question numbering patterns (ENDNOTE with Number attribute)
 */
function extractQuestions(
    doc: Document,
    styleMap: Map<string, string>,
    borderFillMap: Map<string, string>,
    paraAlignMap: Map<string, string>,
    images: ExtractedImage[],
    binItemMap: Map<string, string>
): ExtractedQuestion[] {
    const questions: ExtractedQuestion[] = [];
    const serializer = new XMLSerializer();

    const body = doc.getElementsByTagName('BODY')[0] || doc.getElementsByTagName('hp:body')[0];
    console.log(`[HML-V2 Parser] BODY found: ${!!body}`);
    if (!body) {
        console.warn('[HML-V2 Parser] No BODY/hp:body element found. Trying documentElement...');
    }

    const section = body?.getElementsByTagName('SECTION')[0] || body?.getElementsByTagName('hp:section')[0] || body;
    console.log(`[HML-V2 Parser] SECTION found: ${!!section}`);
    if (!section) {
        console.warn('[HML-V2 Parser] No SECTION/hp:section/BODY element found');
        return [];
    }

    // Find all paragraphs/elements that could hold a question boundary
    const allElements: Element[] = [];
    const childNodes = section.childNodes;
    for (let i = 0; i < childNodes.length; i++) {
        const node = childNodes[i];
        if (node.nodeType === 1) {
            const el = node as Element;
            const tName = el.tagName.toUpperCase().replace('HP:', '');
            // If it's a paragraph or table, add it
            if (['P', 'TABLE'].includes(tName)) {
                allElements.push(el);
            } else {
                // If it's a container (like a sub-section or list), we might need to go deeper
                // For now, let's keep it robust by including it.
                allElements.push(el);
            }
        }
    }

    console.log(`[HML-V2 Parser] Found ${allElements.length} meaningful elements`);

    // Find question boundaries
    const startIndices: number[] = [];
    const extractedNumbers: Map<number, number> = new Map(); // Index -> Extracted Number

    for (let i = 0; i < allElements.length; i++) {
        const el = allElements[i];
        const tName = el.tagName.toUpperCase().replace('HP:', '');

        let hasQuestionBoundary = false;
        let foundNumber: number | null = null;

        // 1. Standard HWP Boundary: ENDNOTE with AUTONUM
        const endnotes = getTags(el, 'ENDNOTE');
        for (const en of endnotes) {
            const autonums = getTags(en, 'AUTONUM');
            if (autonums.length > 0) {
                const numAttr = autonums[0].getAttribute('Number');
                if (numAttr) {
                    hasQuestionBoundary = true;
                    foundNumber = parseInt(numAttr, 10);
                    break;
                }
            }
        }

        // 2. Style-Based Boundary (Kyunggi Girls/Sookmyung Style)
        if (!hasQuestionBoundary && tName === 'P') {
            const styleId = el.getAttribute('Style');
            const styleName = styleId ? (styleMap.get(styleId) || '') : '';

            if (styleName === '문항_스타일1' || styleName === '문제1') {
                const pText = getPlainText([el]);
                // Regex for numbers like "6.", "6)", "⑥", "6번"
                const match = pText.match(/^(\d+)([\.\)]|번)?/);
                const circleMatch = pText.match(/^([\u2460-\u2473])/);

                if (match) {
                    hasQuestionBoundary = true;
                    foundNumber = parseInt(match[1], 10);
                } else if (circleMatch) {
                    hasQuestionBoundary = true;
                    // Map circle numbers index if needed, but for now just count
                    foundNumber = circleMatch[0].charCodeAt(0) - 0x2460 + 1;
                }
            }
        }

        if (hasQuestionBoundary) {
            startIndices.push(i);
            if (foundNumber !== null) {
                extractedNumbers.set(i, foundNumber);
                console.log(`[HML-V2 Parser] Question boundary at Index[${i}] with Number: ${foundNumber}`);
            } else {
                console.log(`[HML-V2 Parser] Question boundary at Index[${i}] (Implicit Number)`);
            }
        }
    }

    console.log(`[HML-V2 Parser] Found ${startIndices.length} question boundaries`);

    // If no questions found, treat entire content as one question
    if (startIndices.length === 0) {
        let questionMathCounter = 0;
        const contentXml = allElements.map(el => {
            const clonedEl = el.cloneNode(true) as Element;

            // Tag with local IDs even in single-question mode
            const eqTags = getTags(clonedEl, 'EQUATION');
            for (let j = 0; j < eqTags.length; j++) {
                eqTags[j].setAttribute('data-hml-math-id', `MATH_Q1_${questionMathCounter++}`);
            }

            tagSemanticRole(clonedEl, styleMap);
            cleanStyleAttributes(clonedEl, borderFillMap, paraAlignMap);
            return serializer.serializeToString(clonedEl);
        }).join('');

        const imageRefs = extractImageRefs(contentXml, binItemMap);
        const equationScripts = extractEquationScripts(allElements);

        // NEW: Bundle binaries into contentXml for web preview fidelity (stowaway pattern)
        let bundledXml = contentXml;
        if (imageRefs.length > 0) {
            const bundledBinaries = imageRefs.map(ref => {
                const img = images.find(i => i.binId === ref);
                return img ? { id: img.binId, data: img.data, type: img.format } : null;
            }).filter(Boolean);

            if (bundledBinaries.length > 0) {
                const binaryJson = JSON.stringify(bundledBinaries);
                const encoded = Buffer.from(binaryJson).toString('base64');
                bundledXml = `<?antigravity-binaries data="${encoded}"?>\n` + bundledXml;
            }
        }

        questions.push({
            questionNumber: 1,
            contentXml: bundledXml,
            plainText: getPlainText(allElements).slice(0, 300),
            imageRefs,
            equationScripts
        });
        return questions;
    }

    // Split by question boundaries
    for (let i = 0; i < startIndices.length; i++) {
        const startIdx = startIndices[i];
        const endIdx = startIndices[i + 1] ?? allElements.length;

        // Get all elements for this question
        const rawElements = allElements.slice(startIdx, endIdx);

        // Find last meaningful element (trim trailing empty/정답 ones)
        let lastMeaningfulIdx = rawElements.length - 1;
        while (lastMeaningfulIdx >= 0) {
            const el = rawElements[lastMeaningfulIdx];
            const text = (el.textContent || '').trim();

            // Check if element has any content
            const hasVisualContent = text.length > 0 ||
                getTags(el, 'PICTURE').length > 0 ||
                getTags(el, 'EQUATION').length > 0 ||
                getTags(el, 'TABLE').length > 0;

            // Stop if we find meaningful content (but skip "정답" only)
            if (hasVisualContent && text !== '정답' && text !== '답') {
                break;
            }
            lastMeaningfulIdx--;
        }

        const questionElements = rawElements.slice(0, lastMeaningfulIdx + 1);

        // Skip if no content at all
        if (questionElements.length === 0) {
            console.log(`[HML-V2 Parser] Skipping empty question at index ${i}`);
            continue;
        }

        let questionMathCounter = 0;
        const contentXml = questionElements.map(el => {
            // Clone the node to avoid modifying the original DOM during cleanup
            const clonedEl = el.cloneNode(true) as Element;

            // V23: Unified Single-Index Mapping (Force 1:1 match with route.ts loop)
            const eqTags = getTags(clonedEl, 'EQUATION');
            for (let j = 0; j < eqTags.length; j++) {
                eqTags[j].setAttribute('data-hml-math-id', `MATH_${questionMathCounter++}`);
            }

            // Cleanup style attributes to prevent rendering issues in target HML
            tagSemanticRole(clonedEl, styleMap);
            cleanStyleAttributes(clonedEl, borderFillMap, paraAlignMap);

            return serializer.serializeToString(clonedEl);
        }).join('\n');

        const imageRefs = extractImageRefs(contentXml, binItemMap);

        // NEW: Bundle binaries into contentXml for web preview fidelity (stowaway pattern)
        let bundledXml = contentXml;
        if (imageRefs.length > 0) {
            const bundledBinaries = imageRefs.map(ref => {
                const img = images.find(i => i.binId === ref);
                return img ? { id: img.binId, data: img.data, type: img.format } : null;
            }).filter(Boolean);

            if (bundledBinaries.length > 0) {
                const binaryJson = JSON.stringify(bundledBinaries);
                const encoded = Buffer.from(binaryJson).toString('base64');
                bundledXml = `<?antigravity-binaries data="${encoded}"?>\n` + bundledXml;
            }
        }

        const qNumber = extractedNumbers.get(startIdx) || (questions.length + 1);
        console.log(`[HML-V2 Parser] Q${questions.length + 1}: index=${startIdx}, extractedNum=${extractedNumbers.get(startIdx)}, finalNum=${qNumber}`);

        const equationScripts = extractEquationScripts(questionElements);

        questions.push({
            questionNumber: qNumber,
            contentXml: bundledXml,
            plainText: getPlainText(questionElements).slice(0, 300),
            imageRefs,
            equationScripts
        });
    }

    return questions;
}

/**
 * Extract HWP Equation scripts from elements
 */
function extractEquationScripts(elements: Element[]): string[] {
    const scripts: string[] = [];
    for (const el of elements) {
        const eqTags = getTags(el, 'EQUATION');
        for (const eq of eqTags) {
            // Priority 1: SCRIPT child tag (standard HML/HWPX)
            const scriptNode = getTags(eq, 'SCRIPT')[0];
            let script = scriptNode?.textContent || '';

            // Priority 2: Fallback to eq textContent if SCRIPT is missing
            if (!script.trim()) {
                script = eq.textContent || '';
            }

            // Cleanup HWP specific junk (수식입니다, [수식] 등)
            script = script.replace(/(수식|그림|표)입니다\.?\s*/g, '').replace(/\[(수식|그림|표)\](?:\s|$)/g, '').trim();

            if (script) scripts.push(script);
        }
    }
    return scripts;
}


/**
 * Extract image references from XML
 * Looks for BinItem="X" in IMAGE tags inside PICTURE
 * Resolves Index -> BinDataId using binItemMap
 */
function extractImageRefs(xml: string, binItemMap: Map<string, string>): string[] {
    const refs: string[] = [];

    // Match BinItem="X" or BinData="X" (used in IMAGE/PICTURE tags)
    const regex = /(?:BinItem|BinData)="([^"]+)"/gi;
    let match;
    while ((match = regex.exec(xml)) !== null) {
        const rawRef = match[1];
        let resolvedId = rawRef;

        // Try to resolve using binItemMap (assuming rawRef is an Index)
        if (binItemMap.has(rawRef)) {
            resolvedId = binItemMap.get(rawRef) || rawRef;
        }

        if (!refs.includes(resolvedId)) {
            refs.push(resolvedId);
        }
    }

    return refs;
}

/**
 * Get plain text from elements (for preview)
 */
function getPlainText(elements: Element[]): string {
    const texts: string[] = [];

    const getCleanText = (node: Node): string => {
        if (node.nodeType === 3) {
            let t = node.textContent || '';
            return t.replace(/(수식|그림|표)입니다\.?\s*/g, '').replace(/\[(수식|그림|표)\]\s*/g, '');
        }
        if (node.nodeType === 1) {
            const el = node as Element;
            const tName = el.tagName.toUpperCase().replace('HP:', '');

            // Skip equations in plain text to avoid script leakage
            if (tName === 'EQUATION') return '';

            let res = '';
            for (let i = 0; i < el.childNodes.length; i++) {
                res += getCleanText(el.childNodes[i]);
            }
            return res;
        }
        return '';
    };

    for (const el of elements) {
        texts.push(getCleanText(el).trim());
    }

    return texts.join(' ').replace(/\s+/g, ' ').trim();
}

// Helper to recursively remove style attributes
function cleanStyleAttributes(element: Element, borderFillMap: Map<string, string>, paraAlignMap: Map<string, string>) {
    // Remove attributes from current element
    // [Fix for Missing Content]: We MUST strip source-specific IDs because we do not merge definitions.
    // Leaving them creates "Dangling References" which makes text invisible in Hancom.
    // By removing them, content falls back to the Target Template's default style (Visible).

    // NEW: Capture Alignment
    const tName = element.tagName.toUpperCase().replace('HP:', '');
    const paraShapeId = element.getAttribute('ParaShape');
    if (paraShapeId && tName === 'P') {
        const align = paraAlignMap.get(paraShapeId);
        if (align) element.setAttribute('data-hml-align', align);
    }

    element.removeAttribute('Style');
    element.removeAttribute('ParaShape');
    element.removeAttribute('CharShape');

    // NEW: Comprehensive Border Preservation
    // Capture from ANY element that might have a border reference
    const borderAttr = element.getAttribute('BorderFill') || element.getAttribute('BorderFillId');
    if (borderAttr) {
        const borderXml = borderFillMap.get(borderAttr);
        if (borderXml) {
            // Store the full XML definition in a temporary attribute
            const encodedXml = Buffer.from(borderXml).toString('base64');
            element.setAttribute('data-hml-border-xml', encodedXml);
        }
        // ALWAYS remove the original ID to prevent dangling references in target HML
        element.removeAttribute('BorderFill');
        element.removeAttribute('BorderFillId');
    }

    // [Fix for Structural Leakage]: Blacklist document-level layout tags that shouldn't exist in a question fragment.
    // SECDEF, COLDEF, MASTERPAGE etc. carry global document setup that corrupts local text rendering.
    const layoutTags = ['SECDEF', 'COLDEF', 'MASTERPAGE', 'PAGEDEF', 'STARTNUMBER', 'HIDE', 'PAGEBORDERFILL', 'FOOTNOTESHAPE', 'ENDNOTESHAPE'];

    // Process children recursively
    const children = Array.from(element.childNodes);
    for (const child of children) {
        if (child.nodeType === 3) { // Text Node
            // NEW: Anti-Pollution - Remove HWP specific metadata like "수식입니다"
            const pollutions = [
                /(수식|그림|표)입니다\.?\s*/g,
                /\[(수식|그림|표)\]\s*/g
            ];
            let text = child.textContent || '';
            for (const p of pollutions) {
                text = text.replace(p, '');
            }
            child.textContent = text;
        } else if (child.nodeType === 1) { // Element node
            const el = child as Element;
            const cName = el.tagName.toUpperCase().replace('HP:', '');
            if (layoutTags.includes(cName)) {
                element.removeChild(child);
            } else {
                cleanStyleAttributes(el, borderFillMap, paraAlignMap);
            }
        }
    }
}

/**
 * Identify and tag semantic roles based on style names
 */
function tagSemanticRole(element: Element, styleMap: Map<string, string>) {
    const tagName = element.tagName.toUpperCase().replace('HP:', '');

    if (tagName === 'P') {
        const styleId = element.getAttribute('Style');
        if (styleId) {
            const styleName = styleMap.get(styleId) || '';
            let role = '';

            // Role Mapping Logic (Ordered by specificity)
            if (styleName.includes('해설') || styleName.includes('미주')) {
                role = 'BOX_MIJU';
            } else if (styleName.includes('조건')) {
                role = 'BOX_JOKUN';
            } else if (styleName.includes('보기')) {
                role = 'BOX_BOGI';
            } else if (styleName.includes('박스') || styleName.includes('지문')) {
                role = 'BOX_BOGI';
            } else if (styleName.includes('문제') || styleName.includes('문항')) {
                role = 'QUESTION';
            } else if (styleName.includes('선지') || styleName.includes('선택지')) {
                role = 'CHOICE';
            }

            if (role) {
                console.log(`[HML-V2 Parser] Tagged P as ${role} (Style: ${styleName}, StyleID: ${styleId})`);
                element.setAttribute('data-hml-style', role);
            }

            // Keep the original style name
            if (styleName) {
                element.setAttribute('data-hml-orig-style', styleName);
            }
        }
    } else if (tagName === 'TABLE') {
        // Identify tables that act as boxes
        const text = (element.textContent || '').trim();
        // Broader matching for "보기" variants
        if (text.includes('보  기') || text.includes('보 기') || text.includes('보기') ||
            text.includes('조건') || text.includes('박스') || text.includes('지문')) {
            // Tag the table itself so the generator can handle it
            const role = (text.includes('조건')) ? 'BOX_JOKUN' :
                ((text.includes('미주') || text.includes('해설')) ? 'BOX_MIJU' : 'BOX_BOGI');

            console.log(`[HML-V2 Parser] Tagged TABLE as ${role} (Content preview: ${text.slice(0, 30)})`);
            element.setAttribute('data-hml-style', role);
        }
    }

    // Recurse to catch nested paragraphs if any (e.g. within a BOX style but inside another structure)
    const children = Array.from(element.childNodes);
    for (const child of children) {
        if (child.nodeType === 1) { // Element node
            tagSemanticRole(child as Element, styleMap);
        }
    }
}


// For testing
export { extractImages, extractImageMetadata, extractQuestions };
