
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
                id: 'q1',
                question_number: 1,
                content_xml: `<P ParaShape="1" Style="1" data-hml-style="QUESTION"><TEXT CharShape="0"><CHAR>1. 다음 보기의 표 내용을 확인하시오.</CHAR></TEXT></P>
                             <TABLE BorderFill="1" data-hml-style="BOX_BOGI">
                               <SHAPEOBJECT InstId="999" Lock="false" NumberingType="Table" ZOrder="0">
                                 <SIZE Height="1000" HeightRelTo="Absolute" Protect="false" Width="20000" WidthRelTo="Absolute"/>
                               </SHAPEOBJECT>
                               <ROW>
                                 <CELL><PARALIST><P><TEXT><CHAR>Column 1 Content</CHAR></TEXT></P></PARALIST></CELL>
                                 <CELL><PARALIST><P><TEXT><CHAR>Column 2 Content</CHAR></TEXT></P></PARALIST></CELL>
                               </ROW>
                             </TABLE>
                             <P ParaShape="1" Style="0"><TEXT CharShape="0"><CHAR>질문 내용...</CHAR></TEXT></P>`,
                plain_text: 'Preview with table'
            } as any,
            images: []
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
