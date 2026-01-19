/**
 * HML V2 Generator (Template-Based Implementation)
 * 
 * Strategy: Use the original HML file as template, preserving HEAD structure
 * Only modify BINDATALIST, BODY, and BINDATASTORAGE
 * 
 * Key HML Structure:
 * - HEAD > MAPPINGTABLE > BINDATALIST > BINITEM (image metadata)
 * - BODY > SECTION > P (content with PICTURE > IMAGE tags)
 * - TAIL > BINDATASTORAGE > BINDATA (Base64 image data)
 */

import { DOMParser, XMLSerializer } from 'xmldom';
import type { GenerateResult, DbQuestion, DbQuestionImage, QuestionWithImages } from './types';

/**
 * Generate an HML file from questions and their images, using template
 */
export function generateHmlFromTemplate(
    templateContent: string,
    questionsWithImages: QuestionWithImages[]
): GenerateResult {
    console.log(`[HML-V2 Generator] Processing ${questionsWithImages.length} questions`);

    const parser = new DOMParser();
    const serializer = new XMLSerializer();
    const doc = parser.parseFromString(templateContent, 'text/xml');

    // Collect all images and create ID remap
    const allImages: { originalId: string; newId: number; image: DbQuestionImage }[] = [];
    const idRemapByQuestion = new Map<string, Map<string, number>>();
    let nextImageId = 1;

    for (const qwi of questionsWithImages) {
        const remap = new Map<string, number>();
        for (const img of qwi.images) {
            const newId = nextImageId++;
            remap.set(img.original_bin_id, newId);
            allImages.push({ originalId: img.original_bin_id, newId, image: img });
        }
        idRemapByQuestion.set(qwi.question.id, remap);
    }

    console.log(`[HML-V2 Generator] Total ${allImages.length} images to embed`);

    // Step 1: Update BINDATALIST in HEAD > MAPPINGTABLE
    updateBindataList(doc, allImages);

    // Step 2: Update TAIL > BINDATASTORAGE (Step 2 logic moved here as per plan)
    updateBindataStorage(doc, allImages);

    // Serialize basic structure (HEAD + TAIL)
    let hmlContent = serializer.serializeToString(doc);

    // Step 3: Replace SECTION content using string manipulation
    // This bypasses DOM Parser stripping "redundant" namespaces, ensuring every P tag keeps its xmlns
    const sectionContent: string[] = [];

    for (const qwi of questionsWithImages) {
        let contentXml = qwi.question.content_xml;
        const remap = idRemapByQuestion.get(qwi.question.id);

        if (remap && remap.size > 0) {
            contentXml = remapImageReferences(contentXml, remap);
        }
        sectionContent.push(contentXml);
    }

    // Replace everything inside <SECTION>...</SECTION> with our concatenated content
    hmlContent = hmlContent.replace(
        /(<SECTION[^>]*>)[\s\S]*?(<\/SECTION>)/,
        `$1${sectionContent.join('\n')}$2`
    );

    console.log(`[HML-V2 Generator] Generated HML with ${questionsWithImages.length} questions (String Assembly)`);

    return {
        hmlContent,
        questionCount: questionsWithImages.length,
        imageCount: allImages.length
    };
}
// updateBodyContent removed as it is no longer used


/**
 * Update BINDATALIST in HEAD > MAPPINGTABLE
 */
