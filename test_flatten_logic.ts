
import { DOMParser, XMLSerializer } from 'xmldom';

function flattenEndnotes(xml: string): string {
    const endnoteRegex = /<ENDNOTE>([\s\S]*?)<\/ENDNOTE>/g;
    let match;
    let result = '';
    let lastIndex = 0;

    while ((match = endnoteRegex.exec(xml)) !== null) {
        result += xml.slice(lastIndex, match.index);
        let content = match[1];

        // Unwrap PARALIST
        if (content.includes('<PARALIST')) {
            try {
                const doc = new DOMParser().parseFromString(`<WRAP>${content}</WRAP>`, 'text/xml');
                const root = doc.documentElement;
                const paralist = root.getElementsByTagName('PARALIST')[0];

                if (paralist) {
                    const serializer = new XMLSerializer();
                    let innerXml = '';
                    for (let k = 0; k < paralist.childNodes.length; k++) {
                        const child = paralist.childNodes[k];
                        innerXml += serializer.serializeToString(child);
                    }
                    if (innerXml.trim().length > 0) {
                        content = innerXml;
                    }
                }
            } catch (e) {
                console.warn('Error parsing PARALIST', e);
            }
        }

        // Break out of current P > TEXT context
        // This assumes ENDNOTE is always inside <P><TEXT>... which is standard HWPML
        // We close TEXT and P, insert the content, then reopen P and TEXT.
        const breakoutString = `</TEXT></P>${content}<P><TEXT>`;
        result += breakoutString;

        lastIndex = endnoteRegex.lastIndex;
    }
    result += xml.slice(lastIndex);
    return result;
}

const sampleXml = `
<SECTION>
  <P>
    <TEXT>
      Here is some text.
      <ENDNOTE>
        <PARALIST>
          <P><TEXT>Hidden Note Content</TEXT></P>
        </PARALIST>
      </ENDNOTE>
      Continuing text.
    </TEXT>
  </P>
</SECTION>
`;

console.log("Original:");
console.log(sampleXml);
console.log("\nFlattened:");
console.log(flattenEndnotes(sampleXml));
