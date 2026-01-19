import { DOMParser, XMLSerializer } from 'xmldom';

/**
 * HML Parser (Refined DOM-Based Version V4)
 *
 * Fixes:
 * 1. Style Extraction: Captures BORDERFILL, PARASHAPE, CHARSHAPE, and STYLE definitions 
 *    that are used within each question fragment.
 * 2. Intelligent Question Splitting (Numbering-based).
 * 3. HWPX Namespace Support.
 */

export interface ParsedQuestion {
    question_number: number;
    content_xml: string;
    plain_text: string;
    binaries: {
        id: string;
        data: string;
        type: string;
        binType: string;
        compress: string;
    }[];
}

// Helper to detect if a paragraph starts with a question number
const isQuestionStart = (node: Element): boolean => {
    const text = node.textContent || "";
    const trimmed = text.trim();
    if (/^\d+[\.\)\]]/.test(trimmed) || /^[\(\[]\d+[\)\]]/.test(trimmed)) return true;

    // Check if it's a paragraph containing an image or math but very little text
    // This handles cases where an image is the first thing in a question segment
    const hasImage = node.getElementsByTagName('PICTURE').length > 0 || node.getElementsByTagName('hp:pic').length > 0;
    const hasMath = node.getElementsByTagName('EQUATION').length > 0 || node.getElementsByTagName('hp:equation').length > 0;

    // If it has an image/math and starts the HML fragment conceptually
    // we might need a more complex heuristic, but for now let's stick to text-based
    // or endnote-based if text fails.
    return false;
};

