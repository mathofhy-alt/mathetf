
import { DOMParser } from 'xmldom';
import * as fs from 'fs';

const filePath = 'dropout_debug_output.hml';
if (!fs.existsSync(filePath)) {
    console.error('File not found:', filePath);
    process.exit(1);
}

const xml = fs.readFileSync(filePath, 'utf-8');
console.log(`Read ${xml.length} bytes.`);

const errors: string[] = [];
const warnings: string[] = [];

function logError(msg: string) {
    console.error('[ERROR]', msg);
    errors.push(msg);
}
function logWarn(msg: string) {
    console.warn('[WARN]', msg);
    warnings.push(msg);
}

try {
    const doc = new DOMParser({
        errorHandler: {
            warning: (w) => logWarn(`XML Parse Warning: ${w}`),
            error: (e) => logError(`XML Parse Error: ${e}`),
            fatalError: (e) => logError(`XML Parse Fatal: ${e}`),
        }
    }).parseFromString(xml, 'text/xml');

    // --- 1. HEAD Definition Collection ---
    const mappingTable = doc.getElementsByTagName('MAPPINGTABLE')[0];
    if (!mappingTable) {
        logError('No MAPPINGTABLE found in HEAD');
    }

    const collectIds = (tagName: string, idAttr: string = 'Id'): Set<string> => {
        const set = new Set<string>();
        const list = doc.getElementsByTagName(tagName);
        if (list.length > 0) {
            // The list itself usually contains items. e.g. BORDERFILLLIST -> BORDERFILL
            // Actually HML structure: <BORDERFILLLIST Count=".."><BORDERFILL Id="1">...</BORDERFILL></BORDERFILLLIST>
            // So we need to find the children of the list.
            // But getElementsByTagName returns ALL descendants. 
            // We should find the specific LIST tag first.
            // Heuristic: iterate ALL tags of type 'childTagName' (e.g. BORDERFILL) and grab Ids.
            // This is safe because definitions are in HEAD.
            // BUT wait, DocDef also uses BorderFill? No.
        }
        return set;
    };

    // Helper to scrape IDs from HEAD
    const scrapeHeadIds = (listTagName: string, itemTagName: string, idAttr: string = 'Id'): Set<string> => {
        const ids = new Set<string>();
        const lists = doc.getElementsByTagName(listTagName);
        if (lists.length > 0) {
            const list = lists[0]; // Assuming one list per type
            const items = list.getElementsByTagName(itemTagName);
            for (let i = 0; i < items.length; i++) {
                const val = items[i].getAttribute(idAttr);
                if (val) ids.add(val);
            }
        }
        return ids;
    };

    const borderFillIds = scrapeHeadIds('BORDERFILLLIST', 'BORDERFILL');
    const charShapeIds = scrapeHeadIds('CHARSHAPELIST', 'CHARSHAPE');
    const paraShapeIds = scrapeHeadIds('PARASHAPELIST', 'PARASHAPE');
    const styleIds = scrapeHeadIds('STYLELIST', 'STYLE');

    console.log(`Definitions Found: BorderFill=${borderFillIds.size}, CharShape=${charShapeIds.size}, ParaShape=${paraShapeIds.size}, Style=${styleIds.size}`);

    // --- 2. Structural Integrity (BODY) ---
    const bodies = doc.getElementsByTagName('BODY');
    if (bodies.length === 0) logError('No BODY found');

    const sections = doc.getElementsByTagName('SECTION');
    console.log(`Found ${sections.length} SECTIONs`);

    for (let i = 0; i < sections.length; i++) {
        const sec = sections[i];
        for (let j = 0; j < sec.childNodes.length; j++) {
            const child = sec.childNodes[j];
            if (child.nodeType === 1) { // Element
                const tagName = child.nodeName;
                if (tagName !== 'P') {
                    logError(`SECTION ${i} contains illegal child: <${tagName}>. Only <P> is allowed directly.`);
                }
            }
        }
    }

    // Check TABLE references
    const tables = doc.getElementsByTagName('TABLE');
    for (let i = 0; i < tables.length; i++) {
        const t = tables[i];
        // Structure check: TABLE > ROW > CELL > PARALIST > P
        const rows = t.getElementsByTagName('ROW');
        if (rows.length === 0) logError(`TABLE at index ${i} has NO ROWs`);

        // Attr check
        const bf = t.getAttribute('BorderFill');
        if (bf && !borderFillIds.has(bf)) {
            logError(`TABLE at index ${i} refers to missing BorderFill="${bf}"`);
        }
    }

    // Check All Elements for Missing IDs
    const allElems = doc.getElementsByTagName('*');
    for (let i = 0; i < allElems.length; i++) {
        const el = allElems[i];

        const checkAttr = (attr: string, set: Set<string>, name: string) => {
            const val = el.getAttribute(attr);
            if (val && !set.has(val)) {
                logError(`<${el.nodeName}> refers to missing ${name}="${val}"`);
            }
        };

        checkAttr('BorderFill', borderFillIds, 'BorderFill');
        checkAttr('ParaShape', paraShapeIds, 'ParaShape');
        checkAttr('CharShape', charShapeIds, 'CharShape');
        checkAttr('Style', styleIds, 'Style');
    }

    // --- Summary ---
    if (errors.length === 0) {
        console.log('--- AUDIT PASSED: No Structural Errors Found ---');
    } else {
        console.log('--- AUDIT FAILED ---');
        console.log(`Total Errors: ${errors.length}`);
    }

} catch (e) {
    logError(`Exception: ${e}`);
}
