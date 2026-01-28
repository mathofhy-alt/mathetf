import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import { DOMParser, XMLSerializer } from 'xmldom';
import { generateHmlFromTemplate } from './src/lib/hml-v2/generator';
import { QuestionWithImages, DbQuestion, DbQuestionImage } from './src/lib/hml-v2/types';
import { getImageDimensions } from './src/lib/image-utils';

function flattenEndnotes(xml: string): string {
    let result = '';
    let lastIndex = 0;
    let match;

    // Regex to find ENDNOTEs
    // We capture the content inside
    const endnoteRegex = /<ENDNOTE[^>]*>([\s\S]*?)<\/ENDNOTE>/gi;

    while ((match = endnoteRegex.exec(xml)) !== null) {
        // [CRITICAL FIX] Append the text BEFORE this Endnote (Prefix)
        const prefix = xml.slice(lastIndex, match.index);
        result += prefix;

        let content = match[1]; // The content inside <ENDNOTE>...</ENDNOTE>

        // [MIRROR FIX] Robust unwrap using DOMParser
        if (content.includes('<PARALIST')) {
            try {
                // Ensure valid XML for parsing
                const doc = new DOMParser().parseFromString(`<WRAP>${content}</WRAP>`, 'text/xml');
                const root = doc.documentElement;
                const paralist = root.getElementsByTagName('PARALIST')[0];

                if (paralist) {
                    const serializer = new XMLSerializer();
                    let innerXml = '';

                    const cleanAttributes = (node: any) => {
                        if (node.nodeType === 1) {
                            node.removeAttribute('Style');
                            node.removeAttribute('ParaShape');
                            node.removeAttribute('CharShape');
                            if (node.hasChildNodes()) {
                                for (let j = 0; j < node.childNodes.length; j++) {
                                    cleanAttributes(node.childNodes[j]);
                                }
                            }
                        }
                    };

                    for (let i = 0; i < paralist.childNodes.length; i++) {
                        cleanAttributes(paralist.childNodes[i]);
                        innerXml += serializer.serializeToString(paralist.childNodes[i]);
                    }
                    if (innerXml.trim().length > 0) {
                        content = innerXml;
                    }
                }
            } catch (e) {
                console.warn('DOMParser unwrap failed in debug script', e);
            }
        }

        // [FALLBACK] Nuclear Option: Forcibly strip PARALIST tags if they exist.
        if (content.includes('<PARALIST')) {
            // Remove opening tag (handling attributes) and closing tag
            content = content.replace(/<PARALIST[^>]*>/gi, '').replace(/<\/PARALIST>/gi, '');
        }

        // [SAFETY] Strip Dangerous Tags that crash Hancom
        const dangerousTags = ['SECDEF', 'COLDEF', 'PAGEDEF', 'HEADER', 'FOOTER', 'FOOTNOTE', 'ENDNOTE'];
        dangerousTags.forEach(tag => {
            const regex = new RegExp(`<${tag}[^>]*>.*?</${tag}>|<${tag}[^>]*/>`, 'gi');
            if (regex.test(content)) {
                content = content.replace(regex, '');
            }
        });

        // [CRITICAL FIX] Smart Breakout Logic (Tag Balancing)
        // BUG FIX: <CHAR/> (self-closing) was being counted as an OPEN tag, causing false positives.

        // 1. Count ALL "Open-like" tags (including self-closing)
        const allOpenMatches = result.match(/<CHAR[^>]*>/g) || [];
        // 2. Count explicitly Self-Closing tags <CHAR ... />
        const selfClosingMatches = result.match(/<CHAR[^>]*\/>/g) || [];
        // 3. Count Closing tags </CHAR>
        const closeMatches = result.match(/<\/CHAR>/g) || [];

        // Real Open Count = All Open matches - Self Closing matches
        const realOpenCount = allOpenMatches.length - selfClosingMatches.length;
        const closeCount = closeMatches.length;

        const isInsideChar = realOpenCount > closeCount;

        // Break out of current context
        let breakoutTemplateStart = `</TEXT></P>`;
        let breakoutTemplateEnd = `<P><TEXT>`;

        if (isInsideChar) {
            console.log(`[TRACE] Endnote found inside <CHAR> (Nesting: ${realOpenCount} vs ${closeCount}). Using Deep Breakout.`);
            breakoutTemplateStart = `</CHAR></TEXT></P>`;
            breakoutTemplateEnd = `<P><TEXT><CHAR>`;
        }

        // Append the processed content with breakout wrappers (In-Place)
        result += breakoutTemplateStart + content + breakoutTemplateEnd;

        lastIndex = endnoteRegex.lastIndex;
    }

    // Append the remaining text
    result += xml.slice(lastIndex);
    return result;
}

