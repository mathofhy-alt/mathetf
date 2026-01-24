
import { parseHmlV2 } from './src/lib/hml-v2/parser';

const COMPLEX_ENDNOTE_HML = `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>
<HWPML Style="embed" SubVersion="8.0.0.0" Version="2.8">
<HEAD>
<MAPPINGTABLE><BINDATALIST Count="0"></BINDATALIST></MAPPINGTABLE>
</HEAD>
<BODY>
<SECTION Id="0">

<!-- Question 1: Simple Endnote (Answer only) -->
<P ParaShape="0" Style="0">
    <TEXT>Question 1 Text
        <ENDNOTE>
            <PARALIST>
                <P><TEXT><AUTONUM Number="1" Type="Digit"/>Answer 1</TEXT></P>
            </PARALIST>
        </ENDNOTE>
    </TEXT>
</P>

<!-- Question 2: Complex Endnote (Answer + Explanation Table) -->
<P ParaShape="0" Style="0">
    <TEXT>Question 2 Text
        <ENDNOTE>
            <PARALIST>
                <P><TEXT><AUTONUM Number="2" Type="Digit"/>Answer 2</TEXT></P>
                <P>
                    <TEXT>
                        Explanation Text
                        <TABLE BorderFill="1">
                            <ROW><CELL BorderFill="2"><PARALIST><P><TEXT>Table Cell Content</TEXT></P></PARALIST></CELL></ROW>
                        </TABLE>
                    </TEXT>
                </P>
            </PARALIST>
        </ENDNOTE>
    </TEXT>
</P>

</SECTION>
</BODY>
<TAIL><BINDATASTORAGE></BINDATASTORAGE></TAIL>
</HWPML>
`;

console.log('--- Testing Complex Endnote Parsing ---');

const result = parseHmlV2(COMPLEX_ENDNOTE_HML);

console.log(`Extracted ${result.questions.length} questions`);

result.questions.forEach((q) => {
    console.log(`\n[Question ${q.questionNumber}] Content XML Length: ${q.contentXml.length}`);
    if (q.contentXml.includes('Table Cell Content')) {
        console.log('SUCCESS: Table content preserved in Endnote!');
    } else {
        console.error('FAILURE: Table content MISSING in Endnote!');
    }

    if (q.contentXml.includes('BorderFill')) {
        console.error('FAILURE: BorderFill attribute NOT removed!');
    } else {
        console.log('SUCCESS: BorderFill attribute removed.');
    }

    console.log('Snippet:', q.contentXml.slice(0, 500).replace(/\n/g, ' '));
});
