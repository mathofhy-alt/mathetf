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

    // 0. Extract Box Patterns from Template
    const templateDoc = parser.parseFromString(templateContent, 'text/xml');
    const boxPatterns: Record<string, string> = {};
    const tables = Array.from(templateDoc.getElementsByTagName('TABLE'));

    for (const table of tables) {
        const ps = Array.from(table.getElementsByTagName('P'));
        let role = '';

        for (const p of ps) {
            const pText = (p.textContent || '').trim();
            if (pText === '보기박스') { role = 'BOX_BOGI'; break; }
            if (pText === '조건박스') { role = 'BOX_JOKUN'; break; }
            if (pText === '미주박스') { role = 'BOX_MIJU'; break; }
        }

        if (role) {
            // Store the pattern
            console.log(`[HML-V2 Surgical Generator] Extracted pattern for role: ${role}`);
            boxPatterns[role] = serializer.serializeToString(table);
        }
    }

    if (Object.keys(boxPatterns).length === 0) {
        console.warn(`[HML-V2 Surgical Generator] NO box patterns extracted from template!`);
    }

    // Clean template: Use marker for robust cleanup
    let cleanedTemplate = templateContent;
    const marker = '{{MASTER_PATTERNS_START}}';
    if (cleanedTemplate.includes(marker)) {
        const markerIndex = cleanedTemplate.indexOf(marker);
        const sectionEndIndex = cleanedTemplate.indexOf('</SECTION>', markerIndex);
        if (sectionEndIndex !== -1) {
            // Remove everything from marker until just before </SECTION>
            cleanedTemplate = cleanedTemplate.substring(0, markerIndex) + cleanedTemplate.substring(sectionEndIndex);
        } else {
            // Fallback: just remove the marker
            cleanedTemplate = cleanedTemplate.replace(marker, '');
        }
    }

    // 1. Process Questions to get their Paragraphs and Images
    let combinedContentXmlFull = '';
    const allImages: { originalId: string; newId: number; image: DbQuestionImage }[] = [];

    // Scan template for existing Max ID and Style IDs
    let nextImageId = 1;
    let nextInstId = 3000000000; // Large number for unique InstIds

    const validStyles = {
        ParaShape: new Set<string>(),
        CharShape: new Set<string>(),
        Style: new Set<string>(),
        StyleNames: new Map<string, string>(), // Name -> Id
        BorderFills: new Map<string, string>(), // XML -> Id
        BorderFillIds: new Set<string>(), // Raw IDs in template
        InjectedBorders: [] as { id: string; xml: string }[],
        nextBorderId: 100 // Managed pointer for new IDs
    };


    // Collect valid Style IDs from MAPPINGTABLE
    const mappingTable = templateDoc.getElementsByTagName('MAPPINGTABLE')[0];
    if (mappingTable) {
        const collect = (tagName: string, set: Set<string>, nameMap?: Map<string, string>) => {
            const elements = mappingTable.getElementsByTagName(tagName);
            for (let i = 0; i < elements.length; i++) {
                const id = elements[i].getAttribute('Id');
                const name = elements[i].getAttribute('Name');
                if (id) {
                    set.add(id);
                    if (name && nameMap) {
                        nameMap.set(name, id);
                    }
                }
            }
        };
        collect('PARASHAPE', validStyles.ParaShape);
        collect('CHARSHAPE', validStyles.CharShape);
        collect('STYLE', validStyles.Style, validStyles.StyleNames);

        // Collect existing BorderFills to reuse them
        const bfs = mappingTable.getElementsByTagName('BORDERFILL');
        for (let i = 0; i < bfs.length; i++) {
            const bf = bfs[i];
            const id = bf.getAttribute('Id');
            if (id) {
                const idVal = parseInt(id, 10);
                if (idVal >= validStyles.nextBorderId) validStyles.nextBorderId = idVal + 1;

                const cloned = bf.cloneNode(true) as Element;
                cloned.removeAttribute('Id');
                const xml = serializer.serializeToString(cloned);
                validStyles.BorderFills.set(xml, id);
                validStyles.BorderFillIds.add(id);
            }
        }
    }

    const existingBins = templateDoc.getElementsByTagName('BINDATA');
    for (let i = 0; i < existingBins.length; i++) {
        const id = parseInt(existingBins[i].getAttribute('Id') || '0', 10);
        if (id >= nextImageId) nextImageId = id + 1;
    }

    for (const qwi of questionsWithImages) {
        const qDoc = parser.parseFromString(`<WRAP>${qwi.question.content_xml}</WRAP>`, 'text/xml');
        const root = qDoc.documentElement;

        // Remap images for this question
        const remap = new Map<string, number>();
        for (const img of qwi.images) {
            const newId = nextImageId++;
            remap.set(img.original_bin_id, newId);
            allImages.push({ originalId: img.original_bin_id, newId, image: img });
        }

        // --- Grouping and Box Wrapping Logic ---
        const finalNodes: string[] = [];
        let currentGroup: any[] = [];
        let currentRole = '';

        const children = Array.from(root.childNodes);
        for (const child of children) {
            if (child.nodeType !== 1) continue;
            const el = child as Element;
            const role = el.getAttribute('data-hml-style') || '';

            const isBoxRole = role.startsWith('BOX_');

            if (isBoxRole) {
                if (role === currentRole) {
                    currentGroup.push(el);
                } else {
                    // Flush previous group
                    if (currentRole.startsWith('BOX_')) {
                        console.log(`[HML-V2 Surgical Generator] Flushing box group for role: ${currentRole} (Size: ${currentGroup.length})`);
                        finalNodes.push(wrapInBoxPattern(currentGroup, currentRole, boxPatterns, serializer, parser, nextInstId++, validStyles));
                    } else {
                        currentGroup.forEach(node => {
                            sanitizeNodeStyles(node, validStyles, serializer);
                            finalNodes.push(serializer.serializeToString(node));
                        });
                    }
                    currentGroup = [el];
                    currentRole = role;
                }
            } else {
                // Not a box role
                if (currentRole.startsWith('BOX_')) {
                    finalNodes.push(wrapInBoxPattern(currentGroup, currentRole, boxPatterns, serializer, parser, nextInstId++, validStyles));
                    currentGroup = [];
                    currentRole = '';
                }
                sanitizeNodeStyles(el, validStyles, serializer);
                finalNodes.push(serializer.serializeToString(el));
            }
        }
        // Last flush
        if (currentRole.startsWith('BOX_')) {
            finalNodes.push(wrapInBoxPattern(currentGroup, currentRole, boxPatterns, serializer, parser, nextInstId++, validStyles));
        }

        let questionXml = finalNodes.join('\n');

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

    // 2. Surgical Injection of NEW BORDERFILLs into Header
    if (validStyles.InjectedBorders.length > 0) {
        let injectedXml = '';
        for (const { id, xml } of validStyles.InjectedBorders) {
            // Re-insert the generated Id into the XML
            // And ensure no duplicate xmlns namespaces which Hancom hates
            const cleanXml = xml.replace(/\sxmlns(:[a-z0-9]+)?="[^"]*"/gi, '');
            const bfWithId = cleanXml.replace('<BORDERFILL', `<BORDERFILL Id="${id}"`);
            injectedXml += bfWithId;
        }

        if (cleanedTemplate.includes('<BORDERFILLLIST')) {
            cleanedTemplate = cleanedTemplate.replace(/<BORDERFILLLIST Count="(\d+)"([^>]*?)>/, (match, count, rest) => {
                const newCount = parseInt(count, 10) + validStyles.InjectedBorders.length;
                return `<BORDERFILLLIST Count="${newCount}"${rest}>`;
            });
            cleanedTemplate = cleanedTemplate.replace('</BORDERFILLLIST>', `${injectedXml}</BORDERFILLLIST>`);
        }
    }

    // 2. Surgical String Replacement of Anchor
    let currentHml = cleanedTemplate;
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

        if (currentHml.includes('<BINDATALIST')) {
            currentHml = currentHml.replace(/<BINDATALIST Count="(\d+)"([^>]*?)>/, (match, count, rest) => {
                const newCount = parseInt(count, 10) + allImages.length;
                return `<BINDATALIST Count="${newCount}"${rest}>`;
            });
            currentHml = currentHml.replace('</BINDATALIST>', `${binItemsXml}</BINDATALIST>`);
        } else if (currentHml.includes('<MAPPINGTABLE>')) {
            currentHml = currentHml.replace('<MAPPINGTABLE>', `<MAPPINGTABLE><BINDATALIST Count="${allImages.length}">${binItemsXml}</BINDATALIST>`);
        } else {
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
            const tailEnd = currentHml.lastIndexOf('</TAIL>');
            if (tailEnd >= 0) {
                const storageTag = `<BINDATASTORAGE Count="${allImages.length}">${binDataXml}</BINDATASTORAGE>`;
                currentHml = currentHml.substring(0, tailEnd) + storageTag + currentHml.substring(tailEnd);
            }
        }
    }

    // 5. Update Global Metadata (Picture counts)
    if (allImages.length > 0) {
        currentHml = currentHml.replace(/(<DOCSETTING[^>]*?Picture=")(\d+)(")/g, (match, start, count, end) => {
            return `${start}${parseInt(count, 10) + allImages.length}${end}`;
        });
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

function sanitizeNodeStyles(node: any, validSets: {
    ParaShape: Set<string>;
    CharShape: Set<string>;
    Style: Set<string>;
    StyleNames: Map<string, string>;
    BorderFills: Map<string, string>;
    BorderFillIds: Set<string>;
    InjectedBorders: { id: string; xml: string }[];
    nextBorderId: number;
}, serializer: any) {
    if (node.nodeType !== 1) return;

    const checkAndStrip = (attr: string, set: Set<string>) => {
        const val = node.getAttribute(attr);
        if (val && !set.has(val)) {
            node.removeAttribute(attr);
        }
    };

    if (node.tagName === 'P') {
        const semanticRole = node.getAttribute('data-hml-style');
        if (semanticRole) {
            let targetStyleName = '';
            if (semanticRole === 'QUESTION') targetStyleName = '문제1';
            else if (semanticRole === 'CHOICE') targetStyleName = '오선지';
            else if (semanticRole.startsWith('BOX_')) targetStyleName = '박스안';

            if (targetStyleName) {
                const targetId = validSets.StyleNames.get(targetStyleName);
                if (targetId) {
                    node.setAttribute('Style', targetId);
                }
            }
        }
    }

    checkAndStrip('ParaShape', validSets.ParaShape);
    checkAndStrip('CharShape', validSets.CharShape);
    checkAndStrip('Style', validSets.Style);
    checkAndStrip('BorderFill', validSets.BorderFillIds);
    checkAndStrip('BorderFillId', validSets.BorderFillIds);

    // NEW: Handle Rich Border Preservation
    const encodedBfXml = node.getAttribute('data-hml-border-xml');
    if (encodedBfXml) {
        node.removeAttribute('data-hml-border-xml');
        try {
            const bfXml = Buffer.from(encodedBfXml, 'base64').toString('utf-8');
            let targetId = validSets.BorderFills.get(bfXml);

            if (!targetId) {
                // Not in template, create new one if not already injected
                // We use a simplified registry check (InjectedBorders)
                const existingInjected = validSets.InjectedBorders.find(b => b.xml === bfXml);
                if (existingInjected) {
                    targetId = existingInjected.id;
                } else {
                    // Assign NEW Id
                    const newId = String(validSets.nextBorderId++);
                    targetId = newId;
                    validSets.InjectedBorders.push({ id: newId, xml: bfXml });
                    // IMPORTANT: Update registry so same XML in same reassembly uses same Id
                    validSets.BorderFills.set(bfXml, targetId);
                    validSets.BorderFillIds.add(targetId);
                }
            }
            // Hancom HML uses BorderFillId for CHARSHAPE and BorderFill for others
            if (node.tagName === 'CHARSHAPE') {
                node.setAttribute('BorderFillId', targetId);
            } else {
                node.setAttribute('BorderFill', targetId);
            }
        } catch (e) {
            console.warn('[HML-V2 Generator] Failed to decode border XML', e);
        }
    }

    // Fallback Border: ONLY if no original border metadata exists AND no ID is current assigned
    if (node.tagName === 'TABLE' || node.tagName === 'CELL') {
        const hasId = node.getAttribute('BorderFill') || node.getAttribute('BorderFillId');
        const hasMetadata = node.getAttribute('data-hml-border-xml');

        if (!hasId && !hasMetadata) {
            // Find a solid border in template (usually Id 5 in this template)
            let fallbackId = validSets.StyleNames.get('기본스타일_보더') || '5';
            if (!validSets.BorderFillIds.has(fallbackId)) {
                fallbackId = Array.from(validSets.BorderFillIds)[0] || '1';
            }
            node.setAttribute('BorderFill', fallbackId);
        }
    }

    for (let i = 0; i < node.childNodes.length; i++) {
        sanitizeNodeStyles(node.childNodes[i], validSets, serializer);
    }
}

function wrapInBoxPattern(elements: any[], role: string, boxPatterns: Record<string, string>, serializer: any, parser: any, nextInstId: number, validSets: any): string {
    const patternXml = boxPatterns[role];
    if (!patternXml) {
        console.warn(`[HML-V2 Generator] No pattern found for role: ${role}`);
        return elements.map(el => {
            sanitizeNodeStyles(el, validSets, serializer);
            return serializer.serializeToString(el);
        }).join('\n');
    }

    try {
        const patternDoc = parser.parseFromString(patternXml, 'text/xml');
        const table = patternDoc.documentElement;

        // Update InstId for uniqueness
        table.setAttribute('InstId', String(nextInstId));

        const cells = Array.from(table.getElementsByTagName('CELL')) as Element[];
        for (const cell of cells) {
            const pElem = cell.getElementsByTagName('P')[0];
            const text = (pElem?.textContent || '').trim();

            if (text === '보기박스' || text === '조건박스' || text === '미주박스') {
                // Find PARALIST to append content to
                const paralist = cell.getElementsByTagName('PARALIST')[0];
                if (paralist) {
                    // Clear the placeholder paragraphs but keep PARALIST and CELLMARGIN
                    while (paralist.firstChild) paralist.removeChild(paralist.firstChild);

                    // Title Deduplication: Skip redundant "<보 기>" if template already has it
                    let startIndex = 0;
                    if (role === 'BOX_BOGI') {
                        const firstEl = elements[0];
                        const firstText = (firstEl.textContent || '').trim();
                        if (firstText.includes('보  기') || firstText.includes('보 기') || firstText.includes('보기')) {
                            // Check if any other cell in the template table already contains the title
                            const originalCells = Array.from(table.getElementsByTagName('CELL'));
                            const hasTitleCell = originalCells.some((c: any) => (c.textContent || '').includes('보  기'));
                            if (hasTitleCell) {
                                console.log(`[HML-V2 Generator] Skipping redundant title paragraph in BOX_BOGI: "${firstText}"`);
                                startIndex = 1;
                            }
                        }
                    }

                    // Append elements (skipping title if redundant)
                    for (let k = startIndex; k < elements.length; k++) {
                        const el = elements[k];
                        const tagName = (el.tagName || '').toUpperCase();

                        if (tagName === 'TABLE') {
                            // Check if this table has internal structure we must preserve
                            const rowCount = el.getElementsByTagName('ROW').length;
                            const cellCount = el.getElementsByTagName('CELL').length;

                            // If it's a complex table (multi-row or multi-cell), preserve it
                            if (rowCount > 1 || cellCount > 1) {
                                el.removeAttribute('data-hml-style');
                                el.removeAttribute('data-hml-orig-style');
                                sanitizeNodeStyles(el, validSets, serializer);
                                paralist.appendChild(el);
                            } else {
                                // Single-cell table: extract paragraphs to avoid nesting "wrapper" tables
                                const nestedPs = Array.from(el.getElementsByTagName('P'));
                                nestedPs.forEach(pNode => {
                                    const p = pNode as Element;
                                    p.removeAttribute('data-hml-style');
                                    p.removeAttribute('data-hml-orig-style');
                                    sanitizeNodeStyles(p, validSets, serializer);
                                    paralist.appendChild(p);
                                });
                            }
                        } else {
                            el.removeAttribute('data-hml-style');
                            el.removeAttribute('data-hml-orig-style');
                            sanitizeNodeStyles(el, validSets, serializer);
                            paralist.appendChild(el);
                        }
                    }
                }
                break;
            }
        }

        return serializer.serializeToString(table);
    } catch (e) {
        console.error(`[HML-V2 Generator] Failed to wrap in box pattern for role ${role}`, e);
        return elements.map(el => serializer.serializeToString(el)).join('\n');
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

export function generateHmlV2(questionsWithImages: QuestionWithImages[]): GenerateResult {
    throw new Error('Use generateHmlFromTemplate');
}
