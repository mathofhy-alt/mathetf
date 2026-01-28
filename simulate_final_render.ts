
import * as fs from 'fs';
import * as path from 'path';
import { DOMParser, XMLSerializer } from 'xmldom';

// --- INLINED TYPES ---
interface QuestionWithImages {
    question: { id: string; content_xml: string; question_number: number };
    images: any[];
}
interface GenerateResult {
    hmlContent: string;
    questionCount: number;
    imageCount: number;
}

// --- MOCK GENERATOR LOGIC (Copied from generator.ts) ---
function generateHmlFromTemplate(
    templateContent: string,
    questionsWithImages: QuestionWithImages[]
): GenerateResult {
    console.log(`[HML-V2 Nuclear Generator] Processing ${questionsWithImages.length} questions`);

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
        if (role) boxPatterns[role] = serializer.serializeToString(table);
    }

    // [v18.6] Template Cleanup
    let cleanedTemplate = templateContent;
    const marker = '{{MASTER_PATTERNS_START}}';
    if (cleanedTemplate.includes(marker)) {
        const mIdx = cleanedTemplate.indexOf(marker);
        const sEnd = cleanedTemplate.indexOf('</SECTION>', mIdx);
        if (sEnd !== -1) {
            cleanedTemplate = cleanedTemplate.substring(0, mIdx) + cleanedTemplate.substring(sEnd);
        }
    }
    cleanedTemplate = cleanedTemplate.replace(/<\?xml[\s\S]*?\?>/i, '').trim();

    // 1. Initial State & ID Calibration
    let maxTemplateInstId = 0;
    let maxTemplateZOrder = 0;
    const instIdMatches = cleanedTemplate.match(/InstId="(\d+)"/gi) || [];
    const zOrderMatches = cleanedTemplate.match(/ZOrder="(\d+)"/gi) || [];

    [...instIdMatches].forEach(m => {
        const val = parseInt(m.match(/\d+/)![0], 10);
        if (val > maxTemplateInstId) maxTemplateInstId = val;
    });
    zOrderMatches.forEach(m => {
        const val = parseInt(m.match(/\d+/)![0], 10);
        if (val > maxTemplateZOrder) maxTemplateZOrder = val;
    });

    let nextInstId = Math.max(1000000, maxTemplateInstId + 10000);
    let nextZOrder = Math.max(1000, maxTemplateZOrder + 100);
    let nextImageId = 1;

    // Flush existing BinData IDs
    const existingBins = templateDoc.getElementsByTagName('BINDATA');
    for (let i = 0; i < existingBins.length; i++) {
        const id = parseInt(existingBins[i].getAttribute('Id') || '0', 10);
        if (id >= nextImageId) nextImageId = id + 1;
    }

    const validStyles = {
        ParaShape: new Set<string>(),
        CharShape: new Set<string>(),
        Style: new Set<string>(),
        StyleNames: new Map<string, string>(),
        StyleToPara: new Map<string, string>(),
        BorderFills: new Map<string, string>(),
        BorderFillIds: new Set<string>(),
        InjectedBorders: [] as { id: string; xml: string }[],
        nextBorderId: 100,
        nextInstId: () => nextInstId++,
        nextZOrder: () => nextZOrder++,
        imageIdMap: new Map<string, number>()
    };

    // Collect Template Definitions
    const mappingTable = templateDoc.getElementsByTagName('MAPPINGTABLE')[0];
    if (mappingTable) {
        const collect = (tagName: string, set: Set<string>, nameMap?: Map<string, string>) => {
            const elements = mappingTable.getElementsByTagName(tagName);
            for (let i = 0; i < elements.length; i++) {
                const id = elements[i].getAttribute('Id');
                const name = elements[i].getAttribute('Name');
                if (id) {
                    set.add(id);
                    if (name && nameMap) nameMap.set(name, id);
                }
            }
        };
        collect('PARASHAPE', validStyles.ParaShape);
        collect('CHARSHAPE', validStyles.CharShape);
        collect('STYLE', validStyles.Style, validStyles.StyleNames);

        const styles = mappingTable.getElementsByTagName('STYLE');
        for (let i = 0; i < styles.length; i++) {
            const id = styles[i].getAttribute('Id');
            const paraShape = styles[i].getAttribute('ParaShape');
            if (id && paraShape) validStyles.StyleToPara.set(id, paraShape);
        }
    }

    // 2. Question Assembly
    let combinedContentXmlFull = '';
    const allImages: any[] = [];

    for (const qwi of questionsWithImages) {
        const qDoc = parser.parseFromString(`<WRAP>${qwi.question.content_xml}</WRAP>`, 'text/xml');
        const root = qDoc.documentElement;

        const finalNodes: string[] = [];
        let currentGroup: any[] = [];
        let currentRole = '';

        const flushGroup = () => {
            if (currentGroup.length === 0) return;
            if (currentRole.startsWith('BOX_')) {
                // Simplified box logic for simulation
                finalNodes.push(currentGroup.map(g => serializer.serializeToString(g)).join(''));
            } else {
                const tempContainer = qDoc.createElement('TEMP_REBUILD');
                currentGroup.forEach(g => tempContainer.appendChild(g));

                let stabilizedXml = '';
                while (tempContainer.firstChild) {
                    const child = tempContainer.firstChild as any;
                    if (child.nodeType === 1) {
                        sanitizeNodeStyles(child, validStyles, serializer, parser);
                        stabilizedXml += serializer.serializeToString(child);
                    } else if (child.nodeType === 3) {
                        stabilizedXml += child.textContent;
                    }
                    tempContainer.removeChild(child);
                }

                const trimmed = stabilizedXml.trim();
                // Match logic from generator.ts:177
                if (trimmed.startsWith('<P') || trimmed.startsWith('<hp:p')) {
                    finalNodes.push(stabilizedXml);
                } else if (trimmed.length > 0) {
                    // This is where generic text gets wrapped
                    finalNodes.push(`<P ParaShape="0" Style="0"><TEXT CharShape="0"><CHAR>${stabilizedXml}</CHAR></TEXT></P>`);
                }
            }
            currentGroup = [];
            currentRole = '';
        };

        const children = Array.from(root.childNodes);
        for (const child of children) {
            const el = child.nodeType === 1 ? (child as any) : null;
            const tagName = el ? (el.tagName || '').toUpperCase().replace('HP:', '') : '';

            if (tagName === 'P') {
                flushGroup();
                sanitizeNodeStyles(el!, validStyles, serializer, parser);
                finalNodes.push(serializer.serializeToString(el!));
            } else if (child.textContent?.trim()) {
                // Only text?
                flushGroup();
                const span = qDoc.createElement('SPAN');
                span.textContent = child.textContent;
                currentGroup.push(span);
                currentRole = 'NORMAL';
            }
        }
        flushGroup();

        let questionXml = finalNodes.join('\n');

        // Strip prefixes logic
        questionXml = questionXml.replace(/<([\w:]+)([^>]*?)(\/?)>/gi, (m, tagNameWithPrefix, attrs, slash) => {
            const tag = (tagNameWithPrefix.includes(':') ? tagNameWithPrefix.split(':')[1] : tagNameWithPrefix).toUpperCase();
            return `<${tag}${attrs}${slash}>`; // removed aggressive attr strip for simplicity
        });
        questionXml = questionXml.replace(/<\/([\w:]+)>/gi, (m, tagNameWithPrefix) => {
            return `</${(tagNameWithPrefix.includes(':') ? tagNameWithPrefix.split(':')[1] : tagNameWithPrefix).toUpperCase()}>`;
        });

        combinedContentXmlFull += questionXml + `<P ParaShape="0" Style="0"><TEXT CharShape="0"><CHAR></CHAR></TEXT></P>`.repeat(5);
    }

    // 3. Structural Splicing
    let currentHml = cleanedTemplate;
    currentHml = currentHml.replace('{{CONTENT_HERE}}', () => combinedContentXmlFull);

    // [v19.0] Final Assembly
    if (!currentHml.match(/<HWPML[^>]*xmlns=/i)) {
        currentHml = currentHml.replace(/<HWPML([^>]*?)>/i, '<HWPML$1 xmlns="http://www.hancom.com/hwpml/2011/paragraph">');
    }

    // IMPORTANT: Forced Expansion
    currentHml = currentHml.replace(/<(HWPML|BODY|SECTION|TAIL|P|TEXT|CHAR|TABLE|ROW|CELL|PARALIST|SHAPEOBJECT|SHAPECOMPONENT|DRAWINGOBJECT|EQUATION|BINDATALIST|BINDATASTORAGE|COLUMNLINE)\b([^>]*)\/>/gi, '<$1$2></$1>');

    const finalHml = '\uFEFF' + `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>\r\n` + currentHml.trim().replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');

    return { hmlContent: finalHml, questionCount: questionsWithImages.length, imageCount: 0 };
}

