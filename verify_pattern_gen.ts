import { parseHmlV2 } from './src/lib/hml-v2/parser';
import { generateHmlFromTemplate } from './src/lib/hml-v2/generator';
import * as fs from 'fs';

async function verifyPatternGeneration() {
    console.log('--- Phase 6 Verification: Pattern-Based Box Generation ---');

    // 1. Create a mock HML source with BOX_BOGI, BOX_JOKUN, BOX_MIJU styles
    const mockSourceHml = `
<?xml version="1.0" encoding="UTF-8" standalone="no" ?>
<HWPML Version="2.8">
<HEAD>
    <MAPPINGTABLE>
        <STYLELIST Count="5">
            <STYLE Id="0" Name="바탕글"/>
            <STYLE Id="1" Name="문제1"/>
            <STYLE Id="2" Name="보기박스"/>
            <STYLE Id="3" Name="조건박스"/>
            <STYLE Id="4" Name="미주박스"/>
        </STYLELIST>
    </MAPPINGTABLE>
</HEAD>
<BODY>
<SECTION>
    <P Style="1"><TEXT><CHAR><AUTONUM Number="1" Type="Endnote"/></CHAR> 질문입니다.</TEXT></P>
    <P Style="2"><TEXT><CHAR>이것은 보기 내용 1입니다.</CHAR></TEXT></P>
    <P Style="2"><TEXT><CHAR>이것은 보기 내용 2입니다.</CHAR></TEXT></P>
    <P Style="3"><TEXT><CHAR>이것은 조건 내용입니다.</CHAR></TEXT></P>
    <P Style="4"><TEXT><CHAR>이것은 해설 내용입니다.</CHAR></TEXT></P>
</SECTION>
</BODY>
</HWPML>
    `.trim();

    // 2. Parse mock source
    const parseResult = parseHmlV2(mockSourceHml);
    console.log(`Parsed ${parseResult.questions.length} questions`);

    // 3. Load template
    const templateContent = fs.readFileSync('재조립양식.hml', 'utf-8');

    // 4. Generate output
    const questionsWithImages = parseResult.questions.map(q => ({
        question: {
            id: 'mock-id',
            question_number: q.questionNumber,
            content_xml: q.contentXml,
            plain_text: q.plainText
        } as any,
        images: []
    }));

    const result = generateHmlFromTemplate(templateContent, questionsWithImages);

    // 5. Save and check
    fs.writeFileSync('verify_pattern_output.hml', result.hmlContent);
    console.log('Generated: verify_pattern_output.hml');

    // Verification logic
    const output = result.hmlContent;
    const hasBogiTable = output.includes('<CHAR>이것은 보기 내용 1입니다.</CHAR>');
    const hasJokunTable = output.includes('<CHAR>이것은 조건 내용입니다.</CHAR>');
    const hasMijuTable = output.includes('<CHAR>이것은 해설 내용입니다.</CHAR>');

    console.log(`Has Bogi Content: ${hasBogiTable}`);
    console.log(`Has Jokun Content: ${hasJokunTable}`);
    console.log(`Has Miju Content: ${hasMijuTable}`);

    if (hasBogiTable && hasJokunTable && hasMijuTable) {
        console.log('SUCCESS: All Box Contents were correctly injected into the HML.');
    } else {
        console.error('FAILURE: Missing box content in output.');
    }
}

verifyPatternGeneration();
