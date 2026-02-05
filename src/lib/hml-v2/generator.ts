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
    console.log("DEBUG: GENERATOR FUNCTION START");
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



    // [V47] LAYOUT COMPATIBILITY PATCH
    // The template often has ApplyNextspacingOfLastPara="false", which ignores paragraph bottom margins
    // when they are at the end of a container (like our invisible table cells).
    if (templateContent.includes('ApplyNextspacingOfLastPara="false"')) {
        console.log(`[HML-V2] V47 Patch: Enabling ApplyNextspacingOfLastPara (Global) to allow question spacing.`);
        templateContent = templateContent.replace(/ApplyNextspacingOfLastPara="false"/g, 'ApplyNextspacingOfLastPara="true"');
    }

    const normalize = (s: string) => s.replace(/\s+/g, '').toLowerCase();

    // [V35] ROBUST STYLE DETECTION
    let styleIdToApply = "1";
    let targetParaId = "";
    let targetCharId = "";
    let normalParaId = "1"; // 바탕글 ParaShape Fallback

    // [V52] DOM-BASED INJECTION FOR ROBUSTNESS
    const serializer = new XMLSerializer();
    const parser = new DOMParser();
    const templateDoc = parser.parseFromString(templateContent, 'text/xml');

    const validStyles = {
        ParaShape: new Set<string>(),
        CharShape: new Set<string>(),
        Style: new Set<string>(),
        StyleNames: new Map<string, string>(), // Name -> ID
        NormalizedStyleNames: new Map<string, string>(), // Normalized Name -> ID
        StyleParaShapes: new Map<string, string>(), // StyleID -> ParaShapeID
        StyleCharShapes: new Map<string, string>(), // StyleID -> CharShapeID
        BorderFills: new Map<string, string>(), // XML Hash -> ID
        BorderFillIds: new Set<string>(),
        InjectedBorders: [] as { id: string; xml: string }[],
        nextBorderId: 100 // Managed pointer for new IDs
    };

    try {
        const stylesRaw = templateDoc.getElementsByTagName('STYLE');
        const styleEls: { id: string; name: string; ps: string; cs: string; engName?: string; el: Element }[] = [];
        for (let i = 0; i < stylesRaw.length; i++) {
            const el = stylesRaw[i];
            styleEls.push({
                id: el.getAttribute('Id') || '',
                name: el.getAttribute('Name') || '',
                ps: el.getAttribute('ParaShape') || '',
                cs: el.getAttribute('CharShape') || '',
                engName: el.getAttribute('EngName') || '',
                el: el
            });
        }

        const nameKeywords = "(문제|문항|Question|Item|문항_스타일)";
        const normalStyle = styleEls.find(s => s.id === "0") || styleEls.find(s => s.engName === "Normal") || styleEls[0];
        const questionStyle = styleEls.find(s => s.id === "1") || styleEls.find(s => new RegExp(nameKeywords, "i").test(s.name)) || styleEls[0];

        normalParaId = normalStyle.ps;
        styleIdToApply = questionStyle.id;
        targetParaId = questionStyle.ps;
        targetCharId = questionStyle.cs;

        console.log(`[HML-V2] V53 DOM Audit: NormalPS=${normalParaId}, QuestionPS=${targetParaId} (Style ${styleIdToApply})`);

        const mappingTable = templateDoc.getElementsByTagName('MAPPINGTABLE')[0];

        // [V57] COLLECT MAPPINGS EARLY (Before injection) so Glue IDs can inherit base shapes correctly
        if (mappingTable) {
            const collect = (tagName: string, set: Set<string>, nameMap?: Map<string, string>, styleParaMap?: Map<string, string>, styleCharMap?: Map<string, string>) => {
                const elements = mappingTable.getElementsByTagName(tagName);
                for (let i = 0; i < elements.length; i++) {
                    const id = elements[i].getAttribute('Id');
                    const name = elements[i].getAttribute('Name');
                    const paraShape = elements[i].getAttribute('ParaShape');
                    const charShape = elements[i].getAttribute('CharShape');
                    if (id) {
                        set.add(id);
                        if (name && nameMap) {
                            nameMap.set(name, id);
                            validStyles.NormalizedStyleNames.set(normalize(name), id);
                            // console.log(`[HML-V2 STYLE-DB] Style: "${name}" (ID: ${id})`);
                        }
                        if (tagName === 'STYLE' && styleParaMap && paraShape) {
                            styleParaMap.set(id, paraShape);
                        }
                        if (tagName === 'STYLE' && styleCharMap && charShape) {
                            styleCharMap.set(id, charShape);
                        }
                    }
                }
            };
            collect('PARASHAPE', validStyles.ParaShape);
            collect('CHARSHAPE', validStyles.CharShape);
            collect('STYLE', validStyles.Style, validStyles.StyleNames, validStyles.StyleParaShapes, validStyles.StyleCharShapes);

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

        if (mappingTable && targetParaId) {
            const getParaXML = (pid: string) => {
                const list = templateDoc.getElementsByTagName('PARASHAPELIST')[0];
                const paras = (list ? (list as any).getElementsByTagName('PARASHAPE') : []) as any[];
                for (let i = 0; i < paras.length; i++) {
                    if (paras[i].getAttribute('Id') === pid) return paras[i];
                }
                return null;
            };

            const qParaSource = getParaXML(targetParaId);
            const nParaSource = getParaXML(normalParaId) || qParaSource;

            if (qParaSource && nParaSource) {
                const psList = templateDoc.getElementsByTagName('PARASHAPELIST')[0];
                const styleList = templateDoc.getElementsByTagName('STYLELIST')[0];

                const existingPS = (psList ? Array.from(psList.getElementsByTagName('PARASHAPE')) : []) as any[];
                const existingStyles = (styleList ? Array.from(styleList.getElementsByTagName('STYLE')) : []) as any[];

                // [V53/V54] Allocate SEQUENTIAL IDs from the highest existing ones
                const maxPsId = Math.max(...existingPS.map(p => parseInt(p.getAttribute('Id') || '0', 10)));
                const gluePsId = (maxPsId + 1).toString();
                const gutterPsId = (maxPsId + 2).toString();
                const glueChoicePsId = (maxPsId + 3).toString();

                const maxStyleId = Math.max(...existingStyles.map(s => parseInt(s.getAttribute('Id') || '0', 10)));
                const glueStyleId = (maxStyleId + 1).toString();
                const glueStyleName = 'Glued_Question_Style';

                console.log(`[HML-V2] V54 Sequential IDs: PS_Glue=${gluePsId}, PS_Gutter=${gutterPsId}, PS_ChoiceGlue=${glueChoicePsId}, STYLE_Glue=${glueStyleId}`);

                // --- 1. Glue ParaShape (Question) ---
                const psGlue = qParaSource.cloneNode(true) as Element;
                psGlue.setAttribute('Id', gluePsId);
                psGlue.setAttribute('KeepWithNext', 'true');
                psList.appendChild(psGlue);
                validStyles.ParaShape.add(gluePsId);

                // --- 2. Gutter ParaShape (250pt FIXED) ---
                const psGutter = nParaSource.cloneNode(true) as Element;
                psGutter.setAttribute('Id', gutterPsId);
                psGutter.setAttribute('KeepTogether', 'true');
                psGutter.setAttribute('HeadingType', 'None');
                psGutter.setAttribute('Heading', '0');

                let margin = psGutter.getElementsByTagName('PARAMARGIN')[0];
                if (!margin) {
                    margin = templateDoc.createElement('PARAMARGIN');
                    psGutter.insertBefore(margin, psGutter.firstChild);
                }
                margin.setAttribute('LineSpacingType', 'Fixed');
                margin.setAttribute('LineSpacing', '40000'); // [V61] 400pt (Increased from 250pt)

                psList.appendChild(psGutter);
                validStyles.ParaShape.add(gutterPsId);

                // --- 3. Glue ParaShape (Choice) [V54] ---
                const choiceStyleId = validStyles.StyleNames.get('3선지') || "4";
                const choicePsId = validStyles.StyleParaShapes.get(choiceStyleId) || "4";
                const choiceParaSource = getParaXML(choicePsId) || nParaSource;
                if (choiceParaSource) {
                    const psChoiceGlue = choiceParaSource.cloneNode(true) as Element;
                    psChoiceGlue.setAttribute('Id', glueChoicePsId);
                    psChoiceGlue.setAttribute('KeepWithNext', 'true');
                    psList.appendChild(psChoiceGlue);
                    validStyles.ParaShape.add(glueChoicePsId);
                }

                // Update Counts
                psList.setAttribute('Count', (existingPS.length + 3).toString());

                // --- 4. Glue Style (Question) [V58: Font Change] ---
                const styleGlue = questionStyle.el.cloneNode(true) as Element;
                styleGlue.setAttribute('Id', glueStyleId);
                styleGlue.setAttribute('ParaShape', gluePsId);
                styleGlue.setAttribute('Name', glueStyleName);

                // [V58] Dynamic Font Search for '함초롬바탕'
                let targetCsId = "";

                // 1. Search for a style that might already be '함초롬바탕'
                const 함초롬StyleId = validStyles.NormalizedStyleNames.get('함초롬바탕');
                if (함초롬StyleId) {
                    targetCsId = validStyles.StyleCharShapes.get(함초롬StyleId) || "";
                }

                // 2. If not found via style name, search for the FONT name directly in MAPPINGTABLE
                if (!targetCsId) {
                    try {
                        let 바탕FontId = "";
                        const fontFaces = mappingTable.getElementsByTagName('FONTFACE');
                        for (let i = 0; i < fontFaces.length; i++) {
                            if (fontFaces[i].getAttribute('Lang') === 'Hangul') {
                                const fonts = fontFaces[i].getElementsByTagName('FONT');
                                for (let j = 0; j < fonts.length; j++) {
                                    const fontName = fonts[j].getAttribute('Name') || "";
                                    if (fontName.includes('함초롬바탕')) {
                                        바탕FontId = fonts[j].getAttribute('Id') || "";
                                        break;
                                    }
                                }
                            }
                            if (바탕FontId) break;
                        }

                        if (바탕FontId) {
                            const charShapes = mappingTable.getElementsByTagName('CHARSHAPE');
                            for (let i = 0; i < charShapes.length; i++) {
                                const fontIdEl = charShapes[i].getElementsByTagName('FONTID')[0];
                                if (fontIdEl && fontIdEl.getAttribute('Hangul') === 바탕FontId) {
                                    targetCsId = charShapes[i].getAttribute('Id') || "";
                                    break;
                                }
                            }
                        }
                    } catch (fontErr) {
                        console.error(`[HML-V2] V58 Font Search Error:`, fontErr);
                    }
                }

                // 3. Fallback to any 바탕 style if 함초롬바탕 search yielded nothing
                if (!targetCsId) {
                    const fallbackStyleId = validStyles.NormalizedStyleNames.get('바탕글') || validStyles.NormalizedStyleNames.get('바탕');
                    if (fallbackStyleId) {
                        targetCsId = validStyles.StyleCharShapes.get(fallbackStyleId) || "";
                    }
                }

                if (targetCsId) {
                    console.log(`[HML-V2] V58 Font Audit: Applying CharShape=${targetCsId} (found via 함초롬바탕 search) to ${glueStyleName}`);
                    styleGlue.setAttribute('CharShape', targetCsId);
                    targetCharId = targetCsId; // [V58.1] Sync global targetCharId so earlier loops use it!
                }

                styleList.appendChild(styleGlue);
                styleList.setAttribute('Count', (existingStyles.length + 1).toString());

                validStyles.Style.add(glueStyleId);
                validStyles.StyleNames.set(glueStyleName, glueStyleId);
                validStyles.StyleParaShapes.set(glueStyleId, gluePsId);
                if (targetCsId) validStyles.StyleCharShapes.set(glueStyleId, targetCsId);

                // Export IDs for paragraph loops
                (validStyles as any).glueStyleId = glueStyleId;
                (validStyles as any).gluePsId = gluePsId;
                (validStyles as any).glueCharShape = targetCsId; // [V58.1] Store for text sanitization
                (validStyles as any).gutterPsId = gutterPsId;
                (validStyles as any).glueChoicePsId = glueChoicePsId;
                (validStyles as any).glueStyleName = glueStyleName;
            }
        }
    } catch (e) {
        console.error(`[HML-V2] V53 DOM injection error:`, e);
    }

    // [V52] Re-serialize templateContent AFTER injections
    templateContent = serializer.serializeToString(templateDoc);



    // 0. Extract Box Patterns from Template
    // templateDoc is already parsed at the top
    const boxPatterns: Record<string, string> = {};
    const tables = Array.from(templateDoc.getElementsByTagName('TABLE'));
    const patternsToRemove: string[] = []; // Store InstIds of tables to remove

    for (const table of tables) {
        const ps = Array.from(table.getElementsByTagName('P'));
        let role = '';

        for (const p of ps) {
            const pText = (p.textContent || '').replace(/\s+/g, '').toLowerCase(); // Normalize whitespace and case
            if (pText.includes('보기박스')) { role = 'BOX_BOGI'; break; }
            if (pText.includes('조건박스')) { role = 'BOX_JOKUN'; break; }
            if (pText.includes('미주박스') || pText.includes('해설박스') || pText.includes('정답박스') || pText.includes('해설') || pText.includes('정답')) {
                role = 'BOX_MIJU'; break;
            }
            if (pText.includes('박스안')) { role = 'BOX_INNER'; break; }
        }

        if (role) {
            console.log(`[HML-V2 DEBUG] Extracted BOX pattern for role: ${role}`);
            // Store the pattern
            boxPatterns[role] = serializer.serializeToString(table);

            // Find InstId for Surgical Removal
            // We search for SHAPEOBJECT specifically to get the InstId
            const so = table.getElementsByTagName('SHAPEOBJECT')[0];
            const instId = so ? so.getAttribute('InstId') : table.getAttribute('InstId');

            if (instId) {
                patternsToRemove.push(instId);
            } else {
                // Fallback: search for any InstId in the table's XML if not found via DOM
                const tableXml = serializer.serializeToString(table);
                const instMatch = tableXml.match(/InstId="(\d+)"/);
                if (instMatch) {
                    patternsToRemove.push(instMatch[1]);
                }
            }
        }
    }

    // 1. Surgical Removal of Box Patterns from String (Before content injection)
    let cleanedTemplate = templateContent;
    for (const instId of patternsToRemove) {
        cleanedTemplate = removeTableByInstId(cleanedTemplate, instId);
    }


    // 3. Build Full Content XML (Using DOM construction for each question)
    let combinedContentXmlFull = '';
    const allImages: { originalId: string; newId: number; image: DbQuestionImage }[] = [];
    const imageHashMap = new Map<string, string>(); // Hash -> NewID (String) - To detect dupes
    let nextImageId = 5000; // Start high to avoid collision
    let nextInstId = 3000000;

    const getStyleId = (targetName: string) => {
        const normTarget = normalize(targetName);
        if (validStyles.StyleNames.has(targetName)) return validStyles.StyleNames.get(targetName)!;
        const normMatch = validStyles.NormalizedStyleNames.get(normTarget);
        if (normMatch) return normMatch;

        // NUCLEAR FALLBACK: If "문제1" is absolutely missing, search for similar roles
        if (normTarget === '문제1') {
            let fallbackId = '';
            validStyles.StyleNames.forEach((id, name) => {
                if (fallbackId) return;
                const n = normalize(name);
                if (n.includes('해설') || n.includes('정답') || n.includes('미주') || n.includes('본문1')) {
                    console.log(`[HML-V2 NUCLEAR-STYLE] "문제1" missing. Using "${name}" (ID: ${id}) instead.`);
                    fallbackId = id;
                }
            });
            if (fallbackId) return fallbackId;
            // Absolute last resort: Style ID "2" or "1" if they exist
            if (validStyles.Style.has('2')) return '2';
            if (validStyles.Style.has('1')) return '1';
        }
        return '';
    };


    const existingBins = templateDoc.getElementsByTagName('BINDATA');
    for (let i = 0; i < existingBins.length; i++) {
        const id = parseInt(existingBins[i].getAttribute('Id') || '0', 10);
        if (id >= nextImageId) nextImageId = id + 1;
    }

    let qIndex = 0;
    let currentColumnHeight = 5; // [V60] Title takes ~5 lines (Reduced from 15)
    const allEndnotes: Element[] = []; // [NEW] Collect all endnotes for final restoration

    for (const qwi of questionsWithImages) {
        qIndex++;
        // Remove Column Breaks (Ctrl+Shift+Enter) as requested
        // Handles both Standalone Tags (<COLBREAK>, <hp:COLBREAK>) and Paragraph Attributes (ColumnBreak="true")
        // Added robust spacing handle for attributes
        let cleanContent = qwi.question.content_xml
            .replace(/<(?:hp:)?COLBREAK[^>]*?>/gi, '')
            .replace(/ColumnBreak\s*=\s*"true"/gi, '')
            .replace(/ColumnBreak\s*=\s*"1"/gi, '')
            .replace(/PageBreak\s*=\s*"true"/gi, '');
        // Add ENDNOTE detection logging
        // [FIX V20] Regex-based search for ANY version of endnote tag
        if (/<[^>]*?ENDNOTE/i.test(cleanContent)) {
            console.log(`[HML-V2 DEBUG] Question ${qwi.question.id} contains suspected ENDNOTE tag via Regex.`);
        } else {
            console.warn(`[HML-V2 DEBUG] Question ${qwi.question.id} has NO ENDNOTE tags via Regex! Content length: ${cleanContent.length}`);
        }

        const qDoc = parser.parseFromString(`<WRAP>${cleanContent}</WRAP>`, 'text/xml');
        const root = qDoc.documentElement;

        // [FIX V15] IMMEDIATE ENDNOTE ACCUMULATION (Before any mutations)
        // [FIX V19] Robust tag search to handle potential namespaces like hp:ENDNOTE
        const findEndnotes = (parent: Element): Element[] => {
            const results: Element[] = [];
            const tags = ['ENDNOTE', 'hp:ENDNOTE', 'hp:endnote', 'endnote'];
            for (const tag of tags) {
                const found = Array.from(parent.getElementsByTagName(tag));
                results.push(...found);
            }
            // Filter unique by reference just in case
            return Array.from(new Set(results));
        };

        const endnotesInQ = findEndnotes(root);
        console.log(`[HML-V2 DEBUG] Question ${qwi.question.id} findEndnotes() count: ${endnotesInQ.length}`);
        if (endnotesInQ.length > 0) {
            console.log(`[HML-V2 DEBUG] Question ${qwi.question.id}: Found ${endnotesInQ.length} endnotes. Accumulating clones.`);
            for (const en of endnotesInQ) {
                allEndnotes.push(en.cloneNode(true) as Element);
            }
        }

        // [V30] PRESERVE PARSER HINTS
        // [V30] ROBUST PARAGRAPH DETECTION
        const allPs = root.getElementsByTagName('P');
        // [V31] Top-level Paras Only (Exclude nested ones in tables)
        const topPs = Array.from(allPs).filter(p => p.parentNode === root);
        // A paragraph is 'visual' if it has text OR images/tables/equations.
        const isVisualPara = (p: Element) => {
            if (p.textContent && p.textContent.trim().length > 0) return true;
            // Check for children that aren't TEXT (e.g. IMAGE, PICTURE, EQUATION, TABLE)
            const children = Array.from(p.childNodes);
            for (const child of children) {
                const nodeName = child.nodeName.toUpperCase();
                if (['IMAGE', 'PICTURE', 'EQUATION', 'TABLE', 'DRAWINGOBJECT', 'SHAPEOBJECT'].includes(nodeName)) return true;
                // Also check inside children if they are wrappers
                if (child.nodeType === 1) { // Element
                    const el = child as Element;
                    if (el.getElementsByTagName('EQUATION').length > 0) return true;
                    if (el.getElementsByTagName('PICTURE').length > 0) return true;
                    if (el.getElementsByTagName('TABLE').length > 0) return true;
                }
            }
            return false;
        };

        const questionPs = topPs.filter((p: any) => p.getAttribute('data-hml-style') === 'QUESTION');
        let firstVisualP: Element | null = null;

        if (questionPs.length > 0) {
            firstVisualP = questionPs[0];
        } else {
            for (let i = 0; i < topPs.length; i++) {
                const p = topPs[i] as Element;
                if (isVisualPara(p)) {
                    firstVisualP = p;
                    break;
                }
            }
            if (!firstVisualP && topPs.length > 0) firstVisualP = topPs[0] as Element;
        }

        if (firstVisualP) {
            const styleId = styleIdToApply;
            const paraShapeId = "9997"; // Always use 9997 for Body (Glue + Indent)
            const charShapeId = targetCharId || '0';

            console.log(`[HML-V2 styling] Q${qIndex} Applying Style=${styleId}, PS=${paraShapeId}, CS=${charShapeId}`);

            // Apply to ALL top-level paragraphs to ensure they stick together (KeepWithNext)
            const topPsInQ = Array.from(root.getElementsByTagName('P')).filter(p => p.parentNode === root);
            topPsInQ.forEach((p: Element) => {
                const semanticRole = p.getAttribute('data-hml-style');
                const isMainQuestion = semanticRole === 'QUESTION' || p === firstVisualP;
                const isChoice = semanticRole === 'CHOICE';

                const glueStyleId = (validStyles as any).glueStyleId || "9999";
                const gluePsId = (validStyles as any).gluePsId || "9997";
                const glueChoicePsId = (validStyles as any).glueChoicePsId;
                const choiceStyleId = validStyles.StyleNames.get('3선지') || "4";

                if (isMainQuestion) {
                    p.setAttribute('Style', glueStyleId);
                    p.setAttribute('ParaShape', gluePsId);
                } else if (isChoice) {
                    // [V54] Choices use '오선지' style (no Ctrl+2) but still glued ParaShape
                    p.setAttribute('Style', choiceStyleId);
                    if (glueChoicePsId) {
                        p.setAttribute('ParaShape', glueChoicePsId);
                    }
                } else {
                    // For other roles (BOX_, ANSWER), keep original but try to glue them to the next question part
                    // Actually, if it's not the last paragraph, we should ideally glue it.
                    // For simplicity, let's just make everything top-level PS glued if it's not the last one?
                    // No, let's stick to the core fix for now.
                    if (!p.hasAttribute('ParaShape')) p.setAttribute('ParaShape', gluePsId);
                }

                // 3. Set CharShape (Font) - Force fallback for non-main-style if needed
                const textNodes = Array.from(p.getElementsByTagName('TEXT'));
                for (const tn of textNodes) {
                    if (isMainQuestion) {
                        tn.setAttribute('CharShape', charShapeId);
                    } else {
                        if (!tn.hasAttribute('CharShape')) tn.setAttribute('CharShape', '0');
                    }
                }

                p.removeAttribute('data-hml-style');
            });

            // [FIX V6] Cleanup V5/V4 attempts
            // removed NewList="false" (ineffective)

            // Strategy: Find first text node in this visual paragraph
            const textNodesInP = Array.from(firstVisualP.getElementsByTagName('TEXT'));
            let targetTextNode: any = null;
            for (let k = 0; k < textNodesInP.length; k++) {
                if (textNodesInP[k].textContent && textNodesInP[k].textContent.trim().length > 0) {
                    targetTextNode = textNodesInP[k];
                    break;
                }
            }

            // If the paragraph has text content but no TEXT nodes (rare), create one
            if (!targetTextNode) {
                targetTextNode = qDoc.createElement('TEXT');
                // No longer setting CharShape here, it's done in the loop above
                firstVisualP.appendChild(targetTextNode);
            }

            // [V29] REMOVED FORCED NUMBERING & STRIPPING
            // User requested removal of "forcedly put numbers".
            // We now rely on the original content_xml tags and text.


            console.log(`[HML-V2 Generator] V29: Forced Numbering Injected REMOVED for Q${qIndex}`);

            // [V47] Redundant Number Stripping
            // Targeted removal of hardcoded numbering prefixes (e.g. 1), 1., (1))
            // This prevents "1 1) ..." when auto-numbering style is active.
            try {
                const queryTextNodes = firstVisualP.getElementsByTagName('TEXT');
                if (queryTextNodes.length > 0) {
                    const firstT = queryTextNodes[0];
                    if (firstT.firstChild && firstT.firstChild.nodeType === 3) { // 3 = TEXT_NODE
                        const originalText = firstT.firstChild.nodeValue || '';
                        const cleanedText = originalText.replace(/^\s*\d+[\s.)]*\s*/, '');
                        if (cleanedText !== originalText) {
                            console.log(`[HML-V2] V47 Number Strip: "${originalText.substring(0, 10)}..." -> "${cleanedText.substring(0, 10)}..."`);
                            firstT.firstChild.nodeValue = cleanedText;
                        }
                    }
                }
            } catch (e) {
                console.warn(`[HML-V2] V47 Number Strip Failed for Q${qIndex}`, e);
            }

        } else {
            console.warn(`[HML-V2 Generator] No visual paragraph found for Q${qIndex}. Cannot apply manual numbering.`);
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
            // ... Code removed for conciseness as it was conditioned 'false' ...
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

                    // 1. Update ID to the 1-based INDEX
                    el.setAttribute('BinItem', String(newIndex));
                    if (targetAttr !== 'BinItem') {
                        el.removeAttribute(targetAttr);
                    }

                    // 2. Fix Format Attributes (Vital for SVG->PNG Swap)
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

            // [V47] ColumnBreak/PageBreak REMOVAL
            // User requested to remove forced breaks ONLY during exam generation.
            const stripBreaks = (node: Element) => {
                // xmldom doesn't support querySelectorAll. Use getElementsByTagName("*")
                const allElements = Array.from(node.getElementsByTagName('*'));
                let count = 0;
                allElements.forEach(elNode => {
                    const el = elNode as Element;
                    if (el.getAttribute('ColumnBreak') === 'true' || el.getAttribute('ColumnBreak') === '1') {
                        el.removeAttribute('ColumnBreak');
                        count++;
                    }
                    if (el.getAttribute('PageBreak') === 'true') {
                        el.removeAttribute('PageBreak');
                        count++;
                    }
                });
                // Also check the element itself
                if (node.getAttribute('ColumnBreak') === 'true' || node.getAttribute('ColumnBreak') === '1') {
                    node.removeAttribute('ColumnBreak');
                    count++;
                }
                if (node.getAttribute('PageBreak') === 'true') {
                    node.removeAttribute('PageBreak');
                    count++;
                }
                if (count > 0) console.log(`[HML-V2] V47: Stripped ${count} forced breaks from Q${qIndex}`);
            };
            stripBreaks(root);

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
                            // console.log(`[HML-V2 Surgical Generator] Flushing box group for role: ${currentRole} (Size: ${currentGroup.length})`);
                            finalNodes.push(wrapInBoxPattern(currentGroup, currentRole, boxPatterns, serializer, parser, nextInstId++, validStyles));
                        } else {
                            // This case shouldn't really happen with current logic as non-boxes aren't in groups
                            currentGroup.forEach(node => {
                                sanitizeNodeStyles(node, validStyles, serializer, (validStyles as any).glueCharShape);
                                finalNodes.push(serializer.serializeToString(node));
                            });
                        }
                        currentGroup = [el];
                        currentRole = role;
                    }
                } else {
                    // Not a box role (P, ENDNOTE, TABLE, etc.)
                    // 1. Flush any active BOX group
                    if (currentRole.startsWith('BOX_')) {
                        finalNodes.push(wrapInBoxPattern(currentGroup, currentRole, boxPatterns, serializer, parser, nextInstId++, validStyles));
                        currentGroup = [];
                        currentRole = '';
                    }

                    // 2. Process and Serialize the node
                    sanitizeNodeStyles(el, validStyles, serializer, (validStyles as any).glueCharShape);
                    finalNodes.push(serializer.serializeToString(el));
                }
            }
            // Last flush
            if (currentRole.startsWith('BOX_')) {
                finalNodes.push(wrapInBoxPattern(currentGroup, currentRole, boxPatterns, serializer, parser, nextInstId++, validStyles));
            }
            questionXml = finalNodes.join('\n');

            // [V47] Advanced Layout: Gutter Protection (150pt + KeepTogether)
            // We apply ParaShape 9998 (KeepTogether, 150pt margin) to the VERY LAST paragraph of the question block.
            // However, to be absolutely sure the gap appears, we add an explicit padding paragraph at the end.
            console.log(`[HML-V2 DEBUG] questionXml length: ${questionXml.length}`);

            combinedContentXmlFull += questionXml;

            // [V53] Gutter Padding (250pt Fixed)
            // Use sequential gutterPsId and Style 0
            const gutterPsId = (validStyles as any).gutterPsId || "9998";
            combinedContentXmlFull += `\n<P Style="0" ParaShape="${gutterPsId}"><TEXT CharShape="0">&#160;</TEXT></P>\n`;

            // [V47] SMART LAYOUT STRATEGY (Restored & Refined)
            // Heuristic: Estimate height in "lines". 1 P = 1 line, 1 Image = 15 lines.
            // [V61] 400pt gutter is ~16 lines in our heuristic (Increased from 250pt/10 lines)
            const countImages = (questionXml.match(/<PICTURE|<IMAGE/g) || []).length;
            const countParas = (questionXml.match(/<P /g) || []).length;
            const MAX_COL_HEIGHT = 65; // [V63] Adjusted to 65 (User request)
            const questionHeight = (countParas * 1) + (countImages * 10);
            const gutterHeight = 16;
            const totalRequiredSpace = questionHeight + gutterHeight;

            console.log(`[HML-V2 LAYOUT] Q${qIndex}: Paras=${countParas}, Images=${countImages} -> Height=${questionHeight}, Total=${totalRequiredSpace} (Col: ${currentColumnHeight}/${MAX_COL_HEIGHT})`);

            // Logic: Break column if we overflow (including the 10-line gutter)
            if (currentColumnHeight + totalRequiredSpace > MAX_COL_HEIGHT) {
                console.log(`[HML-V2] Smart Layout: Question ${qIndex} (Height ${totalRequiredSpace}) overflows column (${currentColumnHeight}/45). Injecting ColBreak.`);
                combinedContentXmlFull += `<P ColumnBreak="true" ParaShape="0" Style="0"><TEXT CharShape="0"></TEXT></P>`;
                currentColumnHeight = 0;
            }

            currentColumnHeight += totalRequiredSpace;

        }
    }

    // [FIX V12] ENDNOTE RESTORATION (Miju Box)
    // If we accumulated endnotes and have a BOX_MIJU template pattern, inject it now.
    console.log(`[HML-V2 DEBUG] Final Check: ${allEndnotes.length} endnotes accumulated. BOX_MIJU pattern exists: ${!!boxPatterns['BOX_MIJU']}`);
    if (allEndnotes.length > 0) {
        if (boxPatterns['BOX_MIJU']) {
            console.log(`[HML-V2 Generator] V19: Restoring ${allEndnotes.length} endnotes into BOX_MIJU pattern.`);

            const styleId = getStyleId('문제1') || getStyleId('Question 1') || '0';
            const paraShapeId = validStyles.StyleParaShapes.get(styleId) || '0';
            console.log(`[HML-V2 restored] Using StyleID: ${styleId}, ParaShapeID: ${paraShapeId} for endnotes.`);
            const workingDoc = parser.parseFromString('<root/>', 'text/xml');

            const finalizedEndnotePs: Element[] = [];

            console.log(`[HML-V2 RESTORE] Starting endnote restoration for ${allEndnotes.length} notes.`);

            for (let enIdx = 0; enIdx < allEndnotes.length; enIdx++) {
                const en = allEndnotes[enIdx];
                const numberStr = `${enIdx + 1}. `;
                const paras = Array.from(en.getElementsByTagName('P'));

                for (let pIdx = 0; pIdx < paras.length; pIdx++) {
                    const p = paras[pIdx].cloneNode(true) as Element;
                    p.setAttribute('Style', styleId);
                    p.setAttribute('ParaShape', paraShapeId);

                    if (pIdx === 0) {
                        let tNode = p.getElementsByTagName('TEXT')[0];
                        if (!tNode) {
                            tNode = workingDoc.createElement('TEXT');
                            if (validStyles.CharShape.has('11')) tNode.setAttribute('CharShape', '11');
                            p.appendChild(tNode);
                        }
                        // Insert number at the very beginning of the TEXT node
                        const newNumNode = workingDoc.createTextNode(numberStr);
                        if (tNode.firstChild) {
                            tNode.insertBefore(newNumNode, tNode.firstChild);
                        } else {
                            tNode.appendChild(newNumNode);
                        }
                    }
                    finalizedEndnotePs.push(p);
                }
            }

            if (finalizedEndnotePs.length > 0) {
                const mijuBoxXml = wrapInBoxPattern(
                    finalizedEndnotePs,
                    'BOX_MIJU',
                    boxPatterns,
                    serializer,
                    parser,
                    nextInstId++,
                    validStyles
                );
                combinedContentXmlFull += mijuBoxXml;
            }
        } else {
            console.log(`[HML-V2 Generator] V19: BOX_MIJU pattern NOT found/empty. Appending raw endnotes as fallback. `);
            const styleId = getStyleId('문제1') || getStyleId('Question 1') || '0';
            const paraShapeId = validStyles.StyleParaShapes.get(styleId) || '0';
            console.log(`[HML-V2 restored-fallback] Using StyleID: ${styleId}, ParaShapeID: ${paraShapeId} for endnote fallback.`);
            const workingDoc = parser.parseFromString('<root/>', 'text/xml');

            allEndnotes.forEach((en, idx) => {
                const numberStr = `${idx + 1}. `;
                const innerPs = Array.from(en.getElementsByTagName('P'));

                if (innerPs.length > 0) {
                    innerPs.forEach((p, pIdx) => {
                        const clonedP = p.cloneNode(true) as Element;
                        clonedP.setAttribute('Style', styleId);
                        clonedP.setAttribute('ParaShape', paraShapeId);
                        if (pIdx === 0) {
                            let tNode = clonedP.getElementsByTagName('TEXT')[0];
                            if (!tNode) {
                                tNode = workingDoc.createElement('TEXT');
                                if (validStyles.CharShape.has('11')) tNode.setAttribute('CharShape', '11');
                                clonedP.appendChild(tNode);
                            }
                            const newNumNode = workingDoc.createTextNode(numberStr);
                            if (tNode.firstChild) {
                                tNode.insertBefore(newNumNode, tNode.firstChild);
                            } else {
                                tNode.appendChild(newNumNode);
                            }
                        }
                        const pXml = serializer.serializeToString(clonedP);
                        combinedContentXmlFull += pXml;
                    });
                } else {
                    // Raw text or empty? Preserve anyway.
                    const text = en.textContent || '';
                    const fallbackP = `<P ParaShape="${paraShapeId}" Style="${styleId}"><TEXT CharShape="11">${numberStr}${text}</TEXT></P>`;
                    combinedContentXmlFull += fallbackP;
                }
            });
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

    // [FIX V15] Inject ENDNOTEPR into Header if missing
    // Hancom requires this tag to render endnote content.
    if (allEndnotes.length > 0 && !cleanedTemplate.includes('<ENDNOTEPR')) {
        const endnotePr = `<ENDNOTEPR AutoNum="true" StartNum="1" Numbering="Arabic" />`;
        if (cleanedTemplate.includes('</DOCSETTING>')) {
            cleanedTemplate = cleanedTemplate.replace('</DOCSETTING>', `${endnotePr}</DOCSETTING>`);
        } else if (cleanedTemplate.includes('<HEAD>')) {
            cleanedTemplate = cleanedTemplate.replace('<HEAD>', `<HEAD><DOCSETTING>${endnotePr}</DOCSETTING>`);
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

    console.log(`[HML-V2 FINAL-OPTIMIZED] Filtered Images: ${allImages.length} -> ${usedImages.length}`);

    // SAFETY NET: If we filtered out ALL images but we started with some, something is critical.
    if (usedImages.length === 0 && allImages.length > 0) {
        console.warn('[HML-V2 ZOMBIE FILTER] WARNING: All images were filtered out! Reverting to SAFE MODE.');
        usedImages = allImages;
    }

    if (!combinedContentXmlFull.trim()) {
        combinedContentXmlFull = '<P><TEXT>No Content</TEXT></P>';
    }

    // [FIX V53] Robust Anchor Replacement (Greedy Regex to prevent nesting)
    // Matches the entire wrapping paragraph containing {{CONTENT_HERE}}
    const anchorRegex = /<P[^>]*>\s*<TEXT[^>]*>\s*(?:<CHAR>\s*)?{{CONTENT_HERE}}(?:\s*<\/CHAR>)?\s*<\/TEXT>\s*<\/P>/i;

    let replaced = false;
    currentHml = currentHml.replace(anchorRegex, (match) => {
        if (!replaced) {
            replaced = true;
            console.log(`[HML-V2] V53: Replaced wrapping anchor paragraph with question content.`);
            return combinedContentXmlFull;
        }
        return match;
    });

    if (!replaced && currentHml.includes('{{CONTENT_HERE}}')) {
        const splitParts = currentHml.split('{{CONTENT_HERE}}');
        currentHml = splitParts[0] + combinedContentXmlFull + splitParts.slice(1).join('{{CONTENT_HERE}}');
        console.log(`[HML-V2] V34: Replaced anchor using literal search.`);
        replaced = true;
    }

    if (!replaced) {
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

    if (usedImages.length >= 0) { // Always update even if 0 images (to clear template)

        // 1. [FIX V35] Place BINDATALIST AFTER MAPPINGTABLE (as a sibling)
        const newBinDataListTag = `<BINDATALIST Count="${usedImages.length}">${binDataList}</BINDATALIST>`;

        if (currentHml.includes('<BINDATALIST')) {
            // Replace existing BINDATALIST
            currentHml = currentHml.replace(/<BINDATALIST[^>]*>[\s\S]*?<\/BINDATALIST>/, newBinDataListTag);
        } else if (currentHml.includes('</MAPPINGTABLE>')) {
            // [FIX V39] Inject INSIDE MAPPINGTABLE (Must be a child of MAPPINGTABLE)
            currentHml = currentHml.replace('</MAPPINGTABLE>', `${newBinDataListTag}</MAPPINGTABLE>`);
        } else {
            // Create MAPPINGTABLE if missing (unlikely for a valid template)
            const headTagMatch = currentHml.match(/<HEAD[^>]*?>/);
            if (headTagMatch) {
                const headTag = headTagMatch[0];
                currentHml = currentHml.replace(headTag, `${headTag}<MAPPINGTABLE>${newBinDataListTag}</MAPPINGTABLE>`);
            }
        }

        // 2. Purge & Update BINDATASTORAGE
        const newStorageTag = `<BINDATASTORAGE Count="${usedImages.length}">${binDataStorage}</BINDATASTORAGE>`;

        if (currentHml.includes('<BINDATASTORAGE')) {
            currentHml = currentHml.replace(/<BINDATASTORAGE[^>]*>[\s\S]*?<\/BINDATASTORAGE>/, newStorageTag);
        } else {
            // Inject at end of BODY (TAIL) or before </DOC>
            const tailMatch = currentHml.match(/<TAIL[^>]*?>/);
            if (tailMatch) {
                currentHml = currentHml.replace(/<\/TAIL>/, `${newStorageTag}</TAIL>`);
            } else {
                // Create TAIL before /DOC
                const docEnd = currentHml.lastIndexOf('</HWPML>'); // or </DOC> depending on root
                if (docEnd !== -1) {
                    currentHml = currentHml.substring(0, docEnd) + `<TAIL>${newStorageTag}</TAIL>` + currentHml.substring(docEnd);
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
    } // This is the closing brace for `if (usedImages.length >= 0)`

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
}, serializer: any, forcedCs?: string) {
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
            // 1. Priority: Semantic Role Default Mapping (V53: Route to Sequential Glue Style)
            const glueStyleName = (validSets as any).glueStyleName || 'Glued_Question_9999';
            if (semanticRole === 'QUESTION') {
                targetStyleName = glueStyleName;
                // [V58.1] If Question, propagate the intended CharShape to children
                forcedCs = (validSets as any).glueCharShape;
            }
            else if (semanticRole === 'CHOICE') targetStyleName = '3선지';
            else if (semanticRole.startsWith('BOX_')) targetStyleName = '3선지';

            // Fallback for original question style if Glued Style injection failed
            if (semanticRole === 'QUESTION' && !validSets.StyleNames.has(targetStyleName)) {
                targetStyleName = '문제1';
            }

            // 2. Original Style Preservation (Don't override for QUESTIONS)
            const originalStyleName = node.getAttribute('data-hml-orig-style');
            if (originalStyleName && validSets.StyleNames.has(originalStyleName) && semanticRole !== 'QUESTION') {
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
                    // console.log(`[HML-V2 Generator] sanitizeNodeStyles: Applied Style '${targetStyleName}' (Id=${targetId}, Para=${targetPara}) to P`);
                } else {
                    console.warn(`[HML-V2 Generator] Style Name '${targetStyleName}' not found via validSets.StyleNames!`);
                }
            }
        }
    }

    // [V58.1] Apply forced CharShape (Font)
    if (forcedCs && (node.tagName === 'TEXT' || node.tagName === 'CHARSHAPE')) {
        node.setAttribute('CharShape', forcedCs);
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
        sanitizeNodeStyles(node.childNodes[i], validSets, serializer, forcedCs);
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

                    // 1. Extract content to manifest
                    let contentToAppend: any[] = [];
                    for (let k = 0; k < elements.length; k++) {
                        const el = elements[k];
                        const tagName = (el.tagName || '').toUpperCase();
                        if (tagName === 'TABLE') {
                            const rowCount = el.getElementsByTagName('ROW').length;
                            const cellCount = el.getElementsByTagName('CELL').length;
                            if (rowCount > 1 || cellCount > 1) {
                                contentToAppend.push(el);
                            } else {
                                // Extract P nodes from single-cell table
                                Array.from(el.getElementsByTagName('P')).forEach(p => contentToAppend.push(p));
                            }
                        } else {
                            contentToAppend.push(el);
                        }
                    }

                    // 2. Title Deduplication on the flattened content
                    let startIndex = 0;
                    if (role === 'BOX_BOGI' && contentToAppend.length > 0) {
                        const firstText = (contentToAppend[0].textContent || '').trim();
                        if (firstText.includes('보  기') || firstText.includes('보 기') || firstText.includes('보기')) {
                            // Check if template already has title
                            const originalCells = Array.from(table.getElementsByTagName('CELL'));
                            if (originalCells.some((c: any) => (c.textContent || '').includes('보  기'))) {
                                console.log(`[HML-V2] Skipping redundant title: "${firstText}"`);
                                startIndex = 1;
                            }
                        }
                    }

                    // 3. Append and Sanitize
                    for (let k = startIndex; k < contentToAppend.length; k++) {
                        const nodeToAppend = contentToAppend[k];

                        // If it's a paragraph from a box, and it doesn't have its own role, give it the box role
                        if (nodeToAppend.tagName === 'P' && !nodeToAppend.hasAttribute('data-hml-style')) {
                            nodeToAppend.setAttribute('data-hml-style', role);
                        }

                        sanitizeNodeStyles(nodeToAppend, validSets, serializer);

                        nodeToAppend.removeAttribute('data-hml-style');
                        nodeToAppend.removeAttribute('data-hml-orig-style');
                        paralist.appendChild(nodeToAppend);
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