function updateBindataList(
    doc: Document,
    images: { originalId: string; newId: number; image: DbQuestionImage }[]
): void {
    // Find existing BINDATALIST
    let bindataList = doc.getElementsByTagName('BINDATALIST')[0];

    if (!bindataList) {
        // Create BINDATALIST if not exists (inside MAPPINGTABLE)
        const mappingTable = doc.getElementsByTagName('MAPPINGTABLE')[0];
        if (mappingTable) {
            bindataList = doc.createElement('BINDATALIST');
            // Insert at the beginning of MAPPINGTABLE
            mappingTable.insertBefore(bindataList, mappingTable.firstChild);
        } else {
            console.error('[HML-V2 Generator] MAPPINGTABLE not found');
            return;
        }
    }

    // Clear existing BINITEM elements
    while (bindataList.firstChild) {
        bindataList.removeChild(bindataList.firstChild);
    }

    // Set count
    bindataList.setAttribute('Count', String(images.length));

    // Add new BINITEM elements
    for (const { newId, image } of images) {
        const binItem = doc.createElement('BINITEM');
        binItem.setAttribute('BinData', String(newId));
        binItem.setAttribute('Format', (image.format || 'jpg').toLowerCase());
        binItem.setAttribute('Type', 'Embedding');
        bindataList.appendChild(binItem);
    }

    console.log(`[HML-V2 Generator] Updated BINDATALIST with ${images.length} items`);
}

/**
 * Remap image references in content XML
 * Changes BinItem="oldId" to BinItem="newId"
 */
function remapImageReferences(
    xml: string,
    remap: Map<string, number>
): string {
    let result = xml;

    remap.forEach((newId, originalId) => {
        // Match BinItem="originalId"
        const pattern = new RegExp(`BinItem="${escapeRegex(originalId)}"`, 'g');
        result = result.replace(pattern, `BinItem="${newId}"`);
    });

    return result;
}

/**
 * Update TAIL > BINDATASTORAGE
 */
function updateBindataStorage(
    doc: Document,
    images: { originalId: string; newId: number; image: DbQuestionImage }[]
): void {
    const tail = doc.getElementsByTagName('TAIL')[0];
    if (!tail) {
        console.error('[HML-V2 Generator] TAIL not found');
        return;
    }

    // Find or create BINDATASTORAGE
    let bindataStorage = doc.getElementsByTagName('BINDATASTORAGE')[0];

    if (!bindataStorage) {
        bindataStorage = doc.createElement('BINDATASTORAGE');
        // Insert at the beginning of TAIL
        tail.insertBefore(bindataStorage, tail.firstChild);
    }

    // Clear existing BINDATA elements
    while (bindataStorage.firstChild) {
        bindataStorage.removeChild(bindataStorage.firstChild);
    }

    // Set count
    bindataStorage.setAttribute('Count', String(images.length));

    // Add new BINDATA elements
    for (const { newId, image } of images) {
        const binData = doc.createElement('BINDATA');
        binData.setAttribute('Id', String(newId));
        binData.setAttribute('Encoding', 'Base64');
        binData.setAttribute('Compress', 'false');

        // Clean and format Base64 data
        let base64 = image.data;
        if (base64.startsWith('data:')) {
            base64 = base64.split(',')[1] || base64;
        }
        base64 = base64.replace(/\s/g, '');

        // Calculate size
        const sizeBytes = image.size_bytes || Math.floor(base64.length * 3 / 4);
        binData.setAttribute('Size', String(sizeBytes));

        // Format with 76-character line breaks
        const chunkedBase64 = chunkString(base64, 76).join('\n');
        binData.textContent = chunkedBase64;

        bindataStorage.appendChild(binData);
    }

    console.log(`[HML-V2 Generator] Updated BINDATASTORAGE with ${images.length} items`);
}
// chunkString starts below...
/**
 * Split string into chunks
 */
function chunkString(str: string, size: number): string[] {
    const chunks: string[] = [];
    for (let i = 0; i < str.length; i += size) {
        chunks.push(str.slice(i, i + size));
    }
    return chunks;
}

/**
 * Escape special regex characters
 */
function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Legacy export for compatibility
export function generateHmlV2(questionsWithImages: QuestionWithImages[]): GenerateResult {
    throw new Error('Use generateHmlFromTemplate instead - template is required');
}

export function generateHmlFile(
    templateContent: string,
    questions: DbQuestion[],
    imagesByQuestion: Map<string, DbQuestionImage[]>
): GenerateResult {
    const questionsWithImages: QuestionWithImages[] = questions.map(q => ({
        question: q,
        images: imagesByQuestion.get(q.id) || []
    }));

    return generateHmlFromTemplate(templateContent, questionsWithImages);
}
