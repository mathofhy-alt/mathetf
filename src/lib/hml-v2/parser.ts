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
        const cleanBase64 = rawBase64.replace(/\s/g, '');

        // Calculate actual binary size (not Base64 string length)
        const sizeBytes = Math.floor(cleanBase64.length * 3 / 4);

        images.push({
            binId: id,
            format: 'jpg', // Default, will be overwritten by metadata
            data: cleanBase64,
            sizeBytes
        });

        console.log(`[HML-V2 Parser] BINDATA Id="${id}" size=${sizeBytes} bytes`);
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
        console.log(`[HML-V2 Parser] BINITEM BinData="${binDataId}" Format="${format}"`);
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

    // Get all P elements (paragraphs)
    const allParagraphs: Element[] = [];

    // Only get direct children P tags of SECTION
    // getElementsByTagName is recursive, so we iterate childNodes instead
    const childNodes = section.childNodes;
    for (let i = 0; i < childNodes.length; i++) {
        const node = childNodes[i];
        if (node.nodeName === 'P') {
            allParagraphs.push(node as Element);
        }
    }

    console.log(`[HML-V2 Parser] Found ${allParagraphs.length} top-level P elements`);

    // Find question boundaries using ENDNOTE tags with Number attribute
    const startIndices: number[] = [];
    for (let i = 0; i < allParagraphs.length; i++) {
        const p = allParagraphs[i];
        const endnotes = p.getElementsByTagName('ENDNOTE');
        if (endnotes.length > 0) {
            const num = endnotes[0].getElementsByTagName('AUTONUM')[0]?.getAttribute('Number');
            if (num) {
                startIndices.push(i);
                console.log(`[HML-V2 Parser] Question boundary at P[${i}]: ENDNOTE Number="${num}"`);
            }
        }
    }

    console.log(`[HML-V2 Parser] Found ${startIndices.length} question boundaries`);

    // If no questions found, treat entire content as one question
    if (startIndices.length === 0) {
        const contentXml = allParagraphs.map(p => serializer.serializeToString(p)).join('\n');
        const imageRefs = extractImageRefs(contentXml);

        questions.push({
            questionNumber: 1,
            contentXml,
            plainText: getPlainText(allParagraphs).slice(0, 300),
            imageRefs
        });
        return questions;
    }

    // Split by question boundaries
    for (let i = 0; i < startIndices.length; i++) {
        const startIdx = startIndices[i];
        const endIdx = startIndices[i + 1] ?? allParagraphs.length;

        // Get all paragraphs for this question, but clean trailing empty ones only
        const rawParagraphs = allParagraphs.slice(startIdx, endIdx);

        // Find last meaningful paragraph (trim trailing empty/정답 ones)
        let lastMeaningfulIdx = rawParagraphs.length - 1;
        while (lastMeaningfulIdx >= 0) {
            const p = rawParagraphs[lastMeaningfulIdx];
            const text = (p.textContent || '').trim();

            // Check if paragraph has any content
            const hasVisualContent = text.length > 0 ||
                p.getElementsByTagName('PICTURE').length > 0 ||
                p.getElementsByTagName('EQUATION').length > 0 ||
                p.getElementsByTagName('TABLE').length > 0;

            // Stop if we find meaningful content (but skip "정답" only)
            if (hasVisualContent && text !== '정답' && text !== '답') {
                break;
            }
            lastMeaningfulIdx--;
        }

        const questionParagraphs = rawParagraphs.slice(0, lastMeaningfulIdx + 1);

        // Skip if no content at all
        if (questionParagraphs.length === 0) {
            console.log(`[HML-V2 Parser] Skipping empty question at index ${i}`);
            continue;
        }

        // Serialize each paragraph using XMLSerializer
        // We do NOT inject any xmlns here because HWPML 2.8 typically does not use XML namespaces on P tags.
        // The previous issue of "missing questions" was likely due to xmldom's DOM manipulation quirks,
        // which are now avoided by using string-based assembly in the Generator.

        const contentXml = questionParagraphs.map(p => {
            return serializer.serializeToString(p);
        }).join('\n');

        const imageRefs = extractImageRefs(contentXml);

        console.log(`[HML-V2 Parser] Q${questions.length + 1}: ${questionParagraphs.length} paragraphs, ${contentXml.length} chars`);

        questions.push({
            questionNumber: questions.length + 1,
            contentXml,
            plainText: getPlainText(questionParagraphs).slice(0, 300),
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

    // Match BinItem="X" (used in IMAGE tags)
    const regex = /BinItem="([^"]+)"/gi;
    let match;
    while ((match = regex.exec(xml)) !== null) {
        if (!refs.includes(match[1])) {
            refs.push(match[1]);
        }
    }

    return refs;
}

/**
 * Get plain text from paragraphs (for preview)
 */
function getPlainText(elements: Element[]): string {
    const texts: string[] = [];

    for (const el of elements) {
        const text = el.textContent || '';
        texts.push(text.trim());
    }

    return texts.join(' ').replace(/\s+/g, ' ').trim();
}

// For testing
export { extractImages, extractImageMetadata, extractQuestions };
