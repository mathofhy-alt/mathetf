import { DOMParser, XMLSerializer } from 'xmldom';
import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib'; // Added for HML compression
import { buildBody, Question, BuildBodyResult } from './body-builder';

export class HmlTemplateManager {
    private logFile: string;

    constructor() {
        this.logFile = path.join(process.cwd(), 'hml-debug.log');
    }

    private log(message: string) {
        const timestamp = new Date().toISOString();
        fs.appendFileSync(this.logFile, `[${timestamp}] ${message}\n`);
    }

    public async buildFinalHmlFile(templateXml: string, questions: any[]): Promise<string> {
        try {
            this.log('Starting Surgical HML Assembly (Rewrite Mode)...');

            // 1. Parse the Template (Preserve EVERYTHING)
            const parser = new DOMParser();
            const doc = parser.parseFromString(templateXml, 'text/xml');

            const head = doc.getElementsByTagName('HEAD')[0];
            const body = doc.getElementsByTagName('BODY')[0];
            const tail = doc.getElementsByTagName('TAIL')?.[0] || this.ensureTail(doc); // Robust tail check

            if (!head || !body) {
                throw new Error('Invalid Template: Missing HEAD or BODY');
            }

            // 2. Global ID Discovery (Deep Scan)
            const maxIds = this.discoverMaxIds(doc);
            this.log(`Global Safe IDs established: Bin=${maxIds.BinData}, Style=${maxIds.Style}`);

            // 3. Prepare Containers
            this.ensureBinDataList(doc, head);
            // Tail is ensured above

            // 4. Delegate Body Building
            this.log(`Calling buildBody with startBinDataId=${maxIds.BinData}`);
            const bodyResult = buildBody(questions, maxIds.BinData);
            this.log(`buildBody complete. BinItems=${bodyResult.binDataItems.length}`);

            // 5. Assemble HML with CLEAN LOGIC
            const finalHml = this.assembleHmlContent(doc, bodyResult);

            this.log('Surgical Assembly Complete.');
            return finalHml;
        } catch (e: any) {
            this.log(`[ERROR] Logic Crash: ${e.message}\n${e.stack}`);
            throw e;
        }
    }

    /**
     * New method to encapsulate the clean assembly logic for binaries and body content.
     * Takes an existing Document and the body build result, then modifies the document.
     */
    private assembleHmlContent(doc: Document, bodyResult: BuildBodyResult): string {
        try {
            const head = doc.getElementsByTagName('HEAD')[0];
            const body = doc.getElementsByTagName('BODY')[0];
            const tail = this.ensureTail(doc);

            const binDataList = this.ensureBinDataList(doc, head);
            const initialBinCount = binDataList.getElementsByTagName('BINITEM').length;
            const binDataStorage = this.ensureBinDataStorage(doc, tail);

            let nextIndex = initialBinCount + 1;
            const binIdToIndexMap = new Map<number, number>();

            // 1. Process Binaries
            for (const bin of bodyResult.binDataItems) {
                binIdToIndexMap.set(bin.id, nextIndex);
                nextIndex++;

                const binItem = doc.createElement('BINITEM');
                // Header Registry: BinData="GLOBAL_ID"
                binItem.setAttribute('BinData', String(bin.id));
                binItem.setAttribute('Format', 'jpg');
                binItem.setAttribute('Type', 'Embedding');
                binDataList.appendChild(binItem);

                const binData = doc.createElement('BINDATA');
                let rawData = bin.data;
                if (rawData.startsWith('data:')) rawData = rawData.split(',')[1] || rawData;
                const buffer = Buffer.from(rawData, 'base64');
                const chunkedData = rawData.match(/.{1,76}/g)?.join('\n') || rawData;

                // Tail Storage: Id="GLOBAL_ID"
                binData.setAttribute('Id', String(bin.id));
                binData.setAttribute('Size', String(buffer.length));
                binData.setAttribute('Encoding', 'Base64');
                binData.setAttribute('Compress', 'false');
                binData.textContent = chunkedData;

                binDataStorage.appendChild(binData);
            }
            this.log(`[Re-Assembly] Processed ${bodyResult.binDataItems.length} binaries. Mapped ${binIdToIndexMap.size} IDs.`);

            // 2. Inject Body with DOM-Based Normalization
            const targetSection = doc.getElementsByTagName('SECTION')[0];
            if (!targetSection) throw new Error('No SECTION found in template');

            while (targetSection.firstChild) targetSection.removeChild(targetSection.firstChild);

            // Ensure PageDef="0" on SECTION (User Critical Request)
            if (!targetSection.getAttribute('PageDef')) {
                targetSection.setAttribute('PageDef', '0');
            }

            // A. Combine all fragments into one wrapper for single pass efficiency
            const rawBodyXml = bodyResult.bodyFragments.join('');

            // B. Parse fragments into a temporary DOM
            // Namespace Note: HML often has 'hp:' or 'hc:' prefixes. xmldom handles them okay-ish in text/xml mode
            // but we wrap in <ROOT> to be safe.
            const tempParser = new DOMParser();
            const wrapperDoc = tempParser.parseFromString(`<ROOT>${rawBodyXml}</ROOT>`, 'text/xml');

            // C. DOM-Based Attribute Normalization (The Fix)
            const pictures = wrapperDoc.getElementsByTagName('PICTURE');
            for (let i = 0; i < pictures.length; i++) {
                const pic = pictures[i];

                // 1. Extract Candidate ID (Look for existing BinItem or BinData)
                // Note: body-builder sets 'BinItem="ID"'
                const rawId = pic.getAttribute('BinItem') || pic.getAttribute('BinData') ||
                    pic.getAttribute('hp:BinItem') || pic.getAttribute('hp:BinData');

                if (rawId) {
                    const globalId = parseInt(rawId, 10);
                    const safeIndex = binIdToIndexMap.get(globalId);

                    if (safeIndex) {
                        // 2. Set Correct 1-based Index
                        pic.setAttribute('BinItem', String(safeIndex));
                        // this.log(`[DOM-Fix] Remapped Picture ID ${globalId} -> Index ${safeIndex}`);
                    } else {
                        // ID not found in current batch (maybe template existing resource?)
                        // If it's a template resource, we should ideally finding its index. 
                        // But for now, we assume body fragments only contain new images.
                        this.log(`[WARN] Picture ID ${rawId} not found in new binary map. Leaving as is.`);
                        // Fallback: Ensure it is at least set to BinItem
                        if (!pic.hasAttribute('BinItem')) pic.setAttribute('BinItem', rawId);
                    }
                }

                // 3. Strict Attribute Cleaning (Remove Forbidden)
                pic.removeAttribute('BinData');
                pic.removeAttribute('hp:BinData');
                pic.removeAttribute('hp:BinItem');
                pic.removeAttribute('Path'); // Path is forbidden in many contexts
                pic.removeAttribute('tmpId');

                // 4. Validate Mandatory
                // if (!pic.hasAttribute('Alpha')) ... (Whitelist approach could be done here too)
            }

            // D. Import cleaned nodes
            const children = Array.from(wrapperDoc.documentElement.childNodes);
            for (let i = 0; i < children.length; i++) {
                const imported = doc.importNode(children[i] as Node, true);
                targetSection.appendChild(imported);
            }

            binDataList.setAttribute('Count', String(binDataList.getElementsByTagName('BINITEM').length));

            return new XMLSerializer().serializeToString(doc);

        } catch (e: any) {
            this.log(`[ERROR] Assembly Crash: ${e.message}\n${e.stack}`);
            throw e;
        }
    }

