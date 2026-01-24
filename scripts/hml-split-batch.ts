import fs from 'fs';
import path from 'path';
import { DOMParser, XMLSerializer } from 'xmldom';
import { parseHmlV2 } from '../src/lib/hml-v2/parser';

// Config
const INPUT_HML = '테스트.hml';
const OUTPUT_DIR = 'temp_hml_splits';

async function splitHml() {
    process.env.DEBUG = 'true';
    console.log(`--- HML Split Batch Core (V29 Fixed) ---`);

    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR);
    } else {
        // Clear previous runs
        fs.readdirSync(OUTPUT_DIR).forEach(f => {
            try { fs.unlinkSync(path.join(OUTPUT_DIR, f)); } catch (e) { }
        });
    }

    const rawHml = fs.readFileSync(INPUT_HML, 'utf-8');
    const parseResult = parseHmlV2(rawHml);

    console.log(`Parsed ${parseResult.questions.length} questions from ${INPUT_HML}`);

    const parser = new DOMParser();
    const fullDoc = parser.parseFromString(rawHml, 'text/xml');
    const serializer = new XMLSerializer();

    const headEl = fullDoc.getElementsByTagName('HEAD')[0] || fullDoc.getElementsByTagName('hp:head')[0];

    // V29: Reset CARETPOS to prevent HWP crashes on small docs (Critical Fix)
    const docSetting = headEl.getElementsByTagName('DOCSETTING')[0];
    if (docSetting) {
        const caretPos = docSetting.getElementsByTagName('CARETPOS')[0];
        if (caretPos) {
            caretPos.setAttribute('Para', '0');
            caretPos.setAttribute('Pos', '0');
        }
    }

    const charShapeList = headEl.getElementsByTagName('CHARSHAPELIST')[0];
    if (charShapeList) {
        const whiteShape = fullDoc.createElement('CHARSHAPE');
        whiteShape.setAttribute('Id', '999');
        whiteShape.setAttribute('TextColor', '16777215'); // White
        whiteShape.setAttribute('Height', '1000');
        const fontId = fullDoc.createElement('FONTID');
        ['Hangul', 'Hanja', 'Japanese', 'Latin', 'Other', 'Symbol', 'User'].forEach(l => fontId.setAttribute(l, '1'));
        whiteShape.appendChild(fontId);
        charShapeList.appendChild(whiteShape);
    }

    const headXml = headEl ? serializer.serializeToString(headEl) : '';
    const originalTail = fullDoc.getElementsByTagName('TAIL')[0] || fullDoc.getElementsByTagName('hp:tail')[0];
    const tailXml = originalTail ? serializer.serializeToString(originalTail) : '';

    const colDefXml = '<COLDEF Count="2" Layout="Left" SameGap="2268" SameSize="true" Type="Newspaper"><COLUMNLINE Type="3" Width="1"/></COLDEF>';

    for (const q of parseResult.questions) {
        console.log(`Processing Q${q.questionNumber} (V29 Split)...`);

        // --- VERSION 1: MAIN (Question only, Invisible Marker) ---
        let mainContent = q.contentXml.replace(/<\?antigravity-binaries.*?\?>/g, '');

        // Marker Masking: Replace ENDNOTE content with empty space and white style
        const mainProcessedXml = mainContent.replace(/<ENDNOTE\b([\s\S]*?)>([\s\S]*?)<\/ENDNOTE>/gi, (match, attrs, content) => {
            return `<ENDNOTE ${attrs}><PARALIST><P ParaShape="1"><TEXT CharShape="999"><CHAR>  </CHAR></TEXT></P></PARALIST></ENDNOTE>`;
        });

        // --- VERSION 2: COMMENTARY (Commentary only) ---
        const endnoteMatch = q.contentXml.match(/<ENDNOTE\b[\s\S]*?<\/ENDNOTE>/i);
        let commentContent = '';
        if (endnoteMatch) {
            // We take the INSIDE of the endnote's PARALIST (the actual P tags)
            commentContent = endnoteMatch[0].replace(/<ENDNOTE\b[\s\S]*?>[\s\S]*?<PARALIST[\s\S]*?>/i, '').replace(/<\/PARALIST>[\s\S]*?<\/ENDNOTE>/i, '');
        }

        // V29 CLEANUP: Strip any data-hml attributes that might break HWP
        const cleanMain = mainProcessedXml.replace(/\s+data-hml-[^=]+="[^"]*"/gi, '');
        const cleanComment = commentContent.replace(/\s+data-hml-[^=]+="[^"]*"/gi, '');

        // Generate Main HML
        const mainHml = `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>
<HWPML Style="embed" SubVersion="8.0.0.0" Version="2.8">
${headXml}
<BODY>
<SECTION Id="0">
${colDefXml}
${cleanMain}
</SECTION>
</BODY>
${tailXml}
</HWPML>`;

        const mName = `q_${String(q.questionNumber).padStart(3, '0')}_main.hml`;
        fs.writeFileSync(path.join(OUTPUT_DIR, mName), mainHml);

        // Generate Comment HML
        if (cleanComment) {
            const commentHml = `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>
<HWPML Style="embed" SubVersion="8.0.0.0" Version="2.8">
${headXml}
<BODY>
<SECTION Id="0">
${cleanComment}
</SECTION>
</BODY>
${tailXml}
</HWPML>`;
            const cName = `q_${String(q.questionNumber).padStart(3, '0')}_comment.hml`;
            fs.writeFileSync(path.join(OUTPUT_DIR, cName), commentHml);
        }
    }

    console.log(`Successfully split into ${parseResult.questions.length} pairs in ${OUTPUT_DIR}`);
}

splitHml().catch(err => {
    console.error(`Split Error:`, err);
});