function sanitizeNodeStyles(node: any, validSets: any, serializer: any, parser: any) {
    if (node.nodeType !== 1) return;
    const tag = node.tagName.toUpperCase();

    if (tag === 'P') {
        if (!node.getAttribute('Style')) node.setAttribute('Style', '0');
        // This is the suspicious line: if '1' exists in template it uses it, otherwise 0.
        // If template doesn't have 0, 0 might still be implicit default?
        if (!node.getAttribute('ParaShape')) node.setAttribute('ParaShape', validSets.ParaShape.has('1') ? '1' : '0');
    }

    if (tag === 'TEXT') {
        if (!node.getAttribute('CharShape')) node.setAttribute('CharShape', '0');
    }

    // Recursion
    for (let i = 0; i < node.childNodes.length; i++) sanitizeNodeStyles(node.childNodes[i], validSets, serializer, parser);
}

// --- DRIVER CODE ---

// Mock Log
const log = (msg: string) => console.log(msg);

// 1. Load Template
const templatePath = '재조립양식.hml';
if (!fs.existsSync(templatePath)) {
    console.error(`Template ${templatePath} not found!`);
    process.exit(1);
}
const templateContent = fs.readFileSync(templatePath, 'utf-8');

// 2. Dummy Content (Simulating a question that appears empty)
const rawContent = `
<P data-hml-style="QUESTION" data-hml-orig-style="문제1" data-hml-align="Left"><TEXT>1. 다음 글의 내용을 한 문장으로 요약하고자 한다.</TEXT></P>
<P><TEXT>빈칸 (A), (B)에 들어갈 말로 가장 적절한 것은?</TEXT></P>
<P><TEXT>History is not just about the past.</TEXT></P>
`;

