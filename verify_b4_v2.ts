
import fs from 'fs';
import path from 'path';
import { generateHmlFromTemplate } from './src/lib/hml-v2/generator.ts';

async function main() {
    const templatePath = path.join(process.cwd(), '재조립양식.hml');
    if (!fs.existsSync(templatePath)) {
        console.error('Template not found');
        return;
    }

    const templateContent = fs.readFileSync(templatePath, 'utf-8');

    // Mock question with a multi-column table inside a BOX_BOGI role
    const questionsWithImages = [
        {
            question: {
                plain_text: "1. 다음 보기의 표 내용을 확인하시오. 질문 내용...",
                content_xml: `<P ParaShape="1" Style="1" data-hml-style="QUESTION"><TEXT CharShape="0"><CHAR>1. 다음 보기의 표 내용을 확인하시오.</CHAR></TEXT></P>
<TABLE BorderFill="7" CellSpacing="0" ColCount="1" PageBreak="Cell" RepeatHeader="true" RowCount="1">
  <ROW>
    <CELL BorderFill="5" ColAddr="0" ColSpan="1" Width="29320"><PARALIST><P><TEXT><CHAR>Table Content</CHAR></TEXT></P></PARALIST></CELL>
  </ROW>
</TABLE>
<P ParaShape="1" Style="0"><TEXT CharShape="0"><CHAR>질문 내용...</CHAR></TEXT></P>`
            } as any,
            images: []
        },
        {
            images: [],
            question: {
                content_xml: `<P ParaShape="1" Style="1" data-hml-style="QUESTION"><TEXT CharShape="0"><CHAR>2. 다음 중 옳은 것은?</CHAR></TEXT></P>
<P ParaShape="1" Style="0" data-hml-style="CHOICE"><TEXT CharShape="0"><CHAR>① 정답</CHAR></TEXT></P>`,
                fragment_xml: `<P ParaShape="1" Style="1" data-hml-style="QUESTION"><TEXT CharShape="0"><CHAR>2. 다음 중 옳은 것은?</CHAR></TEXT></P>
<P ParaShape="1" Style="0" data-hml-style="CHOICE"><TEXT CharShape="0"><CHAR>① 정답</CHAR></TEXT></P>`,
                plain_text: "2. 다음 중 옳은 것은? ① 정답"
            } as any
        }
    ];

    console.log('--- Generating B4 HML ---');
    const result = generateHmlFromTemplate(templateContent, questionsWithImages);

    const outputPath = path.join(process.cwd(), 'verify_b4_output.hml');
    fs.writeFileSync(outputPath, result.hmlContent);

    console.log(`Generated: ${outputPath}`);

    // Check for some keywords in output
    const outContent = result.hmlContent;
    console.log('PAGEDEF Height:', outContent.match(/PAGEDEF[^>]*Height="(\d+)"/)?.[1]);
    console.log('PAGEDEF Width:', outContent.match(/PAGEDEF[^>]*Width="(\d+)"/)?.[1]);

    // Check Table Width in the generated content (specifically inside SIZE tags)
    const tableWidths = [...outContent.matchAll(/<SIZE[^>]*Width="(\d+)"/g)].map(m => m[1]);
    console.log('Table Widths found in output:', tableWidths);

    // Check if COLDEF is preserved
    console.log('COLDEF Count:', outContent.match(/<COLDEF[^>]*Count="(\d+)"/)?.[1]);

    // Check if Internal Table Structure is preserved (should have 2 cells now)
    const cellCount = [...outContent.matchAll(/<CELL/g)].length;
    console.log('Total CELL count in output:', cellCount);
    // Template has 3 cells in pattern. Mock has 2 cells in internal table. Total should be > 3 if preserved.
    if (cellCount > 3) {
        console.log('✅ Success: Internal table structure seems preserved.');
    } else {
        console.log('❌ Failure: Internal table structure might be flattened.');
    }
}

main().catch(console.error);
