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

    // Step 1: Extract all binary data from TAIL > BINDATASTORAGE
    const images = extractImages(doc);
    console.log(`[HML-V2 Parser] Extracted ${images.length} images`);

    // Step 2: Extract image metadata from HEAD > MAPPINGTABLE > BINDATALIST
    const imageMetaMap = extractImageMetadata(doc);
    console.log(`[HML-V2 Parser] Found ${imageMetaMap.size} BINITEM entries`);

    // Step 3: Merge metadata into images
    images.forEach(img => {
        const meta = imageMetaMap.get(img.binId);
        if (meta) {
            img.format = meta.format.toLowerCase();
        }
    });

    // Step 4: Extract questions from BODY
    const questions = extractQuestions(doc);
    console.log(`[HML-V2 Parser] Extracted ${questions.length} questions`);

    return { questions, images };
}

/**
 * Extract binary image data from TAIL > BINDATASTORAGE > BINDATA
 */
function extractImages(doc: Document): ExtractedImage[] {
    const images: ExtractedImage[] = [];

    const binDataElements = doc.getElementsByTagName('BINDATA');

    for (let i = 0; i < binDataElements.length; i++) {
        const el = binDataElements[i];
        const id = el.getAttribute('Id') || String(i + 1);
        const rawBase64 = el.textContent || '';

        // Clean up Base64: remove whitespace and newlines
        // [Fix for Unknown Error]: Aggressively strip ANY character that is not valid Base64
        // Including \r, \n, \t, and any hidden unicode whitespace.
        const cleanBase64 = rawBase64.replace(/[^A-Za-z0-9+/=]/g, '');

        // Calculate actual binary size (not Base64 string length)
        const sizeBytes = Math.floor(cleanBase64.length * 3 / 4);

        images.push({
            binId: id,
            format: 'jpg', // Default, will be overwritten by metadata
            data: cleanBase64,
            sizeBytes
        });
    }

    return images;
}

/**
 * Extract image metadata from HEAD > MAPPINGTABLE > BINDATALIST > BINITEM
 */
function extractImageMetadata(doc: Document): Map<string, { format: string; type: string }> {
    const metaMap = new Map<string, { format: string; type: string }>();

    const binItems = doc.getElementsByTagName('BINITEM');

    for (let i = 0; i < binItems.length; i++) {
        const item = binItems[i];
        // BinData attribute contains the ID that matches BINDATA Id
        const binDataId = item.getAttribute('BinData') || String(i + 1);
        const format = item.getAttribute('Format') || 'jpg';
        const type = item.getAttribute('Type') || 'Embedding';

        metaMap.set(binDataId, { format, type });
    }

    return metaMap;
}

/**
 * Extract questions from BODY > SECTION
 * 
 * Splits content by question numbering patterns (ENDNOTE with Number attribute)
 */
