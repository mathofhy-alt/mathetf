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
    const patternsToRemove: string[] = []; // Store InstIds of tables to remove

    for (const table of tables) {
        const ps = Array.from(table.getElementsByTagName('P'));
        let role = '';

        for (const p of ps) {
            const pText = (p.textContent || '').trim();
            if (pText === '보기박스') { role = 'BOX_BOGI'; break; }
            if (pText === '조건박스') { role = 'BOX_JOKUN'; break; }
            if (pText === '미주박스') { role = 'BOX_MIJU'; break; }
            if (pText === '박스안') { role = 'BOX_INNER'; break; }
        }

        if (role) {
            // Store the pattern
            console.log(`[HML-V2 Surgical Generator] Extracted pattern for role: ${role}`);
            boxPatterns[role] = serializer.serializeToString(table);

            // Find InstId for Surgical Removal
            const so = table.getElementsByTagName('SHAPEOBJECT')[0];
            if (so) {
                const instId = so.getAttribute('InstId');
                if (instId) {
                    patternsToRemove.push(instId);
                    console.log(`[HML-V2 Surgical Generator] Marked table for removal (InstId=${instId})`);
                }
            }
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
            cleanedTemplate = cleanedTemplate.replace(marker, '');
        }
    } else {
        // Fallback: Surgical Removal by InstId
        for (const instId of patternsToRemove) {
            cleanedTemplate = removeTableByInstId(cleanedTemplate, instId);
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
        StyleParaShapes: new Map<string, string>(), // StyleId -> ParaShapeId
        BorderFills: new Map<string, string>(), // XML -> Id
        BorderFillIds: new Set<string>(), // Raw IDs in template
        InjectedBorders: [] as { id: string; xml: string }[],
        nextBorderId: 100 // Managed pointer for new IDs
    };


    // Collect valid Style IDs from MAPPINGTABLE
    const mappingTable = templateDoc.getElementsByTagName('MAPPINGTABLE')[0];
    if (mappingTable) {
        const collect = (tagName: string, set: Set<string>, nameMap?: Map<string, string>, styleParaMap?: Map<string, string>) => {
            const elements = mappingTable.getElementsByTagName(tagName);
            for (let i = 0; i < elements.length; i++) {
                const id = elements[i].getAttribute('Id');
                const name = elements[i].getAttribute('Name');
                const paraShape = elements[i].getAttribute('ParaShape');
                if (id) {
                    set.add(id);
                    if (name && nameMap) {
                        nameMap.set(name, id);
                    }
                    if (tagName === 'STYLE' && paraShape && styleParaMap) {
                        styleParaMap.set(id, paraShape);
                    }
                }
            }
        };
        collect('PARASHAPE', validStyles.ParaShape);
        collect('CHARSHAPE', validStyles.CharShape);
        collect('STYLE', validStyles.Style, validStyles.StyleNames, validStyles.StyleParaShapes);

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

    let qIndex = 0;
    for (const qwi of questionsWithImages) {
        qIndex++;
        // Remove Column Breaks (Ctrl+Shift+Enter) as requested
        // Handles both Standalone Tags (<COLBREAK>, <hp:COLBREAK>) and Paragraph Attributes (ColumnBreak="true")
        let cleanContent = qwi.question.content_xml
            .replace(/<(?:hp:)?COLBREAK[^>]*?>/gi, '')
            .replace(/ColumnBreak="true"/gi, '')
            .replace(/ColumnBreak="1"/gi, '');
        const qDoc = parser.parseFromString(`<WRAP>${cleanContent}</WRAP>`, 'text/xml');
        const root = qDoc.documentElement;

        // Safety: Ensure only the first paragraph is treated as the "Question Start" (Style: 문제1)
        // This prevents every line getting a number (1. 2. 3.) if Parser tagged them all as QUESTION
        const allPs = root.getElementsByTagName('P');
        for (let i = 1; i < allPs.length; i++) {
            const p = allPs[i];
            if (p.getAttribute('data-hml-style') === 'QUESTION') {
                p.removeAttribute('data-hml-style'); // Fallback to safe default or "Body" style
            }
        }
        // Auto-Numbering: Apply '문제1' Style (Ctrl+2) to first paragraph
        // This force-applies the Style ID and its associated ParaShape ID
        const firstP = root.getElementsByTagName('P')[0];
        if (firstP) {
            const TARGET_STYLE_NAME = '문제1';
            const styleId = validStyles.StyleNames.get(TARGET_STYLE_NAME);

            if (styleId) {
                firstP.setAttribute('Style', styleId);
                const paraShapeId = validStyles.StyleParaShapes.get(styleId);
                if (paraShapeId) {
                    firstP.setAttribute('ParaShape', paraShapeId);
                }

                // Force 'HamchoromBatang' (CharShape 11) on all TEXT nodes in this paragraph
                // This overrides the Style's default font (ShinMyeongjo)
                const textNodes = firstP.getElementsByTagName('TEXT');
                for (let k = 0; k < textNodes.length; k++) {
                    // Check if CharShape 11 is valid (it should be in this template)
                    if (validStyles.CharShape.has('11')) {
                        textNodes[k].setAttribute('CharShape', '11');
                    } else {
                        // Fallback/Warning if template changed
                        console.warn('[HML-V2 Generator] CharShape "11" (Hamchorom) not found in template! Keeping default.');
                    }
                }

                console.log(`[HML-V2 Generator] Manual Injection: Applied '문제1' (Id=${styleId}, Para=${paraShapeId}) + Hamchorom(CharShape=11) to First Paragraph`);
            } else {
                console.warn(`[HML-V2 Generator] Manual Injection FAILED: '문제1' style not found!`);
            }
        }

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
        console.log(`[HML-V2 DEBUG] Question ${qIndex} has ${children.length} root child nodes`);
        for (const child of children) {
            console.log(`[HML-V2 DEBUG]   - Node: ${child.nodeName}, Content Snippet: ${child.textContent?.substring(0, 20)}`);
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
        console.log(`[HML-V2 DEBUG] questionXml length: ${questionXml.length}`);

        // Remap BinItem/BinData
        remap.forEach((newId, oldId) => {
            console.log(`[HML-V2 DEBUG] Remapping ${oldId} -> ${newId}`);
            // First, normalize IMAGE tags to use BinItem (Hancom requirement)
            // If the source has BinData on IMAGE, convert it to BinItem locally for the regex to catch
            // Or just handle it in the global replace.

            // We want to match BinItem="oldId" OR BinData="oldId"
            // And replace with BinItem="newId" (Force BinItem for usage references)
            // WARNING: BINITEM tag in HEAD uses BinData="ID", but here we are processing BODY content.
            // In BODY, IMAGE tags should use BinItem.
            const pattern = new RegExp(`(BinItem|BinData)="${oldId}"`, 'g');
            questionXml = questionXml.replace(pattern, (match, attr) => {
                // Use a marker to avoid re-matching in the same loop
                return `BinItem="__REMAP_${newId}__"`;
            });
        });

        // After all remappings are done, replace the temporary markers with the actual new IDs
        // This prevents issues where an oldId might be equal to a newId from a previous remapping
        questionXml = questionXml.replace(/BinItem="__REMAP_(\d+)__"/g, (match, newId) => {
            return `BinItem="${newId}"`;
        });

        // Add mandatory Effect="RealPic" to IMAGE if missing
        questionXml = questionXml.replace(/<IMAGE\b([^>]*?)(\/?)>/g, (match, attrs, selfClose) => {
            let newAttrs = attrs;
            if (!newAttrs.includes('Effect="')) newAttrs += ' Effect="RealPic"';
            if (!newAttrs.includes('Alpha="')) newAttrs += ' Alpha="0"';
            if (!newAttrs.includes('Bright="')) newAttrs += ' Bright="0"';
            if (!newAttrs.includes('Contrast="')) newAttrs += ' Contrast="0"';
            return `<IMAGE${newAttrs}${selfClose}>`;
        });

        // Add mandatory TreatAsChar to PICTURE if missing
        questionXml = questionXml.replace(/<PICTURE([^>]*?)(\/?)>/g, (match, attrs, selfClose) => {
            if (!attrs.includes('TreatAsChar')) {
                return `<PICTURE${attrs} TreatAsChar="true"${selfClose}>`;
            }
            return match;
        });

        combinedContentXmlFull += questionXml;

        // Add 5 padding paragraphs between questions for better spacing
        const paddingPara = `<P ParaShape="0" Style="0"><TEXT CharShape="0"><CHAR/></TEXT></P>`;
        combinedContentXmlFull += paddingPara.repeat(5);

        // Layout: Force 2 Questions per Column
        // Insert Column Break (Ctrl+Shift+Enter) after every 2nd question
        // AND after the last question (Requested feature)
        if (qIndex % 2 === 0 || qIndex === questionsWithImages.length) {
            combinedContentXmlFull += `<P ColumnBreak="true" ParaShape="0" Style="0"><TEXT CharShape="0"></TEXT></P>`;
        }
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

    // Try to replace the entire containing paragraph first (Safe Mode)
    // This handles cases where {{CONTENT_HERE}} is inside <P><TEXT><CHAR>...</CHAR></TEXT></P>
    // We want to replace the whole P tag with our content P tags.
    const anchorRegex = /<P[^>]*>\s*<TEXT[^>]*>\s*(?:<CHAR>\s*)?{{CONTENT_HERE}}(?:\s*<\/CHAR>)?\s*<\/TEXT>\s*<\/P>/;

    if (anchorRegex.test(currentHml)) {
        currentHml = currentHml.replace(anchorRegex, combinedContentXmlFull);
    } else {
        // Fallback to direct string replacement (Legacy Mode or if anchor is bare)
        currentHml = currentHml.replace(anchor, combinedContentXmlFull);
    }

    // 3. Surgical Injection of BINDATALIST into HEAD
    if (allImages.length > 0) {
        let binItemsXml = '';
        for (const { newId, image } of allImages) {
            const format = (image.format || 'png').toLowerCase();
            binItemsXml += `<BINITEM BinData="${newId}" Format="${format}" Type="Embedding"/>`;
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


            // Wrap Base64 at 76 chars (MIME standard for XML embedding)
            // Windows-friendly CRLF
            const wrappedBase64 = cleanBase64.match(/.{1,76}/g)?.join('\r\n') || cleanBase64;

            // Base64 length is NOT the correct Size for HML BINDATA
            // It should be the byte size of the original data.
            // If the data is Base64, original size is approx length * 3/4
            // But we might have the actual size in the DB record.
            const rawData = Buffer.from(base64, 'base64');
            const binarySize = image.size_bytes || rawData.length;

            binDataXml += `<BINDATA Id="${newId}" Encoding="Base64" Size="${binarySize}"${image.compressed ? ' Compress="true"' : ''}>${wrappedBase64}</BINDATA>`;
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

    // 5. Update Global Metadata (Picture counts) - ROBUST INJECTION
    if (allImages.length > 0) {
        const totalPics = allImages.length + 10; // Padding for safety

        // Update or Inject Picture count in DOCSETTING
        if (currentHml.includes('<DOCSETTING')) {
            if (currentHml.match(/<DOCSETTING[^>]*?Picture="/)) {
                currentHml = currentHml.replace(/(<DOCSETTING[^>]*?Picture=")(\d+)(")/g, (match, start, count, end) => {
                    return `${start}${parseInt(count, 10) + totalPics}${end}`;
                });
            } else {
                // Inject attribute if missing
                currentHml = currentHml.replace('<DOCSETTING', `<DOCSETTING Picture="${totalPics}"`);
            }
        }

        // Update or Inject Picture count in BEGINNUMBER
        if (currentHml.includes('<BEGINNUMBER')) {
            if (currentHml.match(/<BEGINNUMBER[^>]*?Picture="/)) {
                currentHml = currentHml.replace(/(<BEGINNUMBER[^>]*?Picture=")(\d+)(")/g, (match, start, count, end) => {
                    return `${start}${parseInt(count, 10) + totalPics}${end}`;
                });
            } else {
                currentHml = currentHml.replace('<BEGINNUMBER', `<BEGINNUMBER Picture="${totalPics}"`);
            }
        }
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
    StyleParaShapes: Map<string, string>;
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
            // 1. Priority: Semantic Role Default Mapping
            if (semanticRole === 'QUESTION') targetStyleName = '문제1';
            else if (semanticRole === 'CHOICE') targetStyleName = '오선지';
            else if (semanticRole.startsWith('BOX_')) targetStyleName = '박스안';

            // 2. High Priority: Specific Original Style Preservation
            // If the original HML had a specific style name (e.g. "3선지") and the current template SUPPORTS it, use it.
            const originalStyleName = node.getAttribute('data-hml-orig-style');
            if (originalStyleName && validSets.StyleNames.has(originalStyleName)) {
                console.log(`[HML-V2 Generator] Preserving Original Style: '${originalStyleName}' matches template!`);
                targetStyleName = originalStyleName;
            }

            if (targetStyleName) {
                const targetId = validSets.StyleNames.get(targetStyleName);
                if (targetId) {
                    node.setAttribute('Style', targetId);
                    // Also enforce ParaShape if available in the map
                    const targetPara = validSets.StyleParaShapes.get(targetId);
                    if (targetPara) {
                        node.setAttribute('ParaShape', targetPara);
                    }
                    console.log(`[HML-V2 Generator] sanitizeNodeStyles: Applied Style '${targetStyleName}' (Id=${targetId}, Para=${targetPara}) to P`);
                } else {
                    console.warn(`[HML-V2 Generator] Style Name '${targetStyleName}' not found via validSets.StyleNames!`);
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

    // Repair PICTURE structure (Nuclear Reconstruction)
    if (node.tagName === 'PICTURE') {
        repairPictureStructure(node as Element, serializer);
    }

    for (let i = 0; i < node.childNodes.length; i++) {
        sanitizeNodeStyles(node.childNodes[i], validSets, serializer);
    }
}

function repairPictureStructure(pic: Element, serializer: any) {
    // 1. Ensure IMAGE is a direct child
    // Search deep for IMAGE and move it up if needed.
    const images = pic.getElementsByTagName('IMAGE');
    if (images.length > 0) {
        const img = images[0];
        if (img.parentNode !== pic) {
            img.parentNode?.removeChild(img);
            pic.appendChild(img);
        }

        // Ensure IMAGE has attributes matching Control File
        if (!img.getAttribute('Effect')) img.setAttribute('Effect', 'RealPic');
        if (!img.getAttribute('Alpha')) img.setAttribute('Alpha', '0');

        // 2. Ensure SHAPEOBJECT exists
        let so = pic.getElementsByTagName('SHAPEOBJECT')[0];
        if (!so) {
            so = pic.ownerDocument.createElement('SHAPEOBJECT');
            // Useful attributes from Control File
            so.setAttribute('InstId', String(Math.floor(Math.random() * 100000000) + 2000000000));
            so.setAttribute('Lock', 'false');
            so.setAttribute('NumberingType', 'Figure');
            so.setAttribute('ZOrder', '0');
            pic.insertBefore(so, pic.firstChild); // Should be first
        }

        // 3. Ensure SIZE exists inside SHAPEOBJECT
        let size = so.getElementsByTagName('SIZE')[0];
        if (!size) {
            size = pic.ownerDocument.createElement('SIZE');
            size.setAttribute('Width', '17700'); // ~50mm
            size.setAttribute('Height', '12960'); // ~36mm
            size.setAttribute('WidthRelTo', 'Absolute');
            size.setAttribute('HeightRelTo', 'Absolute');
            size.setAttribute('Protect', 'false');
            so.appendChild(size);
        }

        // 4. Ensure POSITION exists inside SHAPEOBJECT (Contains TreatAsChar)
        let pos = so.getElementsByTagName('POSITION')[0];
        if (!pos) {
            pos = pic.ownerDocument.createElement('POSITION');
            pos.setAttribute('TreatAsChar', 'true'); // CRITICAL
            pos.setAttribute('HorzAlign', 'Left');
            pos.setAttribute('VertAlign', 'Top');
            pos.setAttribute('HorzRelTo', 'Column');
            pos.setAttribute('VertRelTo', 'Para');
            pos.setAttribute('FlowWithText', 'true');
            pos.setAttribute('AllowOverlap', 'false');
            so.appendChild(pos);
        } else {
            // Force TreatAsChar if it exists but is false
            pos.setAttribute('TreatAsChar', 'true');
        }

        // Remove TreatAsChar from PICTURE if present (It belongs in POSITION)
        if (pic.hasAttribute('TreatAsChar')) {
            pic.removeAttribute('TreatAsChar');
        }

        // 5. Ensure SHAPECOMPONENT exists (Sibling of SHAPEOBJECT in Control File)
        let sc = pic.getElementsByTagName('SHAPECOMPONENT')[0];
        if (!sc) {
            sc = pic.ownerDocument.createElement('SHAPECOMPONENT');
            sc.setAttribute('InstID', String(Math.floor(Math.random() * 1000000000)));
            sc.setAttribute('OriWidth', '17700');
            sc.setAttribute('OriHeight', '12960');
            sc.setAttribute('XPos', '0');
            sc.setAttribute('YPos', '0');
            sc.setAttribute('GroupLevel', '0');
            // Insert after SHAPEOBJECT
            if (so.nextSibling) {
                pic.insertBefore(sc, so.nextSibling);
            } else {
                pic.appendChild(sc);
            }
        }

        // 6. Ensure IMAGERECT exists (Sibling)
        let rect = pic.getElementsByTagName('IMAGERECT')[0];
        if (!rect) {
            rect = pic.ownerDocument.createElement('IMAGERECT');
            rect.setAttribute('X0', '0');
            rect.setAttribute('Y0', '0');
            rect.setAttribute('X1', '17700');
            rect.setAttribute('Y1', '0');
            rect.setAttribute('X2', '17700');
            rect.setAttribute('Y2', '12960');
            rect.setAttribute('X3', '0');
            rect.setAttribute('Y3', '12960');
            // Insert after SHAPECOMPONENT
            if (sc.nextSibling) {
                pic.insertBefore(rect, sc.nextSibling);
            } else {
                pic.appendChild(rect);
            }
        }

        // 7. Ensure IMAGECLIP exists (Sibling)
        let clip = pic.getElementsByTagName('IMAGECLIP')[0];
        if (!clip) {
            clip = pic.ownerDocument.createElement('IMAGECLIP');
            clip.setAttribute('Top', '0');
            clip.setAttribute('Left', '0');
            clip.setAttribute('Right', '17700'); // Should match width usually, or larger
            clip.setAttribute('Bottom', '12960');

            // Insert after IMAGERECT
            if (rect.nextSibling) {
                pic.insertBefore(clip, rect.nextSibling);
            } else {
                pic.appendChild(clip);
            }
        }
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

function removeTableByInstId(hml: string, instId: string): string {
    // 1. Find the InstId location
    const instIdMarker = `InstId="${instId}"`;
    const instIdIdx = hml.indexOf(instIdMarker);
    if (instIdIdx === -1) {
        console.warn(`[HML-V2 Surgical Generator] Could not find InstId="${instId}" to remove table.`);
        return hml;
    }

    // 2. Scan BACKWARDS to find the opening <TABLE> tag that contains this InstId
    let tableStartIdx = -1;
    let searchPos = instIdIdx;

    while (true) {
        const openIdx = hml.lastIndexOf('<TABLE', searchPos);
        if (openIdx === -1) break; // Not found?

        const closeIdx = hml.indexOf('</TABLE>', openIdx);
        // If the table closes *before* our InstId, it's a sibling. Keep searching back.
        if (closeIdx !== -1 && closeIdx < instIdIdx) {
            searchPos = openIdx - 1;
            continue;
        }

        // Found it! This TABLE opens before InstId and doesn't close before it.
        tableStartIdx = openIdx;
        break;
    }

    if (tableStartIdx === -1) {
        console.warn(`[HML-V2 Surgical Generator] Could not find opening <TABLE> for InstId="${instId}".`);
        return hml;
    }

    // 3. Scan FORWARDS to find the matching </TABLE>
    // We need to handle nesting of <TABLE> ... </TABLE>
    let nesting = 0;
    let scanPos = tableStartIdx + '<TABLE'.length;
    let tableEndIdx = -1;

    while (scanPos < hml.length) {
        const nextOpen = hml.indexOf('<TABLE', scanPos);
        const nextClose = hml.indexOf('</TABLE>', scanPos);

        if (nextClose === -1) break; // Error: Unclosed table

        if (nextOpen !== -1 && nextOpen < nextClose) {
            // Nested table opens
            nesting++;
            scanPos = nextOpen + '<TABLE'.length;
        } else {
            // Table closes
            if (nesting > 0) {
                nesting--;
                scanPos = nextClose + '</TABLE>'.length;
            } else {
                // Determine the end of </TABLE>
                tableEndIdx = nextClose + '</TABLE>'.length;
                break;
            }
        }
    }

    if (tableEndIdx !== -1) {
        console.log(`[HML-V2 Surgical Generator] Surgically removing TABLE for InstId="${instId}" (Range: ${tableStartIdx}-${tableEndIdx})`);
        // Also remove following newline/whitespace if possible to leave clean XML
        let cutStart = tableStartIdx;
        let cutEnd = tableEndIdx;

        return hml.substring(0, cutStart) + hml.substring(cutEnd);
    }

    return hml;
}
