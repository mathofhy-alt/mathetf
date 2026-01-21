import { parseHmlV2 } from './src/lib/hml-v2/parser.ts';

const mockHml = `<?xml version="1.0" encoding="UTF-8"?>
<HWPML Version="2.8">
<HEAD>
  <MAPPINGTABLE>
    <BORDERFILLLIST Count="2">
      <BORDERFILL Id="10" Slash="0" BackSlash="0" CenterLine="0" CounterBackSlash="0" CounterSlash="0" CrookedSlash="0" Shadow="false" ThreeD="false" BreakCellSeparateLine="0">
        <LEFTBORDER Type="Dash" Width="0.2mm" Color="255"/>
        <RIGHTBORDER Type="Dash" Width="0.2mm" Color="255"/>
        <TOPBORDER Type="Double" Width="0.5mm" Color="0"/>
        <BOTTOMBORDER Type="Double" Width="0.5mm" Color="0"/>
      </BORDERFILL>
    </BORDERFILLLIST>
  </MAPPINGTABLE>
</HEAD>
<BODY>
  <SECTION Id="0">
    <P Style="1">
      <TABLE BorderFill="10">
        <ROW>
          <CELL BorderFill="10">
            <PARALIST><P><TEXT><CHAR>Test</CHAR></TEXT></P></PARALIST>
          </CELL>
        </ROW>
      </TABLE>
    </P>
  </SECTION>
</BODY>
</HWPML>`;

console.log("--- Testing Border Extraction Fidelity ---");
try {
    const { questions } = parseHmlV2(mockHml);
    const q1 = questions[0];

    if (q1) {
        console.log("Extracted Content XML Sample (partial):");
        const tableTag = q1.contentXml.match(/<TABLE[^>]+>/);
        if (tableTag) {
            console.log(tableTag[0]);
        }

        if (q1.contentXml.includes('data-hml-border-xml')) {
            const match = q1.contentXml.match(/data-hml-border-xml="([^"]+)"/);
            if (match) {
                const decoded = Buffer.from(match[1], 'base64').toString('utf-8');
                console.log("\nDecoded Border XML Fragment:");
                console.log(decoded);

                if (decoded.includes('Type="Dash"') && decoded.includes('Width="0.2mm"')) {
                    console.log("\n✅ Success: Border attributes (Dash, 0.2mm) are preserved in metadata.");
                } else {
                    console.log("\n❌ Failure: Border attributes were LOST during parsing.");
                    console.log("Found instead:", decoded);
                }
            }
        } else {
            console.log("\n❌ Failure: data-hml-border-xml attribute is missing.");
            console.log("Content XML length:", q1.contentXml.length);
        }
    }
} catch (e: any) {
    console.error("Error during test:", e.message);
}
