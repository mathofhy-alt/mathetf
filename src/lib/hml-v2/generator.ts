/**
 * HML V2 Generator (Surgical String Splicing Implementation)
 * 
 * Strategy: Perform string-level replacement of {{CONTENT_HERE}} 
 * and surgical insertion of binary data into HEAD/TAIL.
 * This ensures no DOM transformation or namespace corruption occurs to the template.
 */

import { DOMParser, XMLSerializer } from 'xmldom';
import type { GenerateResult, DbQuestionImage, QuestionWithImages } from './types';

export function generateHmlFromTemplate(
    templateContent: string,
    questionsWithImages: QuestionWithImages[]
): GenerateResult {
    console.log(`[HML-V2 Surgical Generator] Processing ${questionsWithImages.length} questions`);

    const serializer = new XMLSerializer();
    const parser = new DOMParser();

    // 1. Process Questions to get their Paragraphs and Images
    let combinedContentXmlFull = '';
    const allImages: { originalId: string; newId: number; image: DbQuestionImage }[] = [];

    // Scan template for existing Max ID and Style IDs
    let nextImageId = 1;
    const templateDoc = parser.parseFromString(templateContent, 'text/xml');

    const validStyles = {
        ParaShape: new Set<string>(),
        CharShape: new Set<string>(),
        Style: new Set<string>()
    };

    // Collect valid Style IDs from MAPPINGTABLE
    const mappingTable = templateDoc.getElementsByTagName('MAPPINGTABLE')[0];
    if (mappingTable) {
        const collect = (tagName: string, set: Set<string>) => {
            const elements = mappingTable.getElementsByTagName(tagName);
            for (let i = 0; i < elements.length; i++) {
                const id = elements[i].getAttribute('Id');
                if (id) set.add(id);
            }
        };
        collect('PARASHAPE', validStyles.ParaShape);
        collect('CHARSHAPE', validStyles.CharShape);
        collect('STYLE', validStyles.Style);
    }

    const existingBins = templateDoc.getElementsByTagName('BINDATA');
    for (let i = 0; i < existingBins.length; i++) {
        const id = parseInt(existingBins[i].getAttribute('Id') || '0', 10);
        if (id >= nextImageId) nextImageId = id + 1;
    }

    for (const qwi of questionsWithImages) {
        const qDoc = parser.parseFromString(`<WRAP>${qwi.question.content_xml}</WRAP>`, 'text/xml');

        // Remap images for this question
        const remap = new Map<string, number>();
        for (const img of qwi.images) {
            const newId = nextImageId++;
            remap.set(img.original_bin_id, newId);
            allImages.push({ originalId: img.original_bin_id, newId, image: img });
        }

        // Sanitize missing style references
        sanitizeNodeStyles(qDoc.documentElement, validStyles);

        // Apply remap and serialize
        let questionXml = serializer.serializeToString(qDoc.documentElement);
        // Remove <WRAP>...</WRAP>
        questionXml = questionXml.replace(/^<WRAP>/, '').replace(/<\/WRAP>$/, '');

        // Remap BinItem/BinData
        remap.forEach((newId, oldId) => {
            const pattern = new RegExp(`(BinItem|BinData)="${oldId}"`, 'g');
            questionXml = questionXml.replace(pattern, `$1="${newId}"`);
        });

        // Add mandatory TreatAsChar to PICTURE if missing
        questionXml = questionXml.replace(/<PICTURE([^>]*?)(\/?)>/g, (match, attrs, selfClose) => {
            if (!attrs.includes('TreatAsChar')) {
                return `<PICTURE${attrs} TreatAsChar="true"${selfClose}>`;
            }
            return match;
        });

        combinedContentXmlFull += questionXml;
    }

    // 2. Surgical String Replacement of Anchor
    // Note: We support {{CONTENT_HERE}} as the primary anchor.
    let currentHml = templateContent;
    const anchor = '{{CONTENT_HERE}}';

    if (!currentHml.includes(anchor)) {
        console.warn(`[HML-V2 Surgical Generator] Anchor "${anchor}" NOT found in template!`);
    }

    currentHml = currentHml.replace(anchor, combinedContentXmlFull);

    // 3. Surgical Injection of BINDATALIST into HEAD
    if (allImages.length > 0) {
        let binItemsXml = '';
        for (const { newId, image } of allImages) {
            const format = (image.format || 'PNG').toUpperCase();
            const paddedId = String(newId).padStart(4, '0');
            binItemsXml += `<BINITEM BinData="${newId}" Format="${format}" Type="Embedding" Compress="false" Path="BIN${paddedId}.${format}"/>`;
        }

        // Find BINDATALIST or create it
        if (currentHml.includes('<BINDATALIST')) {
            // Update Count and Append
            currentHml = currentHml.replace(/<BINDATALIST Count="(\d+)"([^>]*?)>/, (match, count, rest) => {
                const newCount = parseInt(count, 10) + allImages.length;
                return `<BINDATALIST Count="${newCount}"${rest}>`;
            });
            currentHml = currentHml.replace('</BINDATALIST>', `${binItemsXml}</BINDATALIST>`);
        } else if (currentHml.includes('<MAPPINGTABLE>')) {
            // Insert at the beginning of MAPPINGTABLE
            currentHml = currentHml.replace('<MAPPINGTABLE>', `<MAPPINGTABLE><BINDATALIST Count="${allImages.length}">${binItemsXml}</BINDATALIST>`);
        } else {
            // Insert after <HEAD ...> as fallback
            const headTagMatch = currentHml.match(/<HEAD[^>]*?>/);
            if (headTagMatch) {
                const tag = headTagMatch[0];
                const listTag = `<BINDATALIST Count="${allImages.length}">${binItemsXml}</BINDATALIST>`;
                currentHml = currentHml.replace(tag, `${tag}${listTag}`);
            }
        }
    }

    // 4. Surgical Injection of BINDATASTORAGE into TAIL
    if (allImages.length > 0) {
        let binDataXml = '';
        for (const { newId, image } of allImages) {
            let base64 = image.data;
            if (base64.startsWith('data:')) base64 = base64.split(',')[1] || base64;
            const cleanBase64 = base64.replace(/[^A-Za-z0-9+/=]/g, '');
            binDataXml += `<BINDATA Id="${newId}" Encoding="Base64" Compress="false">${cleanBase64}</BINDATA>`;
        }

        if (currentHml.includes('<BINDATASTORAGE')) {
            currentHml = currentHml.replace(/<BINDATASTORAGE Count="(\d+)"([^>]*?)>/, (match, count, rest) => {
                const newCount = parseInt(count, 10) + allImages.length;
                return `<BINDATASTORAGE Count="${newCount}"${rest}>`;
            });
            currentHml = currentHml.replace('</BINDATASTORAGE>', `${binDataXml}</BINDATASTORAGE>`);
        } else {
            // Insert into TAIL. Known safe spot: before </TAIL>
            const tailEnd = currentHml.lastIndexOf('</TAIL>');
            if (tailEnd >= 0) {
                const storageTag = `<BINDATASTORAGE Count="${allImages.length}">${binDataXml}</BINDATASTORAGE>`;
                currentHml = currentHml.substring(0, tailEnd) + storageTag + currentHml.substring(tailEnd);
            }
        }
    }

    // 5. Update Global Metadata (Picture counts)
    if (allImages.length > 0) {
        // Update DOCSETTING Picture count
        currentHml = currentHml.replace(/(<DOCSETTING[^>]*?Picture=")(\d+)(")/g, (match, start, count, end) => {
            return `${start}${parseInt(count, 10) + allImages.length}${end}`;
        });
        // Update BEGINNUMBER Picture count
        currentHml = currentHml.replace(/(<BEGINNUMBER[^>]*?Picture=")(\d+)(")/g, (match, start, count, end) => {
            return `${start}${parseInt(count, 10) + allImages.length}${end}`;
        });
    }

    return {
        hmlContent: currentHml,
        questionCount: questionsWithImages.length,
        imageCount: allImages.length
    };
}

