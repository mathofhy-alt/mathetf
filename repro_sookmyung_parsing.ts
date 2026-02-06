
const { parseHmlV2 } = require('./src/lib/hml-v2/parser.ts');

const mockHml = `
<HML>
<HEAD>
<MAPPINGTABLE>
<STYLELIST>
<STYLE Id="1" Name="문제1" ParaShape="1" CharShape="1" />
<STYLE Id="2" Name="3선지" ParaShape="2" CharShape="2" />
</STYLELIST>
</MAPPINGTABLE>
</HEAD>
<BODY>
<SECTION>
<P Style="1"><TEXT><CHAR>34. 다음을 구하시오.</CHAR></TEXT></P>
<P Style="1"><TEXT><CHAR>① 10</CHAR><TAB /><CHAR>② 20</CHAR><TAB /><CHAR>③ 30</CHAR></TEXT></P>
<P Style="1"><TEXT><CHAR>④ 40</CHAR><TAB /><CHAR>⑤ 50</CHAR></TEXT></P>
</SECTION>
</BODY>
</HML>
`;

const result = parseHmlV2(mockHml);
console.log(`Found ${result.questions.length} questions.`);
result.questions.forEach((q, i) => {
    console.log(`Q${i + 1}:`);
    console.log(q.contentXml.substring(0, 100) + "...");
    // Check semantic roles in XML
    const choiceTags = q.contentXml.match(/data-hml-style="CHOICE"/g) || [];
    const questionTags = q.contentXml.match(/data-hml-style="QUESTION"/g) || [];
    console.log(`  CHOICE roles: ${choiceTags.length}`);
    console.log(`  QUESTION roles: ${questionTags.length}`);
});