// 3. Replicate route.ts Logic - Sanitize
function sanitizeHmlAttributes(xmlContent: string, log: (msg: string) => void): string {
    try {
        const escapedContent = xmlContent.replace(/&(?!(amp|lt|gt|quot|apos|#\d+|#x[a-fA-F0-9]+);)/g, '&amp;');
        const doc = new DOMParser().parseFromString(`<ROOT>${escapedContent}</ROOT>`, 'text/xml');

        let elements = doc.getElementsByTagName('*');
        const docLevelTags = new Set(['HWPML', 'BODY', 'SECTION']);
        for (let i = elements.length - 1; i >= 0; i--) {
            const el = elements[i];
            const tagNameFull = el.tagName.toUpperCase();
            const localName = tagNameFull.includes(':') ? tagNameFull.split(':')[1] : tagNameFull;
            if (docLevelTags.has(localName)) {
                while (el.firstChild) { el.parentNode?.insertBefore(el.firstChild, el); }
                el.parentNode?.removeChild(el);
            }
        }

        // Allowed tags stripping (simplified)
        // ...

        // [CRITICAL FIX v20.1] Text Node Wrapping (The fix I just applied)
        const textElements = doc.getElementsByTagName('TEXT');
        for (let i = 0; i < textElements.length; i++) {
            const textEl = textElements[i];
            const childNodes = Array.from(textEl.childNodes);
            for (const child of childNodes) {
                if (child.nodeType === 3 && child.nodeValue && child.nodeValue.trim().length > 0) {
                    const charWrapper = doc.createElement('CHAR');
                    charWrapper.textContent = child.nodeValue;
                    textEl.replaceChild(charWrapper, child);
                }
            }
        }

        const serializer = new XMLSerializer();
        let serialized = serializer.serializeToString(doc);
        serialized = serialized.replace(/^\s*<ROOT[^>]*>/i, '').replace(/<\/ROOT>\s*$/i, '');
        serialized = serialized.replace(/<(P|TEXT|CHAR)\b([^>]*)\/>/gi, '<$1$2></$1>');
        return serialized;
    } catch (e) {
        log(`[ERROR] DOM Sanitization Failed: ${e}`);
        return xmlContent;
    }
}

// 5. Run Pipeline
console.log('--- STARTING SIMULATION ---');
console.log('[1] Sanitizing...');
let processedXml = sanitizeHmlAttributes(rawContent, log);
console.log('Sanitized XML:', processedXml);

console.log('[2] Generating HML...');
const questionsWithImages = [{
    question: { id: 'test-q-1', content_xml: processedXml, question_number: 1 },
    images: []
}];

const output = generateHmlFromTemplate(templateContent, questionsWithImages as any);

// 6. Save Output
const outPath = path.join(process.cwd(), 'simulate_output.hml');
fs.writeFileSync(outPath, output.hmlContent);
console.log(`[SUCCESS] Wrote ${output.hmlContent.length} chars to ${outPath}`);