function extractQuestions(doc: Document): ExtractedQuestion[] {
    const questions: ExtractedQuestion[] = [];
    const serializer = new XMLSerializer();

    const body = doc.getElementsByTagName('BODY')[0];
    if (!body) {
        console.warn('[HML-V2 Parser] No BODY element found');
        return [];
    }

    const section = body.getElementsByTagName('SECTION')[0];
    if (!section) {
        console.warn('[HML-V2 Parser] No SECTION element found');
        return [];
    }

    // Get all direct child elements of SECTION (P, TABLE, etc.)
    const allElements: Element[] = [];

    // Only get direct children of SECTION
    const childNodes = section.childNodes;
    for (let i = 0; i < childNodes.length; i++) {
        const node = childNodes[i];
        if (node.nodeType === 1) { // Element node
            allElements.push(node as Element);
        }
    }

    console.log(`[HML-V2 Parser] Found ${allElements.length} top-level elements`);

    // Find question boundaries using ENDNOTE tags with Number attribute
    const startIndices: number[] = [];
    for (let i = 0; i < allElements.length; i++) {
        const el = allElements[i];
        // Only P tags usually contain ENDNOTE, but check everything just in case
        const endnotes = el.getElementsByTagName('ENDNOTE');
        if (endnotes.length > 0) {
            const endnote = endnotes[0];
            const num = endnote.getElementsByTagName('AUTONUM')[0]?.getAttribute('Number');
            if (num) {
                startIndices.push(i);
                console.log(`[HML-V2 Parser] Question boundary at Index[${i}]: ENDNOTE Number="${num}"`);
            }
        }
    }

    console.log(`[HML-V2 Parser] Found ${startIndices.length} question boundaries`);

    // If no questions found, treat entire content as one question
    if (startIndices.length === 0) {
        const contentXml = allElements.map(el => {
            const clonedEl = el.cloneNode(true) as Element;
            cleanStyleAttributes(clonedEl);
            return serializer.serializeToString(clonedEl);
        }).join('');

        const imageRefs = extractImageRefs(contentXml);

        questions.push({
            questionNumber: 1,
            contentXml,
            plainText: getPlainText(allElements).slice(0, 300),
            imageRefs
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
                el.getElementsByTagName('PICTURE').length > 0 ||
                el.getElementsByTagName('EQUATION').length > 0 ||
                el.getElementsByTagName('TABLE').length > 0;

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

        const contentXml = questionElements.map(el => {
            // Clone the node to avoid modifying the original DOM during cleanup
            const clonedEl = el.cloneNode(true) as Element;

            // Cleanup style attributes to prevent rendering issues in target HML
            cleanStyleAttributes(clonedEl);

            return serializer.serializeToString(clonedEl);
        }).join('\n');

        const imageRefs = extractImageRefs(contentXml);

        console.log(`[HML-V2 Parser] Q${questions.length + 1}: ${questionElements.length} elements, ${contentXml.length} chars`);

        questions.push({
            questionNumber: questions.length + 1,
            contentXml,
            plainText: getPlainText(questionElements).slice(0, 300),
            imageRefs
        });
    }

    return questions;
}

/**
 * Extract image references from XML
 * Looks for BinItem="X" in IMAGE tags inside PICTURE
 */
function extractImageRefs(xml: string): string[] {
    const refs: string[] = [];

    // Match BinItem="X" or BinData="X" (used in IMAGE/PICTURE tags)
    const regex = /(?:BinItem|BinData)="([^"]+)"/gi;
    let match;
    while ((match = regex.exec(xml)) !== null) {
        if (!refs.includes(match[1])) {
            refs.push(match[1]);
        }
    }

    return refs;
}

/**
 * Get plain text from elements (for preview)
 */
function getPlainText(elements: Element[]): string {
    const texts: string[] = [];

    for (const el of elements) {
        const text = el.textContent || '';
        texts.push(text.trim());
    }

    return texts.join(' ').replace(/\s+/g, ' ').trim();
}

// Helper to recursively remove style attributes
function cleanStyleAttributes(element: Element) {
    // Remove attributes from current element
    // [Fix for Missing Content]: We MUST strip source-specific IDs because we do not merge definitions.
    // Leaving them creates "Dangling References" which makes text invisible in Hancom.
    // By removing them, content falls back to the Target Template's default style (Visible).
    element.removeAttribute('Style');
    element.removeAttribute('ParaShape');
    element.removeAttribute('CharShape');

    // For TABLES and CELLS, we MUST provide a valid BorderFill ID to ensure visibility.
    // If we simply remove it, the table/cell borders (and sometimes content) become invisible in Hancom.
    // We use ID "3" which corresponds to standard Solid Lines in the "hml v2-test-tem.hml" template.
    if (element.tagName === 'TABLE' || element.tagName === 'CELL') {
        const existingBorder = element.getAttribute('BorderFill');
        // Only override if missing or likely invalid (we can't easily check validity, so we force for safety)
        // BUT user wanted "Copy Paste". If we force "3", we lose custom borders.
        // However, invalid BorderFill ID = Invisible Table.
        // Compromise: Force "3" is safer than undefined/invalid.
        element.setAttribute('BorderFill', '3');
    } else {
        // For non-table elements, remove BorderFill to avoid random border artifacts
        element.removeAttribute('BorderFill');
    }

    // [Fix for Structural Leakage]: Blacklist document-level layout tags that shouldn't exist in a question fragment.
    // SECDEF, COLDEF, MASTERPAGE etc. carry global document setup that corrupts local text rendering.
    const layoutTags = ['SECDEF', 'COLDEF', 'MASTERPAGE', 'PAGEDEF', 'STARTNUMBER', 'HIDE', 'PAGEBORDERFILL', 'FOOTNOTESHAPE', 'ENDNOTESHAPE'];

    // Process children recursively
    const children = Array.from(element.childNodes);
    for (const child of children) {
        if (child.nodeType === 1) { // Element node
            const el = child as Element;
            if (layoutTags.includes(el.tagName.toUpperCase())) {
                element.removeChild(child);
            } else {
                cleanStyleAttributes(el);
            }
        }
    }
}

// For testing
export { extractImages, extractImageMetadata, extractQuestions };