// --- Load Environment Variables ---
try {
    const envPath = path.join(process.cwd(), '.env.local');
    if (fs.existsSync(envPath)) {
        const envConfig = fs.readFileSync(envPath, 'utf-8');
        envConfig.split('\n').forEach(line => {
            const [key, value] = line.split('=');
            if (key && value) {
                process.env[key.trim()] = value.trim().replace(/^["']|["']$/g, '');
            }
        });
        console.log("Loaded .env.local");
    }
} catch (e) {
    console.warn("Failed to load .env.local", e);
}

// --- Configuration ---
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://your-project.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'your-service-role-key';

// The specific questions that were failing
const TARGET_QUESTION_IDS = [
    'b040946c-737b-48ef-8fab-91eaf6e3baf2'
];

async function run() {
    console.log("--- HML Dropout Simulation (Mixed Batch) ---");

    if (SUPABASE_URL === 'https://your-project.supabase.co') {
        console.error("Error: Environment variables not set. Please run with .env.local loaded.");
        return;
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    console.log(`Simulating download for ${TARGET_QUESTION_IDS.length} questions...`);

    // 1. Fetch Questions
    const { data: questions, error } = await supabase
        .from('questions')
        .select('*')
        .in('id', TARGET_QUESTION_IDS);

    if (error || !questions) {
        console.error("Error fetching questions:", error);
        return;
    }

    // 2. Load Template Directly and Inject Anchor
    const templatePath = path.join(process.cwd(), 'hml v2-test-tem.hml');
    if (!fs.existsSync(templatePath)) {
        console.error(`Error: Template file not found at ${templatePath}`);
        return;
    }
    let template = fs.readFileSync(templatePath, 'utf-8');

    // Inject content anchor if missing
    if (!template.includes('{{CONTENT_HERE}}')) {
        console.log("Injecting {{CONTENT_HERE}} anchor into template...");
        const secMatch = template.match(/(<SECTION[^>]*>)([\s\S]*?)(<\/SECTION>)/);
        if (secMatch) {
            template = template.replace(secMatch[0], `${secMatch[1]}{{CONTENT_HERE}}${secMatch[3]}`);
            console.log("Anchor injected successfully.");
        } else {
            console.warn("Could not find SECTION tag to inject anchor! Template snippet:", template.substring(0, 500));
        }
    }

    // [SAFETY] Helper for DOM-based Sanitization
    function sanitizeHmlAttributes(xmlContent: string) {
        try {
            const doc = new DOMParser().parseFromString(`<ROOT>${xmlContent}</ROOT>`, 'text/xml');
            const elements = doc.getElementsByTagName('*');

            // Strict Whitelist of Allowed HML Body Tags
            const allowedTags = new Set([
                'P', 'TEXT', 'CHAR', 'EQUATION', 'SHAPEOBJECT', 'SHAPECOMPONENT', 'SHAPECOMMENT',
                'ROTATIONINFO', 'RENDERINGINFO', 'TRANSMATRIX', 'SCAMATRIX', 'ROTMATRIX',
                'IMAGERECT', 'IMAGECLIP', 'INSIDEMARGIN', 'OUTSIDEMARGIN', 'IMAGE', 'EFFECTS', 'SCRIPT',
                'ROOT', 'WRAP', // Internal wrappers
                'ENDNOTE' // [CRITICAL] Allow ENDNOTE so we can sanitize inside it before flattening
            ]);

            // Iterate backwards so we can safely delete nodes
            for (let i = elements.length - 1; i >= 0; i--) {
                const el = elements[i];
                if (el.nodeType === 1) { // Element
                    const tagName = el.tagName.toUpperCase();

                    // 1. Tag Whitelist Check
                    if (!allowedTags.has(tagName)) {
                        console.warn(`[WARN] Stripping Unknown Tag <${tagName}> (Keep children).`);
                        // Unwrap children (replace node with its children)
                        while (el.firstChild) {
                            el.parentNode?.insertBefore(el.firstChild, el);
                        }
                        el.parentNode?.removeChild(el);
                        continue; // Node is gone, next
                    }

                    const attrsToRemove = [];
                    for (let j = 0; j < el.attributes.length; j++) {
                        const name = el.attributes[j].name;
                        if (name.match(/^(Style|ParaShape|CharShape|BinData|FaceName|BorderFill|ImageID|data-hml-.*)$/i)) {
                            attrsToRemove.push(name);
                        }
                    }
                    if (attrsToRemove.length > 0) {
                        attrsToRemove.forEach(name => el.removeAttribute(name));
                    }

                    // [SAFETY] Inject Default Attributes for P tags
                    if (tagName === 'P') {
                        if (!el.getAttribute('ParaShape')) el.setAttribute('ParaShape', '0');
                        if (!el.getAttribute('Style')) el.setAttribute('Style', '0');
                    }
                }
            }
            const serializer = new XMLSerializer();
            let serialized = serializer.serializeToString(doc);

            // Unwrap ROOT
            serialized = serialized.replace(/^<ROOT>/, '').replace(/<\/ROOT>$/, '');

            // [SAFETY] Post-Processing:
            // 1. Strip Control Characters (Low ASCII) which crash Hancom
            //    Fail-safe for "dirty" endnotes. Preserves \t, \n, \r.
            //    Removes: \x00-\x08, \x0B, \x0C, \x0E-\x1F
            serialized = serialized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');

            // 2. Expand Critical Self-Closing Tags
            //    xmldom serializes empty <P> as <P/>. Hancom HATES this.
            //    We force expansion: <P/> -> <P></P>, <TEXT/> -> <TEXT></TEXT>
            serialized = serialized.replace(/<(P|TEXT|CHAR)([^>]*)\/>/gi, '<$1$2></$1>');

            return serialized;
        } catch (e) {
            console.warn(`[ERROR] DOM Sanitization Failed: ${e}`);
            return xmlContent;
        }
    }

    // Global monotonic counter
    let globalInstIdCounter = (Date.now() % 1000000) * 1000;

    // 3. Process Questions
    const processedData: QuestionWithImages[] = [];

    for (const q of questions) {
        console.log(`Processing Q: ${q.id} (Type: ${q.question_type}) ContentLen: ${q.content_xml?.length || 0}`);

        let contentXml = q.content_xml || '';
        if (contentXml.includes('<ENDNOTE')) {
            contentXml = flattenEndnotes(contentXml);
            console.log(`[FIX] Flattened Endnotes for Q:${q.id}`);
        }
        const images: DbQuestionImage[] = [];

        // A. Try fetching from question_images table
        const { data: dbImages } = await supabase
            .from('question_images')
            .select('*')
            .eq('question_id', q.id)
            .order('index', { ascending: true });

        if (dbImages && dbImages.length > 0) {
            console.log(`   -> Found ${dbImages.length} images in DB`);
            for (const img of dbImages) {
                try {
                    const res = await fetch(img.image_url);
                    if (!res.ok) throw new Error(`Status ${res.status}`);
                    const buffer = await res.arrayBuffer();
                    images.push({
                        id: img.id,
                        question_id: q.id,
                        original_bin_id: String(images.length + 1),
                        format: 'jpg',
                        data: Buffer.from(buffer).toString('base64'),
                        size_bytes: buffer.byteLength,
                        created_at: new Date().toISOString()
                    });
                } catch (e) {
                    console.warn(`   -> Failed to fetch image ${img.image_url}`);
                }
            }
        }

        // B. Fallback to Embedded Images
        if (images.length === 0 && contentXml.includes('<?antigravity-binaries')) {
            console.log("   -> Detected antigravity-binaries tag");
            const binaryTagMatch = contentXml.match(/<\?antigravity-binaries\s+([\s\S]*?)\?>/);
            if (binaryTagMatch) {
                const attributes = binaryTagMatch[1];
                const dataMatch = attributes.match(/data="([^"]*)"/);
                if (dataMatch) {
                    try {
                        const rawJson = Buffer.from(dataMatch[1], 'base64').toString('utf-8');
                        const binaryData = JSON.parse(rawJson);

                        const keys = Object.keys(binaryData);
                        console.log(`      -> Binary keys found: ${keys.slice(0, 5).join(', ')}... (Total: ${keys.length})`);

                        keys.forEach((key, idx) => {
                            let rawVal = binaryData[key];
                            // Handle Object wrapper { type: 'jpg', data: '...' }
                            if (rawVal && typeof rawVal === 'object' && rawVal.data) {
                                rawVal = rawVal.data;
                            }

                            if (typeof rawVal === 'string') {
                                images.push({
                                    id: `embed-${idx}`,
                                    question_id: q.id,
                                    original_bin_id: String(images.length + 1),
                                    format: 'jpg',
                                    data: rawVal,
                                    size_bytes: Buffer.from(rawVal, 'base64').length,
                                    created_at: new Date().toISOString()
                                });
                            }
                        });
                        console.log(`   -> Fallback recovered ${images.length} images`);
                    } catch (e) {
                        console.error("   -> Fallback JSON parse failed", e);
                    }
                } else {
                    console.warn("   -> No 'data' attribute in binaries tag");
                }
            }
        } else {
            if (images.length === 0) console.log("   -> No images found via DB or Fallback");
        }

        // C. Transform Custom XML to HWPML
        if (images.length > 0) {
            let newBodyXml = '';

            for (let i = 0; i < images.length; i++) {
                const imgBuffer = Buffer.from(images[i].data, 'base64');
                const dims = getImageDimensions(imgBuffer);

                // Convert to HwpUnits (Fallback to 10000 if failed)
                const hwpWidth = dims && dims.width ? Math.round(dims.width * 75) : 30000;
                const hwpHeight = dims && dims.height ? Math.round(dims.height * 75) : 20000;

                // [SAFETY] Fix ID Collision Crash (Timestamp + Sequence)
                globalInstIdCounter += 10;
                const instId = globalInstIdCounter;
                const shapeComponentId = instId + 1;

                const centerX = Math.floor(hwpWidth / 2);
                const centerY = Math.floor(hwpHeight / 2);

                const binRef = images[i].original_bin_id;

                newBodyXml += `
<P>
<TEXT>
<CHAR>
<SHAPEOBJECT InstId="${instId}" NumberingType="Figure" TextWrap="TopAndBottom" ZOrder="0">
<SIZE Width="${hwpWidth}" Height="${hwpHeight}" WidthRelTo="Absolute" HeightRelTo="Absolute" Protect="false"/>
<POSITION TreatAsChar="true" HorzAlign="Left" VertAlign="Top" VertRelTo="Para" HorzRelTo="Column" FlowWithText="true" AllowOverlap="true" HoldAnchorAndSO="false" AffectLSpacing="false"/>
<OUTSIDEMARGIN Left="0" Right="0" Top="0" Bottom="0"/>
<SHAPECOMMENT/>
<SHAPECOMPONENT GroupLevel="0" HorzFlip="false" InstID="${shapeComponentId}" OriHeight="${hwpHeight}" OriWidth="${hwpWidth}" VertFlip="false" XPos="0" YPos="0">
<ROTATIONINFO Angle="0" CenterX="${centerX}" CenterY="${centerY}"/>
<RENDERINGINFO>
<TRANSMATRIX E1="1.00000" E2="0.00000" E3="0.00000" E4="0.00000" E5="1.00000" E6="0.00000"/>
<SCAMATRIX E1="1.00000" E2="0.00000" E3="0.00000" E4="0.00000" E5="1.00000" E6="0.00000"/>
<ROTMATRIX E1="1.00000" E2="0.00000" E3="0.00000" E4="0.00000" E5="1.00000" E6="0.00000"/>
</RENDERINGINFO>
</SHAPECOMPONENT>
<IMAGERECT X0="0" X1="${hwpWidth}" X2="${hwpWidth}" X3="0" Y0="0" Y1="0" Y2="${hwpHeight}" Y3="${hwpHeight}"/>
<IMAGECLIP Bottom="${hwpHeight}" Left="0" Right="${hwpWidth}" Top="0"/>
<INSIDEMARGIN Bottom="0" Left="0" Right="0" Top="0"/>
<IMAGE Alpha="0" Bright="0" Contrast="0" Effect="RealPic" BinData="${binRef}"/>
<EFFECTS/>
</SHAPEOBJECT>
</CHAR>
</TEXT>
</P>
`;
                newBodyXml += '<P><TEXT><CHAR/></TEXT></P>';
            }

            // [CRITICAL FIX] Preserve original text (Answers/Explanations)
            let textOnly = contentXml.replace(/<\?antigravity-binaries[\s\S]*?\?>/, '').trim();

            // Fix invalid XML splicing caused by Breakout logic
            // [SAFETY] Robust Regex Strip for Breakout Wrappers (Handles whitespace)
            textOnly = textOnly.replace(/^[\s\r\n]*<\/TEXT><\/P>/i, '');
            textOnly = textOnly.replace(/<P><TEXT>[\s\r\n]*$/i, '');
            textOnly = textOnly.trim();

            // [SAFETY: CRASH FIX] DOM-Based Attribute Sanitization (Universal)
            console.log(`[FIX] Sanitizing Attributes (Universal).`);
            textOnly = sanitizeHmlAttributes(textOnly);

            // [SAFETY] Block Validation
            if (textOnly.length > 0 && !textOnly.startsWith('<P')) {
                console.log(`[WARN] Text verified as NON-BLOCK! Wrapping in P.`);
                textOnly = `<P ParaShape="0" Style="0"><TEXT><CHAR>${textOnly}</CHAR></TEXT></P>`;
            }

            contentXml = newBodyXml + textOnly;
        } else {
            // No images found? Just empty paragraph
            console.log("   -> Skipping transformation (0 images). Inserting placeholder.");
            const placeholder = `<P ParaShape="0" Style="0"><TEXT><CHAR>(이미지 없음)</CHAR></TEXT></P>`;

            let textOnly = contentXml.replace(/<\?antigravity-binaries[\s\S]*?\?>/, '').trim();
            // [SAFETY] Robust Regex Strip for Breakout Wrappers (Handles whitespace)
            textOnly = textOnly.replace(/^[\s\r\n]*<\/TEXT><\/P>/i, '');
            textOnly = textOnly.replace(/<P><TEXT>[\s\r\n]*$/i, '');
            textOnly = textOnly.trim();

            // [SAFETY] Universal Sanitization
            console.log(`[FIX] Sanitizing Attributes (Universal - No Images).`);
            textOnly = sanitizeHmlAttributes(textOnly);

            if (textOnly.length > 0) {
                if (!textOnly.startsWith('<P')) {
                    textOnly = `<P ParaShape="0" Style="0"><TEXT><CHAR>${textOnly}</CHAR></TEXT></P>`;
                }
                contentXml = textOnly; // Use text instead of placeholder if text exists? Or both?
                // Logic in route.ts was: contentXml = textOnly (if exists) OR placeholder
            } else {
                contentXml = placeholder;
            }
        }

        const qUpdated = { ...q, content_xml: contentXml };

        processedData.push({
            question: qUpdated as DbQuestion,
            images: images
        });
    }

    console.log(`\nPassing ${processedData.length} questions to Generator...`);

    // Using the lower-level function directly with formatted data
    const result = await generateHmlFromTemplate(template, processedData);

    console.log(`\nGenerator Result: ${result.questionCount} questions processed.`);

    const hmlOutput = result.hmlContent;
    const sectionCount = (hmlOutput.match(/<SECTION/g) || []).length;
    console.log(`Output HML contains ${sectionCount} SECTIONS.`);

    const binDataCount = (hmlOutput.match(/<BINDATA /g) || []).length;
    console.log(`Output HML contains ${binDataCount} BINDATA entries.`);
    const binItemCount = (hmlOutput.match(/<BINITEM /g) || []).length;
    console.log(`Output HML contains ${binItemCount} BINITEM entries.`);

    const outputPath = path.join(process.cwd(), 'dropout_debug_output.hml');
    fs.writeFileSync(outputPath, hmlOutput);
    console.log(`Saved debug HML to ${outputPath}`);
}

run().catch(err => console.error(err));
