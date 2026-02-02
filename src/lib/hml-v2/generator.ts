/**
 * HML V2 Generator (Surgical String Splicing Implementation)
 * 
 * Strategy: Perform string-level replacement of {{CONTENT_HERE}} 
 * and surgical insertion of binary data into HEAD/TAIL.
 * This ensures no DOM transformation or namespace corruption occurs to the template.
 */

import { DOMParser, XMLSerializer } from 'xmldom';
import * as fs from 'fs';
import * as path from 'path';
import type { GenerateResult, DbQuestionImage, QuestionWithImages } from './types';

export function generateHmlFromTemplate(
    templateContent: string,
    questionsWithImages: QuestionWithImages[],
    options?: { title?: string; date?: string }
): GenerateResult {
    console.log(`[HML-V2 Surgical Generator] Processing ${questionsWithImages.length} questions`);

    // [METADATA INJECTION] Replace {{TITLE}} and {{DATE}}
    if (options) {
        if (options.title) {
            // Simple replaceAll equivalent
            templateContent = templateContent.split('{{TITLE}}').join(options.title);
            console.log(`[HML-V2 Generator] Injected Title: ${options.title}`);
        }
        if (options.date) {
            templateContent = templateContent.split('{{DATE}}').join(options.date);
            console.log(`[HML-V2 Generator] Injected Date: ${options.date}`);
        }
    }

    const serializer = new XMLSerializer();
    const parser = new DOMParser();



    // [STYLE UPDATE] Ensure 'Hidden' Style (White, 1pt) exists
    // We inject it into the string BEFORE parsing to avoid serializer quirks.
    let hiddenStyleId = '9999'; // Default high ID
    const charShapeListMatch = templateContent.match(/<CHARSHAPELIST Count="(\d+)">/);
    if (charShapeListMatch) {
        let count = parseInt(charShapeListMatch[1], 10);

        // Find max ID to pick a safe new ID
        let maxId = 0;
        const idRegex = /<CHARSHAPE[^>]*Id="(\d+)"/g;
        let match;
        while ((match = idRegex.exec(templateContent)) !== null) {
            const id = parseInt(match[1], 10);
            if (id > maxId) maxId = id;
        }
        hiddenStyleId = String(maxId + 1);

        // Construct new CharShape (Height=100 (1pt), TextColor=16777215 (White))
        // We use standard FONTIDs (0) assuming they exist (Standard HWP fonts)
        const newStyle = `<CHARSHAPE Id="${hiddenStyleId}" Height="100" TextColor="16777215" ShadeColor="4294967295" UseFontSpace="false" UseKerning="false" SymMark="0" BorderFillId="3"><FONTID Hangul="0" Hanja="0" Japanese="0" Latin="0" Other="0" Symbol="0" User="0"/><RATIO Hangul="100" Hanja="100" Japanese="100" Latin="100" Other="100" Symbol="100" User="100"/><CHARSPACING Hangul="0" Hanja="0" Japanese="0" Latin="0" Other="0" Symbol="0" User="0"/><RELSIZE Hangul="100" Hanja="100" Japanese="100" Latin="100" Other="100" Symbol="100" User="100"/><CHAROFFSET Hangul="0" Hanja="0" Japanese="0" Latin="0" Other="0" Symbol="0" User="0"/></CHARSHAPE>`;

        // Inject
        const closeTag = '</CHARSHAPELIST>';
        if (templateContent.includes(closeTag)) {
            templateContent = templateContent.replace(closeTag, newStyle + closeTag);
            // Update Count
            templateContent = templateContent.replace(charShapeListMatch[0], `<CHARSHAPELIST Count="${count + 1}">`);
            console.log(`[HML-V2 Generator] Injected Hidden Style Id="${hiddenStyleId}"`);
        }
    }

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
    const imageHashMap = new Map<string, string>(); // Hash -> NewId (for Deduplication)



    // [CRITICAL FIX] Avoid Collision with Template Images
    // The template (hml v2-test-tem.hml) likely contains existing images (BinItem="1", "2"...).
    // If we start at 1, we create duplicate IDs, and Hancom renders the template's image (the "Wrong Image").
    // We start at 5000 to guarantee uniqueness.
    let nextImageId = 5000;
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

        // [HACK] Hide Endnote References (Miju)
        // User requested to make them White and Size 1.
        // We look for <ENDNOTE> tags and apply CharShape="3" (Height=100, Color=White assumed from Template)
        const endnotes = root.getElementsByTagName('ENDNOTE');
        if (endnotes.length > 0) {
            // Check if CharShape 3 exists (Hidden Style)
            const HIDDEN_STYLE_ID = hiddenStyleId;
            console.log(`[HML-GEN] Found ${endnotes.length} Endnotes. checking style ${HIDDEN_STYLE_ID}...`);
            if (validStyles.CharShape.has(HIDDEN_STYLE_ID)) {
                console.log('[HML-GEN] CharShape 3 exists. Applying hidden style...');
                // IMPORTANT: Iterate BACKWARDS because getElementsByTagName returns a LIVE collection.
                // Modifying the DOM (removing elements) shifts indices.
                for (let k = endnotes.length - 1; k >= 0; k--) {
                    const en = endnotes[k];
                    // The Endnote reference style is determined by the enclosing TEXT tag's CharShape.
                    // We must find the parent TEXT tag.
                    let parentText = en.parentNode as Element;
                    if (parentText && parentText.nodeName === 'TEXT') {
                        console.log(`[HML-GEN] Wrapping Endnote ${k} in hidden text.`);
                        const newText = qDoc.createElement('TEXT');
                        newText.setAttribute('CharShape', HIDDEN_STYLE_ID);

                        // Move EN from parent to new wrapper
                        parentText.removeChild(en);

                        // Insert New Text before Parent
                        // This safely places the hidden reference immediately before the text it was attached to
                        if (parentText.parentNode) {
                            parentText.parentNode.insertBefore(newText, parentText);
                        }

                        // Add a specialized CHAR?
                        // HWPML often relies on a placeholder char.
                        // But usually for Control Chars, just the tag is enough.
                        // However, to be safe and ensure "Text" node validity:
                        const dummyChar = qDoc.createElement('CHAR');
                        dummyChar.textContent = ' ';
                        newText.appendChild(dummyChar);
                        newText.appendChild(en);
                    }
                }
            }
        }

        // Remap images for this question with Deduplication
        const remap = new Map<string, number>();
        const imageToIndexMap = new Map<any, number>(); // Stores 1-based index for BinItem refs

        // [DUAL-MODE STRATEGY]
        // Mode A: "Image Mode" (Optimized)
        // If a Question Manual Capture (MANUAL_Q_) exists, we usage it EXCLUSIVELY.
        // We generate a simple XML wrapping this image and discard the complex Text/Equation/SVG mess.
        // This guarantees Small Size + Perfect Visibility.

        // Mode B: "Text Mode" (Safe)
        // If no Manual Capture, we preserve the original XML and ALL images (including SVGs).
        // We DO NOT attempt to swap or filter, as equation linking is implicit and fragile.

        let heroQuestionImg: DbQuestionImage | null = null;

        // [MODE B FORCE] Hero Detection Disabled to prevent Exclusive Filtering
        // for (const img of qwi.images) { ... }

        // 2. Process Images based on Mode
        for (const img of qwi.images) {
            // Mode A: If Hero exists, skip everything else
            if (heroQuestionImg && img !== heroQuestionImg) {
                continue;
            }

            // [Manual Filter Removed] to ensure all images are available

            // Mode B: Keep everything (Standard processing)

            let newId: number;
            const imgData = img.data || '';

            // [FIX] Deduplication Re-Enabled
            // We use the image data hash/content to detect duplicates.
            const isValidData = imgData.length > 100;
            if (isValidData && imageHashMap.has(imgData)) {
                newId = parseInt(imageHashMap.get(imgData)!, 10);
                // console.log(`[HML-V2] Deduplicated Image (Size: ${imgData.length}) -> ID ${newId}`);
            } else {
                const listIndex = allImages.length + 1;
                newId = listIndex;

                allImages.push({ originalId: img.original_bin_id, newId, image: img });

                if (isValidData) {
                    imageHashMap.set(imgData, String(newId));
                }
            }

            // Store the 1-based INDEX (which is newId) for this exact image object reference
            imageToIndexMap.set(img, newId);

            // Remap is NOT used here anymore, we build it locally per question
        }

        // Create a lookup for NewID -> Image Metadata
        const newIdToImage = new Map<number, DbQuestionImage>();
        for (const item of allImages) {
            newIdToImage.set(item.newId, item.image);
        }

        let questionXml = '';

        if (false) { // [FORCE TEXT MODE] User requests full text + endnotes
            // --- MODE A: IMAGE GENERATION (DISABLED) ---
            console.log(`[HML-V2 DUAL-MODE] Question ${qIndex}: Active IMAGE MODE (Using ${heroQuestionImg?.original_bin_id})`);

            const newId = remap.get(heroQuestionImg?.original_bin_id || '')!;
            const imgInfo = heroQuestionImg;
            const fmt = (imgInfo?.format || 'jpg').toLowerCase();
            const ext = fmt === 'jpeg' ? 'jpg' : fmt;
            const imgAny = imgInfo as any;

            // [CRASH FIX] Retrieve VALID Style/ParaShape IDs from the original first Paragraph
            // Hardcoding "0" causes crash if Style 0 is not defined or invalid.
            let safeStyle = "0";
            let safePara = "0";
            let safeChar = "0";

            const firstP = root.getElementsByTagName('P')[0];
            if (firstP) {
                if (firstP.hasAttribute('Style')) safeStyle = firstP.getAttribute('Style')!;
                if (firstP.hasAttribute('ParaShape')) safePara = firstP.getAttribute('ParaShape')!;

                // Try to find a TEXT node for CharShape
                const textNodes = firstP.getElementsByTagName('TEXT');
                if (textNodes.length > 0 && textNodes[0].hasAttribute('CharShape')) {
                    safeChar = textNodes[0].getAttribute('CharShape')!;
                }
            }

            // [CRASH FIX v3] STRICT HML XML STRUCTURE
            // <PICTURE> must NOT have BinItem directly. It acts as a wrapper.
            // Attributes must be on <IMAGE> child.
            // Mandatory Children in Order: SHAPEOBJECT, SHAPECOMPONENT, IMAGERECT, IMAGECLIP, INSIDEMARGIN, IMAGE

            const w = imgAny.width || 5000;
            const h = imgAny.height || 5000;
            const randId = Math.floor(Math.random() * 100000000);

            questionXml = `
<P ParaShape="${safePara}" Style="${safeStyle}">
    <TEXT CharShape="${safeChar}">
        <PICTURE Reverse="false">
            <SHAPEOBJECT InstId="${randId}" Lock="false" NumberingType="Figure" TextFlow="BothSides" ZOrder="0">
                <SIZE Height="${h}" HeightRelTo="Absolute" Protect="false" Width="${w}" WidthRelTo="Absolute"/>
                <POSITION AffectLSpacing="false" AllowOverlap="false" FlowWithText="true" HoldAnchorAndSO="false" HorzAlign="Left" HorzOffset="0" HorzRelTo="Column" TreatAsChar="true" VertAlign="Top" VertOffset="0" VertRelTo="Para"/>
                <OUTSIDEMARGIN Bottom="0" Left="0" Right="0" Top="0"/>
                <SHAPECOMMENT>Generated by Antigravity</SHAPECOMMENT>
            </SHAPEOBJECT>
            <SHAPECOMPONENT GroupLevel="0" HorzFlip="false" InstID="${randId + 1}" OriHeight="${h}" OriWidth="${w}" VertFlip="false" XPos="0" YPos="0">
                <ROTATIONINFO Angle="0" CenterX="${Math.floor(w / 2)}" CenterY="${Math.floor(h / 2)}"/>
                <RENDERINGINFO>
                    <TRANSMATRIX E1="1.00000" E2="0.00000" E3="0.00000" E4="0.00000" E5="1.00000" E6="0.00000"/>
                    <SCAMATRIX E1="1.00000" E2="0.00000" E3="0.00000" E4="0.00000" E5="1.00000" E6="0.00000"/>
                    <ROTMATRIX E1="1.00000" E2="0.00000" E3="0.00000" E4="0.00000" E5="1.00000" E6="0.00000"/>
                </RENDERINGINFO>
            </SHAPECOMPONENT>
            <IMAGERECT X0="0" X1="${w}" X2="${w}" X3="0" Y0="0" Y1="0" Y2="${h}" Y3="${h}"/>
            <IMAGECLIP Bottom="${h}" Left="0" Right="${w}" Top="0"/>
            <INSIDEMARGIN Bottom="0" Left="0" Right="0" Top="0"/>
            <IMAGE Alpha="0" BinItem="${newId}" Bright="0" Contrast="0" Effect="RealPic"/>
        </PICTURE>
        <CHAR/>
    </TEXT>
</P>`;
        } else {
            // --- MODE B: TEXT MODE (SAFE) ---
            console.log(`[HML-V2 DUAL-MODE] Question ${qIndex}: Active TEXT MODE (Preserving original content)`);

            // Revert to Standard DOM Processing (Box Wrapping, etc.)

            const finalNodes: string[] = [];
            let currentGroup: any[] = [];
            let currentRole = '';

            // (Keep existing DOM traversal logic but remove the image processing part needed for swap)
            // Actually, we can keep the image processor for safety (to ensure attributes), but no swapping/filtering.

            // [FIX] Build LOCAL REMAP for this specific question
            // Maps original_bin_id -> 1-based List Index (for BinItem attribute)
            const localRemap = new Map<string, number>();
            for (const img of qwi.images) {
                const idx = imageToIndexMap.get(img);
                if (idx) {
                    localRemap.set(img.original_bin_id, idx);
                }
            }

            // Helper to process Image Nodes (PICTURE, IMAGE) for attributes ONLY
            const processImageNode = (el: Element) => {
                // Check BinItem, BinData, data-hml-bin-id
                const attrNames = ['BinItem', 'BinData', 'data-hml-bin-id'];
                let oldId = '';
                let targetAttr = '';

                for (const name of attrNames) {
                    if (el.hasAttribute(name)) {
                        oldId = el.getAttribute(name)!;
                        targetAttr = name;
                        break;
                    }
                }

                if (oldId && localRemap.has(oldId)) {
                    const newIndex = localRemap.get(oldId)!;
                    // console.log(`[HML-V2 DOM REMAP] ${el.tagName} Id="${oldId}" -> "${newId}"`);

                    // 1. Update ID to the 1-based INDEX
                    // [CRITICAL FIX] FAILSAFE: Always set 'BinItem' because Hancom ignores 'data-hml-bin-id'
                    // REVERT: Hancom requires List Index (1, 2, 3...), NOT the BinData ID (5000...).
                    // The link is IMAGE(BinItem=Index) -> BINDATALIST[Index] -> BINITEM(BinData=ID) -> BINDATA(Id=ID).
                    el.setAttribute('BinItem', String(newIndex));
                    if (targetAttr !== 'BinItem') {
                        el.removeAttribute(targetAttr);
                    }

                    // 2. Fix Format Attributes (Vital for SVG->PNG Swap)
                    // We need the ACTUAL newId (5000 + Index) to look up metadata?
                    // No, invalid assumption. We can look up by Index if we stored it?
                    // Or just look up 'newIdToImage' using Index?
                    const realNewId = newIndex;
                    const imgInfo = newIdToImage.get(realNewId);
                    if (imgInfo) {
                        const fmt = (imgInfo.format || 'jpg').toLowerCase();
                        const ext = fmt === 'jpeg' ? 'jpg' : fmt;

                        // Hancom expects specific Format strings
                        if (el.tagName === 'PICTURE' || el.tagName === 'IMAGE') {
                            el.setAttribute('Format', ext);
                            el.setAttribute('Ext', `.${ext}`);
                        }
                    }
                } else if (oldId) {
                    // [FIX] Broken Link Protection: Image missing from DB?
                    // Force to "0" to show Red X. Avoids Zombie Fallback.
                    el.setAttribute(targetAttr, "0");
                }


                // Mandatory Hancom Attributes
                if (el.tagName === 'IMAGE') {
                    if (!el.hasAttribute('Effect')) el.setAttribute('Effect', 'RealPic');
                    if (!el.hasAttribute('Alpha')) el.setAttribute('Alpha', '0');
                    if (!el.hasAttribute('Bright')) el.setAttribute('Bright', '0');
                    if (!el.hasAttribute('Contrast')) el.setAttribute('Contrast', '0');
                }
                if (el.tagName === 'PICTURE') {
                    if (!el.hasAttribute('TreatAsChar')) el.setAttribute('TreatAsChar', 'true');
                }
            };

            const children = Array.from(root.childNodes);
            console.log(`[HML-V2 DEBUG] Question ${qIndex} has ${children.length} root child nodes`);
            for (const child of children) {
                // console.log(`[HML-V2 DEBUG]   - Node: ${child.nodeName}`);
                if (child.nodeType !== 1) continue;
                const el = child as Element;

                // [NEW] Process Images Recursively in this Element
                // This handles images inside P/TEXT/CHAR structures
                const images = el.getElementsByTagName('IMAGE');
                const pictures = el.getElementsByTagName('PICTURE');
                for (let i = 0; i < images.length; i++) processImageNode(images[i]);
                for (let i = 0; i < pictures.length; i++) processImageNode(pictures[i]);

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
            questionXml = finalNodes.join('\n');
            console.log(`[HML-V2 DEBUG] questionXml length: ${questionXml.length}`);


            combinedContentXmlFull += questionXml;

            // Add 10 padding paragraphs between questions for better spacing
            const paddingPara = `<P ParaShape="0" Style="0"><TEXT CharShape="0"><CHAR/></TEXT></P>`;
            combinedContentXmlFull += paddingPara.repeat(10);

            // Layout: Special First Column (1 Question), then 2 Questions per Column
            // Col 1: Q1
            // Col 2: Q2, Q3
            // Col 3: Q4, Q5...
            const isFirstCol = qIndex === 1;
            const isSubsequentColEnd = qIndex > 1 && (qIndex - 1) % 2 === 0;
            const isLast = qIndex === questionsWithImages.length;

            if (isFirstCol || isSubsequentColEnd || isLast) {
                combinedContentXmlFull += `<P ColumnBreak="true" ParaShape="0" Style="0"><TEXT CharShape="0"></TEXT></P>`;
            }
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
    // --- FINAL ASSEMBLY: ZOMBIE IMAGE FILTERING (HYBRID STRATEGY ACTIVE) ---
    // Strategy:
    // 1. Non-SVG Images: ALWAYS KEEP (Protects User Captures)
    // 2. SVG Images: STRICT USAGE CHECK (Removes Math Bloat)

    let usedImages = allImages; // [FIX] DISABLE FILTERING to preserve 1-based indexing for BinItem references
    /*
    allImages.filter(img => {
        const id = String(img.newId);
        // ... filtering disabled for stability ...
        return true;
    });
    */

    console.log(`[HML-V2 FINAL-OPTIMIZED] Filtered Images: ${allImages.length} -> ${usedImages.length}`);

    // SAFETY NET: If we filtered out ALL images but we started with some, something is critical.
    if (usedImages.length === 0 && allImages.length > 0) {
        console.warn('[HML-V2 ZOMBIE FILTER] WARNING: All images were filtered out! Reverting to SAFE MODE.');
        usedImages = allImages;
    }

    // Additional Safety: If filtered count is suspiciously low (< 5%) for a large set, maybe warn? 
    // For now, the 0-check is the most critical safety net.

    if (!combinedContentXmlFull.trim()) {
        combinedContentXmlFull = '<P><TEXT>No Content</TEXT></P>';
    }

    // Replace {{CONTENT_HERE}} using standard template variable 'currentHml'
    // CRITICAL: Use Regex to replace the wrapping <P> tag.
    // Simple string replacement creates <P><TEXT><P>...</P></TEXT></P> which is INVALID nested XML.
    const anchorRegex = /<P[^>]*>\s*<TEXT[^>]*>\s*(?:<CHAR>\s*)?{{CONTENT_HERE}}(?:\s*<\/CHAR>)?\s*<\/TEXT>\s*<\/P>/;

    if (anchorRegex.test(currentHml)) {
        currentHml = currentHml.replace(anchorRegex, combinedContentXmlFull);
    } else if (currentHml.includes('{{CONTENT_HERE}}')) {
        // Fallback for simple anchor
        currentHml = currentHml.replace('{{CONTENT_HERE}}', combinedContentXmlFull);
    } else {
        console.warn('[HML-V2 Surgical Generator] Anchor "{{CONTENT_HERE}}" NOT found in template! Injecting at end of SECTION.');
        // Fallback: Inject before </SECTION>
        const secEnd = currentHml.lastIndexOf('</SECTION>');
        if (secEnd !== -1) {
            currentHml = currentHml.substring(0, secEnd) + combinedContentXmlFull + currentHml.substring(secEnd);
        }
    }

    // Construct BINDATA LIST & STORAGE
    let binDataList = '';
    let binDataStorage = '';

    for (const item of usedImages) {
        const img = item.image;
        const newId = item.newId;

        const format = (img.format || 'png').toLowerCase();
        const type = 'Embedding';

        binDataList += `<BINITEM BinData="${newId}" Format="${format}" Type="${type}"/>`;

        const compressAttr = img.compressed ? 'Compress="true"' : '';
        const sizeAttr = `Size="${img.size_bytes || (img as any).image_size || 0}"`;

        let base64 = img.data || '';
        if (base64.startsWith('data:')) base64 = base64.split(',')[1] || base64;
        const cleanBase64 = base64.replace(/[^A-Za-z0-9+/=]/g, '');
        const wrappedBase64 = cleanBase64.match(/.{1,76}/g)?.join('\r\n') || cleanBase64;

        binDataStorage += `<BINDATA Id="${newId}" ${sizeAttr} ${compressAttr} Encoding="Base64" Type="${type}">${wrappedBase64}</BINDATA>`;
    }

    // [CRITICAL FIX] PURGE TEMPLATE BINARIES
    // The template contains "Zombie Images" (old manual captures, etc.) at IDs 1, 2...
    // We must physically remove them so Hancom NEVER falls back to them.
    // We replace the entire content of BINDATALIST and BINDATASTORAGE with our new list.

    if (usedImages.length >= 0) { // Always update even if 0 images (to clear template)

        // 1. Purge & Update BINDATALIST
        if (currentHml.includes('<BINDATALIST')) {
            // Replace <BINDATALIST ...>...content...</BINDATALIST>
            // Note: Regex dot matches newline? No, in JS dot doesn't match newline. Use [\s\S].
            const newListTag = `<BINDATALIST Count="${usedImages.length}">${binDataList}</BINDATALIST>`;
            currentHml = currentHml.replace(/<BINDATALIST[^>]*>[\s\S]*?<\/BINDATALIST>/, newListTag);
        } else if (currentHml.match(/<MAPPINGTABLE[^>]*>/)) {
            currentHml = currentHml.replace(/<MAPPINGTABLE([^>]*)>/, `<MAPPINGTABLE$1><BINDATALIST Count="${usedImages.length}">${binDataList}</BINDATALIST>`);
        } else {
            // Inject into HEAD if missing
            const headTagMatch = currentHml.match(/<HEAD[^>]*?>/);
            if (headTagMatch) {
                const headTag = headTagMatch[0];
                currentHml = currentHml.replace(headTag, `${headTag}<MAPPINGTABLE><BINDATALIST Count="${usedImages.length}">${binDataList}</BINDATALIST></MAPPINGTABLE>`);
            }
        }

        // 2. Purge & Update BINDATASTORAGE
        // Similar logic: Wipe existing storage
        const newStorageTag = `<BINDATASTORAGE Count="${usedImages.length}">${binDataStorage}</BINDATASTORAGE>`;

        if (currentHml.includes('<BINDATASTORAGE')) {
            currentHml = currentHml.replace(/<BINDATASTORAGE[^>]*>[\s\S]*?<\/BINDATASTORAGE>/, newStorageTag);
        } else {
            // Inject at end of BODY (TAIL) or before </DOC>
            // HML Structure: <DOC> <HEAD>...</HEAD> <BODY>...</BODY> <TAIL><BINDATASTORAGE.../></TAIL> </DOC>
            // Wait, standard HML has <TAIL> for scripts and storage.
            const tailMatch = currentHml.match(/<TAIL[^>]*?>/);
            if (tailMatch) {
                // Wipe content of TAIL? No, TAIL might have scripts.
                // Just look for STORAGE inside TAIL (handled above).
                // If storage missing but TAIL exists:
                currentHml = currentHml.replace(/<\/TAIL>/, `${newStorageTag}</TAIL>`);
            } else {
                // Create TAIL before /DOC
                const docEnd = currentHml.lastIndexOf('</HWPML>'); // or </DOC> depending on root
                if (docEnd !== -1) {
                    currentHml = currentHml.substring(0, docEnd) + `<TAIL>${newStorageTag}</TAIL>` + currentHml.substring(docEnd);
                }
            }
        }


        // The anchorRegex.test(currentHml) block is now removed as its content has been moved up.
        // The original code had a `currentHml` assignment inside this block, which is no longer needed.

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
    imagesByQuestion: Map<string, DbQuestionImage[]>,
    options?: { title?: string; date?: string }
): GenerateResult {
    const questionsWithImages: QuestionWithImages[] = questions.map(q => ({
        question: q,
        images: imagesByQuestion.get(q.id) || []
    }));
    return generateHmlFromTemplate(templateContent, questionsWithImages, options);
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