    /**
     * Creates <TAIL> if missing.
     */
    private ensureTail(doc: Document): Element {
        const root = doc.documentElement;
        let tail = doc.getElementsByTagName('TAIL')[0];
        if (!tail) {
            tail = doc.createElement('TAIL');
            root.appendChild(tail);
        }
        return tail;
    }

    /**
     * Helper: Ensures BINDATALIST exists in HEAD, correctly placed after MAPPINGTABLE.
     */
    private ensureBinDataList(doc: Document, head: Element): Element {
        let list = head.getElementsByTagName('BINDATALIST')[0];
        if (!list) {
            list = doc.createElement('BINDATALIST');
            list.setAttribute('Count', '0');

            // Placement Rules: After MAPPINGTABLE
            const mappingTable = head.getElementsByTagName('MAPPINGTABLE')[0];
            if (mappingTable && mappingTable.nextSibling) {
                head.insertBefore(list, mappingTable.nextSibling);
            } else {
                head.appendChild(list);
            }
        }
        return list;
    }

    /**
     * Helper: Ensures BINDATASTORAGE exists in TAIL.
     */
    private ensureBinDataStorage(doc: Document, tail: Element): Element {
        let storage = tail.getElementsByTagName('BINDATASTORAGE')[0];
        if (!storage) {
            storage = doc.createElement('BINDATASTORAGE');
            tail.appendChild(storage);
        }
        return storage;
    }

    /**
     * Scans the document for maximum used IDs to avoid collisions.
     * Checks both HEAD (definitions) and TAIL (storage, for zombies).
     */
    private discoverMaxIds(doc: Document) {
        const getMax = (tagNames: string[], attrNames: string[], context: Element | Document): number => {
            let max = 0;
            // Iterate all tags
            for (const tag of tagNames) {
                const els = context.getElementsByTagName(tag);
                for (let i = 0; i < els.length; i++) {
                    const el = els[i];
                    for (const attr of attrNames) {
                        if (el.hasAttribute(attr)) {
                            const val = parseInt(el.getAttribute(attr) || '0', 10);
                            if (!isNaN(val) && val > max) max = val;
                        }
                    }
                }
            }
            return max;
        };

        const head = doc.getElementsByTagName('HEAD')[0];
        const tail = doc.getElementsByTagName('TAIL')[0];

        // 1. BinData ID Scan
        // Head: <BINITEM BinData="...">
        let maxBin = getMax(['BINITEM'], ['BinData'], head);
        // Tail: <BINDATA Id="..."> (Catch Zombies)
        if (tail) {
            const zombieMax = getMax(['BINDATA'], ['Id'], tail);
            if (zombieMax > maxBin) {
                this.log(`[WARN] Found Zombie Binary ID ${zombieMax} > Head Max ${maxBin}`);
                maxBin = zombieMax;
            }
        }

        // 2. Style ID Scan (Just in case we need it later, mainly strictly unnecessary for just images but good practice)
        const maxStyle = getMax(['STYLE'], ['Id'], head);

        return {
            BinData: maxBin,
            Style: maxStyle
        };
    }
}
