
const sampleXml = `<P data-hml-style="QUESTION" Style="1"><TEXT><ENDNOTE><PARALIST LineWrap="Break" LinkListID="0"><P data-hml-orig-style="Box"><TEXT>Hidden Content</TEXT></P></PARALIST></ENDNOTE></TEXT><TEXT><CHAR>Main Text</CHAR></TEXT></P>`;

function flattenEndnotes(xml: string): string {
    if (!xml.includes('<ENDNOTE>')) return xml;

    // Regex to capture ENDNOTE content and the surrounding Text/P structure
    // We assume ENDNOTE is inside TEXT inside P. 
    // This is a naive regex, but might work for the specific structure observed.

    // Strategy: Find ENDNOTE block. Extract its PARALIST content (the Ps).
    // Remove the ENDNOTE block.
    // Prepend extracted Ps to the string? 
    // Be careful about <P> boundaries.

    let newXml = xml;

    // Pattern: <ENDNOTE> ... <PARALIST ...> (content) </PARALIST> ... </ENDNOTE>
    const endnoteRegex = /<ENDNOTE[^>]*>[\s\S]*?<PARALIST[^>]*>([\s\S]*?)<\/PARALIST>[\s\S]*?<\/ENDNOTE>/g;

    const matches = [...newXml.matchAll(endnoteRegex)];

    // We need to construct the new string. 
    // Simply replacing ENDNOTE with content is invalid: <P><TEXT><P>...</P></TEXT></P> is bad.
    // We must move the inner content OUT of the parent P.

    if (matches.length > 0) {
        console.log(`Found ${matches.length} endnotes.`);

        // This is tricky because we need to break the parent P.
        // If contentXml is just ONE <P>...</P> block?
        // Yes, usually questions are one P or a list of Ps.

        // If we find an Endnote, we extract it.
        for (const match of matches) {
            const endnoteFull = match[0];
            const endnoteContent = match[1]; // The P tags inside

            console.log("Endnote Content Extracted:", endnoteContent.substring(0, 50) + "...");

            // Remove the Endnote from the original location
            newXml = newXml.replace(endnoteFull, '');

            // Now, where to put endnoteContent? 
            // It MUST be a sibling of the parent P.
            // But we don't easily know where the parent P starts/ends in a simple string replace.

            // Hacky but effective for "Prepending":
            // Just put it at the very beginning of the string.
            // The result will be: <P>Hidden</P> ... <P>Main</P>
            // This works because the generator injects the whole string into {{CONTENT}}.
            // {{CONTENT}} expects valid HML nodes (Ps).

            newXml = endnoteContent + newXml;
        }
    }

    return newXml;
}

console.log("Original:", sampleXml);
const flattened = flattenEndnotes(sampleXml);
console.log("\nFlattened:", flattened);
