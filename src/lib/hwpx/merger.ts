import JSZip from 'jszip';
import { DOMParser, XMLSerializer } from 'xmldom';
import * as fs from 'fs';
import { createAdminClient } from '@/utils/supabase/server-admin';

export type MergeSource = {
    id: string;
    file_id: string;
    path: string; // raw_uploads/{file_id}.hwpx
    fragment_xml?: string | null;
    content_xml?: string | null;
    original_name: string;
    question_number?: number;
};

export class HwpxMerger {
    static async merge(opts: {
        templatePath: string;
        outputFilename: string;
        sources: MergeSource[];
        bucket: string;
        isSingleTest?: boolean;
        isMergeMirror?: boolean;
    }): Promise<Buffer> {
        const { templatePath, sources, bucket, isSingleTest = false, isMergeMirror = false } = opts;
        console.log(`[MERGE_START] count=${sources.length} bucket=${bucket} single=${isSingleTest} mirror=${isMergeMirror}`);
        const targetQuestions = Array.isArray(sources) ? sources : [];
        targetQuestions.sort((a, b) => (a.question_number || 0) - (b.question_number || 0));

        const SINGLE_TEST = isSingleTest;
        const count = targetQuestions.length;
        const requestedMirror = isMergeMirror;
        const mirrorAllowed = (count === 1) && !SINGLE_TEST;
        let MERGE_MIRROR = mirrorAllowed && requestedMirror;

        if (count >= 2) MERGE_MIRROR = false;

        const supabase = createAdminClient();
        const parser = new DOMParser();
        const serializer = new XMLSerializer();

        // Global ParaID counter for unique ID generation across all merged content
        let paraIdCounter = Date.now() % 1000000;

        // Helper to find elements regardless of prefix (e.g. hp:p vs p)
        const findByLocalName = (root: any, localName: string): Element[] => {
            if (!root) return [];
            const lower = localName.toLowerCase();
            const results: Element[] = [];
            const search = (node: any) => {
                if (node.nodeType === 1) {
                    const ln = (node.localName || node.nodeName.split(':').pop() || "").toLowerCase();
                    if (ln === lower) results.push(node);
                }
                if (node.childNodes) {
                    for (let i = 0; i < node.childNodes.length; i++) {
                        search(node.childNodes[i]);
                    }
                }
            };
            search(root);
            return results;
        };

        const q0 = targetQuestions[0];
        const { data: data0, error: err0 } = await supabase.storage.from(bucket).download(q0.path);
        if (err0 || !data0) throw new Error(`VESSEL_LOAD_FAIL: ${q0.path}`);

        if (MERGE_MIRROR) {
            console.log("[MERGE] Mirror Mode Active. Returning original buffer.");
            return Buffer.from(await data0.arrayBuffer());
        }

        // --- LOAD TEMPLATE ---
        // CRITICAL FIX: Always use template.hwpx as base for stability
        // Using source files as template caused crashes due to structural inconsistencies
        let templateBuf = fs.readFileSync(templatePath);
        let targetZip: JSZip = await JSZip.loadAsync(templateBuf);

        const fSec = targetZip.file("Contents/section0.xml");
        if (!fSec) throw new Error("TEMPLATE_CORRUPT: Missing section0.xml");
        const tSectionRaw = await fSec.async("string");
        const tSectionDoc = parser.parseFromString(tSectionRaw, "text/xml");

        const fHead = targetZip.file("Contents/header.xml");
        if (!fHead) throw new Error("TEMPLATE_CORRUPT: Missing header.xml");
        const tHeaderRaw = await fHead.async("string");
        const tHeaderDoc = parser.parseFromString(tHeaderRaw, "text/xml");

        // --- HEADER PREP ---
        // Ensure refList exists
        let tRefList = findByLocalName(tHeaderDoc, "refList")[0];
        if (!tRefList) {
            const head = findByLocalName(tHeaderDoc, "head")[0] || tHeaderDoc.documentElement;
            tRefList = tHeaderDoc.createElement("hh:refList"); // Default prefix guess
            head.appendChild(tRefList);
        }

        const clearAndGetList = (name: string, nsPrefix: string = "hh") => {
            if (name === "refList") return tRefList;

            const isRefListMember = [
                "fontfaces", "borderfills", "charproperties", "paraproperties",
                "styles", "tabproperties", "numberings", "bullets",
                "memoproperties", "trackchanges", "users" // Fixed: These belong in RefList
            ].includes(name.toLowerCase());

            const head = findByLocalName(tHeaderDoc, "head")[0] || tHeaderDoc.documentElement;
            const targetParent = isRefListMember ? tRefList : head;

            // Ensure RefList is attached to Head if we are using it
            if (isRefListMember && !tRefList.parentNode) {
                head.appendChild(tRefList);
            }

            let list = findByLocalName(tHeaderDoc, name)[0];
            if (!list) {
                list = tHeaderDoc.createElement(`${nsPrefix}:${name}`);
                targetParent.appendChild(list);
            }
            return list;
        };

        // Ensure BeginNum exists (Critical for validity)
        let tBeginNum = findByLocalName(tHeaderDoc, "beginNum")[0];
        if (!tBeginNum) {
            const head = findByLocalName(tHeaderDoc, "head")[0] || tHeaderDoc.documentElement;
            tBeginNum = tHeaderDoc.createElement("hh:beginNum");
            tBeginNum.setAttribute("page", "1");
            tBeginNum.setAttribute("footnote", "1");
            tBeginNum.setAttribute("endnote", "1");
            tBeginNum.setAttribute("pic", "1");
            tBeginNum.setAttribute("tbl", "1");
            tBeginNum.setAttribute("equation", "1");
            head.appendChild(tBeginNum);
        }

        const tBinList = clearAndGetList("binaryItemList");
        const tEqList = clearAndGetList("equationItemList");
        const tFontFacesList = clearAndGetList("fontFaces", "hh");
        const tBorderFillList = clearAndGetList("borderFills", "hh");
        const tCharList = clearAndGetList("charProperties", "hh");
        const tParaList = clearAndGetList("paraProperties", "hh");
        const tStyleList = clearAndGetList("styles", "hh");
        const tTabList = clearAndGetList("tabProperties", "hh");
        const tNumberingList = clearAndGetList("numberings", "hh");
        const tBulletList = clearAndGetList("bullets", "hh");
        const tMemoList = clearAndGetList("memoProperties", "hh");
        const tTrackChangeList = clearAndGetList("trackChanges", "hh");
        const tTrackChangeAuthorList = clearAndGetList("users", "hh");

        // Rels
        const tRelsPath = "Contents/_rels/section0.xml.rels";
        const fRels = targetZip.file(tRelsPath);
        const tRelsRaw = fRels ? await fRels.async("string") : null;
        const tRelsDoc = tRelsRaw
            ? parser.parseFromString(tRelsRaw, "text/xml")
            : parser.parseFromString('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>', "text/xml");

        // Master ID Tracking
        const masterIds = {
            bin: new Set<string>(),
            eq: new Set<string>(),
            font: new Set<string>(),
            char: new Set<string>(),
            para: new Set<string>(),
            style: new Set<string>(),
            border: new Set<string>(),
            tab: new Set<string>(),
            num: new Set<string>(),
            bullet: new Set<string>(),
            memo: new Set<string>(),
            track: new Set<string>(),
            user: new Set<string>()
        };

        // Populate master sets with existing template IDs to avoid collision
        const populateMaster = (list: Element, set: Set<string>) => {
            if (!list) return;
            const children = Array.from(list.childNodes);
            children.forEach(c => {
                if (c.nodeType === 1) {
                    const id = (c as Element).getAttribute("id");
                    if (id) set.add(id);
                }
            });
        };
        populateMaster(tBinList, masterIds.bin);
        // ... populate others if needed, but usually we just append with new prefixed IDs so collisions are rare unless logic is flawed.
        // Actually, we should prefix ALL imported IDs to guarantee uniqueness.

        const sourceCache = new Map<string, { zip: JSZip, header: Document }>();
        const addedBinaryResources: { id: string, path: string, data: Uint8Array }[] = [];

        // --- PREPARE TARGET SECTION ---
        const tSec = findByLocalName(tSectionDoc, "sec")[0];
        if (!tSec) throw new Error("TEMPLATE_CORRUPT: <hs:sec> not found");

        // Save secPr
        let tSecPr: Element | null = null;
        const potentialSecPrs = findByLocalName(tSec, "secPr");
        if (potentialSecPrs.length > 0) {
            tSecPr = potentialSecPrs[0];
            if (tSecPr.parentNode) tSecPr.parentNode.removeChild(tSecPr);
        } else {
            // Create default SecPr if template lacks one
            tSecPr = tSectionDoc.createElement("hp:secPr");
            tSecPr.setAttribute("id", "");
            tSecPr.setAttribute("textDirection", "HORIZONTAL");
            tSecPr.setAttribute("spaceColumns", "1134");
            tSecPr.setAttribute("tabStop", "8000");
            tSecPr.setAttribute("outlineShapeIDRef", "0");
            tSecPr.setAttribute("memoShapeIDRef", "0");
            tSecPr.setAttribute("textVerticalWidthHead", "0");
            tSecPr.setAttribute("masterPageCnt", "1");
            // Basic children to avoid invalid validity
            const pagePr = tSectionDoc.createElement("hp:pagePr");
            pagePr.setAttribute("landscape", "WIDELY");
            pagePr.setAttribute("width", "59528");
            pagePr.setAttribute("height", "84188");
            pagePr.setAttribute("gutterType", "LEFT_ONLY");
            const margin = tSectionDoc.createElement("hp:margin");
            margin.setAttribute("header", "2551");
            margin.setAttribute("footer", "2551");
            margin.setAttribute("gutter", "0");
            margin.setAttribute("left", "5669");
            margin.setAttribute("right", "5669");
            margin.setAttribute("top", "7182");
            margin.setAttribute("bottom", "7182");
            pagePr.appendChild(margin);
            tSecPr.appendChild(pagePr);
        }

        // Clear Target Section (we will rebuild it)
        while (tSec.firstChild) tSec.removeChild(tSec.firstChild);

        // --- MERGE LOOP ---
        for (let i = 0; i < targetQuestions.length; i++) {
            const q = targetQuestions[i];
            const qPrefix = `q${i}_`;

            // Load Source
            const { zip: sZip, header: sHeaderDoc } = await (async () => {
                const loadPath = q.path;
                if (sourceCache.has(loadPath)) return sourceCache.get(loadPath)!;
                const { data, error } = await supabase.storage.from(bucket).download(loadPath);
                if (error || !data) throw new Error(`LOAD_FAIL: ${loadPath}`);
                const z = await JSZip.loadAsync(await data.arrayBuffer());
                const zHead = z.file("Contents/header.xml");
                if (!zHead) throw new Error(`SOURCE_CORRUPT: Missing header.xml in ${loadPath}`);
                const h = parser.parseFromString(await zHead.async("string"), "text/xml");
                const entry = { zip: z, header: h };
                sourceCache.set(loadPath, entry);
                return entry;
            })();

            console.log(`[MERGE_LOOP] Processing qIdx=${i} id=${q.id} path=${q.path}`);

            // 1. Merge Header Definitions
            const mergeDefs = (sListCtx: Element[], tList: Element, prefix: string, idSet: Set<string>) => {
                for (const node of sListCtx) {
                    const oldId = node.getAttribute("id");
                    if (!oldId) continue;
                    const newId = `${prefix}${oldId}`;

                    if (!idSet.has(newId)) {
                        const imported = tHeaderDoc.importNode(node, true);
                        imported.setAttribute("id", newId);

                        // Remap internal references within this definition
                        // e.g. CharPr referencing a FontID, or Style referencing NextStyle
                        const remap = (el: Element) => {
                            const attrs = Array.from(el.attributes);
                            for (const attr of attrs) {
                                const ln = (attr.localName || attr.name.split(':').pop() || "").toLowerCase();
                                const val = attr.value;
                                if (ln.endsWith("idref") || ln.endsWith("ref") || ln === "basedon" || ln === "next") {
                                    // CRITICAL: Skip prefixing for special "null" values
                                    // 4294967295 = 0xFFFFFFFF means "none/null" in HWPX spec
                                    // Prefixing this would create invalid references like "q0_4294967295"
                                    if (val === "4294967295" || val === "0" || val === "-1") {
                                        // Keep original value - these are special "null" markers
                                        continue;
                                    }
                                    el.setAttribute(attr.name, `${prefix}${val}`);
                                }
                            }
                            // Recurse
                            for (let k = 0; k < el.childNodes.length; k++) {
                                if (el.childNodes[k].nodeType === 1) remap(el.childNodes[k] as Element);
                            }
                        };
                        remap(imported);

                        tList.appendChild(imported);
                        idSet.add(newId);
                    }
                }
            };

            mergeDefs(findByLocalName(sHeaderDoc, "fontFace"), tFontFacesList, qPrefix, masterIds.font);
            mergeDefs(findByLocalName(sHeaderDoc, "charPr"), tCharList, qPrefix, masterIds.char);
            mergeDefs(findByLocalName(sHeaderDoc, "paraPr"), tParaList, qPrefix, masterIds.para);
            mergeDefs(findByLocalName(sHeaderDoc, "style"), tStyleList, qPrefix, masterIds.style);
            mergeDefs(findByLocalName(sHeaderDoc, "borderFill"), tBorderFillList, qPrefix, masterIds.border);
            mergeDefs(findByLocalName(sHeaderDoc, "tabPr"), tTabList, qPrefix, masterIds.tab);
            mergeDefs(findByLocalName(sHeaderDoc, "numbering"), tNumberingList, qPrefix, masterIds.num);
            mergeDefs(findByLocalName(sHeaderDoc, "bullet"), tBulletList, qPrefix, masterIds.bullet);

            // Debug: Show what was found in source header
            console.log(`[MERGE_DEFS] qIdx=${i} fontFace=${findByLocalName(sHeaderDoc, "fontFace").length} font=${findByLocalName(sHeaderDoc, "font").length} charPr=${findByLocalName(sHeaderDoc, "charPr").length} paraPr=${findByLocalName(sHeaderDoc, "paraPr").length} style=${findByLocalName(sHeaderDoc, "style").length}`);
            // BinData/Equation needs special handling for file extraction
            // First try header.xml binaryItemList
            const sBinItems = findByLocalName(sHeaderDoc, "binaryItem");
            console.log(`[DEBUG_BIN] qIdx=${i} Found ${sBinItems.length} binaryItems in source header`);

            // If no binaryItems in header, try content.hpf manifest
            if (sBinItems.length === 0) {
                console.log(`[DEBUG_BIN] Fallback: Checking content.hpf manifest for images`);
                const contentHpfRaw = await sZip.file("Contents/content.hpf")?.async("string");
                if (contentHpfRaw) {
                    const hpfDoc = parser.parseFromString(contentHpfRaw, "text/xml");
                    const manifestItems = findByLocalName(hpfDoc, "item");

                    for (const item of manifestItems) {
                        const href = item.getAttribute("href") || "";
                        const itemId = item.getAttribute("id") || "";
                        const mediaType = item.getAttribute("media-type") || "";

                        // Only process image items
                        if (mediaType.startsWith("image/") || href.toLowerCase().includes("bindata/")) {
                            const newId = `${qPrefix}${itemId}`;
                            if (!masterIds.bin.has(newId)) {
                                // Normalize path: content.hpf uses "BinData/image1.jpg"
                                const sourcePath = href.replace(/^Contents\//, "").replace(/^\//, "");

                                const zipKeys = Object.keys(sZip.files);
                                const foundFile = zipKeys.find(k => {
                                    const normK = k.replace(/\\/g, "/").toLowerCase();
                                    const normS = sourcePath.toLowerCase();
                                    return normK === normS || normK === `contents/${normS}`;
                                });

                                console.log(`[DEBUG_BIN_HFP] itemId=${itemId} href=${href} foundFile=${foundFile || 'NOT_FOUND'}`);

                                if (foundFile) {
                                    const fileData = await sZip.file(foundFile)!.async("uint8array");
                                    const ext = foundFile.split('.').pop() || "bin";
                                    const targetPath = `BinData/${newId}.${ext}`;

                                    // Only add to content.hpf manifest (via addedBinaryResources)
                                    // Do NOT add to header.xml binaryItemList - normal HWPX doesn't use it
                                    addedBinaryResources.push({ id: newId, path: targetPath, data: fileData });
                                    masterIds.bin.add(newId);
                                }
                            }
                        }
                    }
                }
            }

            // Process binaryItems from header.xml (if any)
            for (const sBin of sBinItems) {
                const oldId = sBin.getAttribute("id");
                if (!oldId) continue;
                const newId = `${qPrefix}${oldId}`;

                if (!masterIds.bin.has(newId)) {
                    let sourcePath = sBin.getAttribute("relPath") || sBin.getAttribute("absPath") || "";
                    sourcePath = sourcePath.replace(/\\/g, "/").replace(/^(\.\/|\/)/, "");

                    // Extract Data
                    const zipKeys = Object.keys(sZip.files);
                    const foundFile = zipKeys.find(k => {
                        const normK = k.replace(/\\/g, "/").toLowerCase();
                        const normS = sourcePath.toLowerCase();
                        return normK === normS || normK === `contents/${normS}`;
                    });
                    console.log(`[DEBUG_BIN] oldId=${oldId} sourcePath=${sourcePath} foundFile=${foundFile || 'NOT_FOUND'}`);

                    if (foundFile) {
                        const fileData = await sZip.file(foundFile)!.async("uint8array");
                        const ext = foundFile.split('.').pop() || "bin";
                        const targetPath = `BinData/${newId}.${ext}`;

                        addedBinaryResources.push({ id: newId, path: targetPath, data: fileData });

                        const nBin = tHeaderDoc.importNode(sBin, true);
                        nBin.setAttribute("id", newId);
                        nBin.setAttribute("pkgIDRef", newId); // Critical: Link to manifest item
                        nBin.setAttribute("relPath", targetPath);
                        nBin.setAttribute("absPath", targetPath);

                        tBinList.appendChild(nBin);
                        masterIds.bin.add(newId);
                    }
                }
            }

            // EquationItems
            const sEqItems = findByLocalName(sHeaderDoc, "equationItem");
            for (const sEq of sEqItems) {
                const oldId = sEq.getAttribute("id");
                if (!oldId) continue;
                const newId = `${qPrefix}${oldId}`;
                if (!masterIds.eq.has(newId)) {
                    const nEq = tHeaderDoc.importNode(sEq, true);
                    nEq.setAttribute("id", newId);
                    tEqList.appendChild(nEq);
                    masterIds.eq.add(newId);
                }
            }


            // 2. Process Content
            // We use the full source section to guarantee context
            const sourceSecRaw = await sZip.file("Contents/section0.xml")?.async("string");
            if (!sourceSecRaw) throw new Error(`SOURCE_CORRUPT: Missing section0.xml in ${q.path}`);

            const sSecDoc = parser.parseFromString(sourceSecRaw, "text/xml");
            const sSecRoot = findByLocalName(sSecDoc, "sec")[0];
            if (!sSecRoot) continue; // Empty doc?

            // If we have fragment_xml in DB, do we use it?
            let nodesToImport: Element[] = [];

            if (q.fragment_xml && q.fragment_xml.trim().length > 0) {
                // ... (fragment parsing logic remains same, condensed for replacement safety)
                const namespaces = 'xmlns:ha="http://www.hancom.co.kr/hwpml/2011/app" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core" xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" xmlns:hhs="http://www.hancom.co.kr/hwpml/2011/history" xmlns:hm="http://www.hancom.co.kr/hwpml/2011/master-page" xmlns:hpf="http://www.hancom.co.kr/schema/2011/hpf" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf"';
                try {
                    const fragDoc = parser.parseFromString(`<wrapper ${namespaces}>${q.fragment_xml}</wrapper>`, "text/xml");
                    const children = Array.from(fragDoc.documentElement.childNodes);
                    children.forEach(c => {
                        if (c.nodeType === 1) nodesToImport.push(c as Element);
                    });
                } catch (e) {
                    // console.warn(`FRAGMENT_PARSE_FAIL`);
                    nodesToImport = Array.from(sSecRoot.childNodes).filter(n => n.nodeType === 1) as Element[];
                }

                if (nodesToImport.length === 0) {
                    nodesToImport = Array.from(sSecRoot.childNodes).filter(n => n.nodeType === 1) as Element[];
                }
            } else {
                nodesToImport = Array.from(sSecRoot.childNodes).filter(n => n.nodeType === 1) as Element[];
            }

            // Import & Remap Content Nodes
            for (const node of nodesToImport) {
                const imported = tSectionDoc.importNode(node, true);

                // Remap Content References -> Header
                const remapContent = (el: Element) => {
                    // 1. Remove secPr if found (CRITICAL for crash fix)
                    const secPrs = findByLocalName(el, "secPr");
                    secPrs.forEach(spr => {
                        if (spr.parentNode) spr.parentNode.removeChild(spr);
                    });

                    // 2. Regenerate Paragraph ID (CRITICAL for R6025 Crash)
                    // Hancom checks for duplicates and crashes if found.
                    const nodeName = (el.localName || el.nodeName.split(':').pop() || "").toLowerCase();
                    if (nodeName === "p") {
                        // Use deterministic counter-based ID for guaranteed uniqueness
                        paraIdCounter++;
                        el.setAttribute("id", paraIdCounter.toString());
                    }

                    // 3. Remap Attributes
                    const attrs = Array.from(el.attributes);
                    for (const attr of attrs) {
                        const ln = (attr.localName || attr.name.split(':').pop() || "").toLowerCase();
                        const val = attr.value;
                        if (ln.endsWith("idref") || ln.endsWith("ref") ||
                            ln === "styleid" || ln === "charshapeid" || ln === "parashapeid" ||
                            ln === "tabdefid" || ln === "numberingid" || ln === "bulletid") {
                            // CRITICAL: Skip prefixing for special "null" values
                            if (val === "4294967295" || val === "0" || val === "-1") {
                                continue;
                            }
                            el.setAttribute(attr.name, `${qPrefix}${val}`);
                        }
                    }
                    // Recurse
                    for (let k = 0; k < el.childNodes.length; k++) {
                        if (el.childNodes[k].nodeType === 1) remapContent(el.childNodes[k] as Element);
                    }
                };
                remapContent(imported);

                tSec.appendChild(imported);

                // [CLEANUP] Remove redundant xmlns declarations
                const stripRedundantNS = (el: Element) => {
                    if (el.attributes) {
                        const toRemove: string[] = [];
                        for (let k = 0; k < el.attributes.length; k++) {
                            const attr = el.attributes.item(k);
                            if (attr && attr.nodeName.startsWith("xmlns:")) {
                                toRemove.push(attr.nodeName);
                                // Also remove secPr again just in case replacer missed it? No, remapContent handles it.
                            }
                        }
                        toRemove.forEach(n => el.removeAttribute(n));
                    }
                    if (el.childNodes) {
                        for (let k = 0; k < el.childNodes.length; k++) {
                            if (el.childNodes[k].nodeType === 1) stripRedundantNS(el.childNodes[k] as Element);
                        }
                    }
                };
                stripRedundantNS(imported);
            }
        }

        // --- AGGRESSIVE secPr CLEANUP (CRITICAL for R6025 Prevention) ---
        // Remove ALL secPr elements from the entire section before re-injecting template's secPr
        // Source content may include secPr that wasn't caught during remapContent
        const allSecPrs = findByLocalName(tSec, "secPr");
        console.log(`[SECPR_CLEANUP] Found ${allSecPrs.length} secPr elements in merged section, removing all...`);
        allSecPrs.forEach(spr => {
            if (spr.parentNode) spr.parentNode.removeChild(spr);
        });

        // --- RE-INJECT SEC_PR ---
        // Put secPr back into the FIRST paragraph of the merged document
        // This is crucial for page setup (margins, size)
        if (tSecPr) {
            const firstP = findByLocalName(tSec, "p")[0];
            if (firstP) {
                // Try to put in first run
                let r = findByLocalName(firstP, "run")[0];
                if (!r) {
                    r = tSectionDoc.createElement("hp:run");
                    firstP.appendChild(r);
                }
                if (r.firstChild) r.insertBefore(tSecPr, r.firstChild);
                else r.appendChild(tSecPr);
            } else {
                // No paragraphs? Create dummy.
                const p = tSectionDoc.createElement("hp:p");
                const r = tSectionDoc.createElement("hp:run");
                r.appendChild(tSecPr);
                p.appendChild(r);
                tSec.appendChild(p);
            }
        }

        // --- MANIFEST UPDATE (content.hpf) ---
        const hpfPath = "Contents/content.hpf";
        const fHpf = targetZip.file(hpfPath);
        const hpfRaw = fHpf ? await fHpf.async("string") : "";
        const hpfDoc = parser.parseFromString(hpfRaw, "text/xml");
        const manifest = findByLocalName(hpfDoc, "manifest")[0];

        if (manifest) {
            for (const res of addedBinaryResources) {
                const lower = res.path.toLowerCase();
                let mt = "application/octet-stream";
                if (lower.endsWith("jpg") || lower.endsWith("jpeg")) mt = "image/jpeg";
                else if (lower.endsWith("png")) mt = "image/png";
                else if (lower.endsWith("gif")) mt = "image/gif";
                else if (lower.endsWith("bmp")) mt = "image/bmp";

                const item = hpfDoc.createElement("opf:item"); // 'opf' is common prefix, check document
                // Actually check prefix of manifest
                const manPrefix = manifest.nodeName.split(':')[0] === "manifest" ? "" : manifest.nodeName.split(':')[0];
                const tag = manPrefix ? `${manPrefix}:item` : "item";

                const nItem = hpfDoc.createElement(tag);
                nItem.setAttribute("id", res.id);
                nItem.setAttribute("href", res.path);
                nItem.setAttribute("media-type", mt);
                // nItem.setAttribute("compress-method", "DO_NOT_COMPRESS"); // Sometimes needed?

                manifest.appendChild(nItem);

                targetZip.file(res.path, res.data);
            }
            targetZip.file(hpfPath, serializer.serializeToString(hpfDoc));
        }

        // [CRITICAL FIX] Update 'cnt' AND 'itemCnt' attributes in Header
        // Hancom crashes (R6025) if 'cnt' does not match actual child count.
        // itemCnt must also match for structural integrity.
        const updateCount = (list: Element) => {
            if (!list) return;
            const children = Array.from(list.childNodes).filter(n => n.nodeType === 1);
            const count = children.length.toString();
            list.setAttribute("cnt", count);
            // Also update itemCnt if it exists (many lists have both)
            if (list.hasAttribute("itemCnt")) {
                list.setAttribute("itemCnt", count);
            }
        };

        // Debug: Check actual counts before updating
        const getChildCount = (list: Element) => list ? Array.from(list.childNodes).filter(n => n.nodeType === 1).length : 0;
        console.log(`[CNT_DEBUG] charPr=${getChildCount(tCharList)} paraPr=${getChildCount(tParaList)} style=${getChildCount(tStyleList)} fontFaces=${getChildCount(tFontFacesList)} borderFill=${getChildCount(tBorderFillList)}`);

        updateCount(tFontFacesList);
        updateCount(tBorderFillList);
        updateCount(tCharList);
        updateCount(tParaList);
        updateCount(tStyleList);
        updateCount(tTabList);
        updateCount(tNumberingList);
        updateCount(tBulletList);
        updateCount(tMemoList);
        updateCount(tTrackChangeList);
        updateCount(tTrackChangeAuthorList);
        updateCount(tBinList);
        // updateCount(tEqList); // equationItemList usually doesn't have 'cnt'? Check spec. It DOES.
        updateCount(tEqList);

        // --- FINALIZE & SORT HEADER ---
        const finalizeHeader = (doc: Document) => {
            const head = findByLocalName(doc, "head")[0] || doc.documentElement;
            const refList = findByLocalName(doc, "refList")[0];

            // 1. Sort RefList Children
            if (refList) {
                const refPriority: Record<string, number> = {
                    "fontfaces": 10,
                    "borderfills": 20,
                    "charproperties": 30,
                    "tabproperties": 40,
                    "numberings": 50,
                    "bullets": 60,
                    "paraproperties": 70,
                    "styles": 80,
                    "memoproperties": 90,
                    "trackchanges": 100,
                    "users": 110
                };
                const children = Array.from(refList.childNodes).filter(n => n.nodeType === 1) as Element[];
                const sorted = children.sort((a, b) => {
                    const lnA = (a.localName || a.nodeName.split(':').pop() || "").toLowerCase();
                    const lnB = (b.localName || b.nodeName.split(':').pop() || "").toLowerCase();
                    const getP = (ln: string) => refPriority[ln] ? refPriority[ln] : 999;
                    return getP(lnA) - getP(lnB);
                });
                sorted.forEach(el => refList.appendChild(el));
            }

            // 2. Sort Head Children (Siblings of RefList)
            if (head) {
                const headPriority: Record<string, number> = {
                    "beginnum": 10,
                    "reflist": 20,
                    "forbiddenwordlist": 30,
                    "compatibledocument": 40,
                    "docoption": 50,
                    "binaryitemlist": 90, // usually last
                    "equationitemlist": 95
                };
                const children = Array.from(head.childNodes).filter(n => n.nodeType === 1) as Element[];
                const sorted = children.sort((a, b) => {
                    const lnA = (a.localName || a.nodeName.split(':').pop() || "").toLowerCase();
                    const lnB = (b.localName || b.nodeName.split(':').pop() || "").toLowerCase();
                    const getP = (ln: string) => headPriority[ln] ? headPriority[ln] : 500;
                    return getP(lnA) - getP(lnB);
                });
                sorted.forEach(el => head.appendChild(el));
            }
            return serializer.serializeToString(doc);
        };

        const finalSectionXml = serializer.serializeToString(tSectionDoc);
        const finalHeaderXml = finalizeHeader(tHeaderDoc);

        // [CRITICAL] Prevent Duplicate Files (e.g. section0.xml vs Section0.xml)
        targetZip.remove("Contents/section0.xml");
        targetZip.remove("Contents/Section0.xml");
        targetZip.remove("Contents/header.xml");
        targetZip.remove("Contents/Header.xml");

        targetZip.file("Contents/section0.xml", finalSectionXml);
        targetZip.file("Contents/header.xml", finalHeaderXml);

        console.log(`[MERGE_DONE] Serialization complete. Generating buffer...`);
        console.log(`[ZIP_CONTENTS] ${Object.keys(targetZip.files).join(", ")}`);
        console.log(`[XML_PEEK] Section Start: ${finalSectionXml.slice(0, 1500)}`);
        console.log(`[HEADER_PEEK] Header Start: ${finalHeaderXml.slice(0, 3000)}`);
        // Check if charProperties exists in header
        const hasCharPr = finalHeaderXml.includes("charProperties");
        const hasParaPr = finalHeaderXml.includes("paraProperties");
        const hasStyles = finalHeaderXml.includes("styles");
        console.log(`[HEADER_CHECK] charProperties=${hasCharPr} paraProperties=${hasParaPr} styles=${hasStyles}`);

        const outputBuffer = await targetZip.generateAsync({
            type: "nodebuffer",
            compression: "DEFLATE",
            mimeType: "application/hwpx"
        });

        // DEBUG: Save output to disk for analysis
        const debugPath = require('path').join(process.cwd(), 'debug_output.hwpx');
        fs.writeFileSync(debugPath, outputBuffer);
        console.log(`[DEBUG_SAVE] Output saved to ${debugPath}`);

        return outputBuffer;
    }
}