/**
 * Recursively scans nodes and removes style-related attributes if they are not in validSets.
 */
function sanitizeNodeStyles(node: any, validSets: { ParaShape: Set<string>; CharShape: Set<string>; Style: Set<string> }) {
    if (node.nodeType !== 1) return; // 1 is Element

    const checkAndStrip = (attr: string, set: Set<string>) => {
        const val = node.getAttribute(attr);
        if (val && !set.has(val)) {
            console.warn(`[HML-V2 Sanitizer] Stripping invalid ${attr}="${val}" from <${node.tagName}>`);
            node.removeAttribute(attr);
        }
    };

    checkAndStrip('ParaShape', validSets.ParaShape);
    checkAndStrip('CharShape', validSets.CharShape);
    checkAndStrip('Style', validSets.Style);

    for (let i = 0; i < node.childNodes.length; i++) {
        sanitizeNodeStyles(node.childNodes[i], validSets);
    }
}

export function generateHmlFile(
    templateContent: string,
    questions: any[],
    imagesByQuestion: Map<string, DbQuestionImage[]>
): GenerateResult {
    const questionsWithImages: QuestionWithImages[] = questions.map(q => ({
        question: q,
        images: imagesByQuestion.get(q.id) || []
    }));
    return generateHmlFromTemplate(templateContent, questionsWithImages);
}

// Legacy export
export function generateHmlV2(questionsWithImages: QuestionWithImages[]): GenerateResult {
    throw new Error('Use generateHmlFromTemplate');
}