export const parseHml = (hmlContent: string): ParsedQuestion[] => {
    if (!hmlContent || hmlContent.trim().length === 0) return [];

    const parser = new DOMParser();
    const serializer = new XMLSerializer();
    const doc = parser.parseFromString(hmlContent, 'text/xml');

    // 1. Map Global Assets and Styles
    const binDataBlobs = new Map<string, { data: string, compress: string }>();
    const binDataElements = Array.from(doc.getElementsByTagName('BINDATA')).concat(Array.from(doc.getElementsByTagName('hp:binData')));
    binDataElements.forEach(el => {
        // Multi-namespace attribute support
        const id = el.getAttribute('Id') || el.getAttribute('hp:id') || el.getAttribute('hp:Id');
        if (id) {
            binDataBlobs.set(id, {
                data: el.textContent || '',
                compress: el.getAttribute('Compress') || el.getAttribute('hp:compress') || el.getAttribute('hp:Compress') || 'false'
            });
        }
    });

    const binItemMeta = new Map<string, { format: string, type: string }>();
    const binItems = Array.from(doc.getElementsByTagName('BINITEM')).concat(Array.from(doc.getElementsByTagName('hp:binItem')));
    binItems.forEach(item => {
        const id = item.getAttribute('BinData') || item.getAttribute('Id') ||
            item.getAttribute('hp:BinData') || item.getAttribute('hp:Id');
        if (id) {
            binItemMeta.set(id, {
                format: item.getAttribute('Format') || item.getAttribute('hp:Format') || 'jpg',
                type: item.getAttribute('Type') || item.getAttribute('hp:Type') || 'Embedding'
            });
        }
    });

    // Style Mapping: Tag -> Map<Id, XML>
    const styleDefinitions = {
        PARASHAPE: new Map<string, string>(),
        CHARSHAPE: new Map<string, string>(),
        STYLE: new Map<string, string>(),
        BORDERFILL: new Map<string, string>()
    };

    const tagVariants: Record<keyof typeof styleDefinitions, string[]> = {
        PARASHAPE: ['PARASHAPE', 'hp:paraShape', 'paraShape'],
        CHARSHAPE: ['CHARSHAPE', 'hp:charShape', 'charShape'],
        STYLE: ['STYLE', 'hp:style', 'style'],
        BORDERFILL: ['BORDERFILL', 'hp:borderFill', 'borderFill']
    };

    Object.entries(tagVariants).forEach(([category, variants]) => {
        variants.forEach(variant => {
            const nodes = Array.from(doc.getElementsByTagName(variant));
            nodes.forEach(node => {
                const id = node.getAttribute('Id') || node.getAttribute('hp:id') || node.getAttribute('hp:Id');
                if (id) styleDefinitions[category as keyof typeof styleDefinitions].set(id, serializer.serializeToString(node));
            });
        });
    });

    // 2. Identify Section and Top-Level Children
    const body = doc.getElementsByTagName('BODY')[0] || doc.getElementsByTagName('BODYTEXT')[0] || doc.getElementsByTagName('hp:body')[0];
    if (!body) return [];

    const section = body.getElementsByTagName('SECTION')[0] || body.getElementsByTagName('hp:section')[0] || body;
    const topLevelNodes = Array.from(section.childNodes).filter(n => n.nodeType === 1);

    // Find question boundaries
    const startIndices: number[] = [];
    for (let i = 0; i < topLevelNodes.length; i++) {
        const node = topLevelNodes[i] as Element;
        if (isQuestionStart(node)) startIndices.push(i);
    }

    // fallback
    if (startIndices.length === 0) {
        for (let i = 0; i < topLevelNodes.length; i++) {
            const node = topLevelNodes[i] as Element;
            if (node.getElementsByTagName('ENDNOTE').length > 0) startIndices.push(i);
        }
    }

    if (startIndices.length === 0) return [];

    const questions: ParsedQuestion[] = [];

    startIndices.forEach((startIndex, idx) => {
        const nextStartIndex = startIndices[idx + 1] !== undefined ? startIndices[idx + 1] : topLevelNodes.length;
        const questionNodes = topLevelNodes.slice(startIndex, nextStartIndex);

        const fragmentDoc = parser.parseFromString('<WRAPPER />', 'text/xml');
        const wrapper = fragmentDoc.documentElement;
        questionNodes.forEach(node => wrapper.appendChild(fragmentDoc.importNode(node, true)));

        const fragmentXml = serializer.serializeToString(wrapper)
            .replace(/^<WRAPPER[^>]*>/, '')
            .replace(/<\/WRAPPER>$/, '');

        // Extract used binaries and styles
        const fragmentBinaries: any[] = [];
        const fragmentStyles: { type: string, id: string, xml: string }[] = [];
        const seenStyleIds = new Set<string>();
        const seenBinIds = new Set<string>();

        const elements = wrapper.getElementsByTagName('*');
        for (let i = 0; i < elements.length; i++) {
            const el = elements[i];

            // Binaries (Namespace Aware)
            const binId = el.getAttribute('BinData') || el.getAttribute('BinItem') ||
                el.getAttribute('hp:BinData') || el.getAttribute('hp:BinItem');
            if (binId && !seenBinIds.has(binId)) {
                seenBinIds.add(binId);
                const blob = binDataBlobs.get(binId);
                if (blob) {
                    fragmentBinaries.push({
                        id: binId,
                        data: blob.data,
                        type: binItemMeta.get(binId)?.format || 'jpg',
                        binType: binItemMeta.get(binId)?.type || 'Embedding',
                        compress: blob.compress
                    });
                }
            }

            // Styles (Namespace Aware)
            const mapping: Record<string, keyof typeof styleDefinitions> = {
                'ParaShape': 'PARASHAPE',
                'ParaShapeId': 'PARASHAPE',
                'hp:ParaShape': 'PARASHAPE',
                'hp:paraShape': 'PARASHAPE',
                'CharShape': 'CHARSHAPE',
                'CharShapeId': 'CHARSHAPE',
                'hp:CharShape': 'CHARSHAPE',
                'hp:charShape': 'CHARSHAPE',
                'Style': 'STYLE',
                'StyleId': 'STYLE',
                'hp:Style': 'STYLE',
                'hp:style': 'STYLE',
                'BorderFill': 'BORDERFILL',
                'BorderFillId': 'BORDERFILL',
                'hp:BorderFill': 'BORDERFILL',
                'hp:borderFill': 'BORDERFILL'
            };

            Object.entries(mapping).forEach(([attr, tag]) => {
                const id = el.getAttribute(attr);
                if (id) {
                    const key = `${tag}:${id}`;
                    if (!seenStyleIds.has(key)) {
                        seenStyleIds.add(key);
                        const xml = styleDefinitions[tag].get(id);
                        if (xml) fragmentStyles.push({ type: tag, id, xml });
                    }
                }
            });
        }

        const plainText = wrapper.textContent?.trim().slice(0, 300) || '';
        const binB64 = Buffer.from(JSON.stringify(fragmentBinaries)).toString('base64');
        const styleB64 = Buffer.from(JSON.stringify(fragmentStyles)).toString('base64');

        const finalContentXml = fragmentXml +
            `<?ANTIGRAVITY_BINARIES_B64 ${binB64} ?>` +
            `<?ANTIGRAVITY_STYLES_B64 ${styleB64} ?>`;

        questions.push({
            question_number: idx + 1,
            content_xml: finalContentXml,
            plain_text: plainText,
            binaries: fragmentBinaries
        });
    });

    return questions.map(q => {
        console.log(`[HML PARSER] Question ${q.question_number} Binaries:`, q.binaries.length, q.binaries.map(b => b.id));
        if (q.binaries.length > 0) {
            console.log(`[HML PARSER] First Binary ID=${q.binaries[0].id} Size=${q.binaries[0].data.length}`);
        }
        return q;
    });
};

export const extractTagContent = (xml: string, tagName: string): string | null => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, 'text/xml');
    const elements = doc.getElementsByTagName(tagName);
    if (elements.length > 0) {
        const serializer = new XMLSerializer();
        return serializer.serializeToString(elements[0]);
    }
    return null;
};
