
const snippet = `<P Outer><P Inner>Inner Content</P>Middle<P Inner2>Inner2</P></P><P Q1>Question 1</P>`;
const realSnippet = `<P ParaShape="1" Style="0"><TEXT CharShape="0"><MASTERPAGE Type="Both"><PARALIST><P ParaShape="1" Style="0"><TEXT><CONNECTLINE></CONNECTLINE><CHAR/></TEXT></P></PARALIST></MASTERPAGE><CHAR/></TEXT></P><P><TEXT>Question 1</TEXT></P>`;

const pRegex = /<\/?(?:[a-zA-Z0-9]+:)?P\b[^>]*>/gi;
let match;
let depth = 0;

console.log("--- Testing Simple Snippet ---");
while ((match = pRegex.exec(snippet)) !== null) {
    const tag = match[0];
    const isClose = tag.startsWith('</');
    if (!isClose) depth++; else depth--;
    console.log(`Tag: ${tag} | Depth: ${depth}`);
    if (depth === 0) console.log(">> Block Closed");
}

console.log("\n--- Testing Real Snippet ---");
depth = 0;
pRegex.lastIndex = 0;
while ((match = pRegex.exec(realSnippet)) !== null) {
    const tag = match[0];
    const isClose = tag.startsWith('</');
    if (!isClose) depth++; else depth--;
    console.log(`Tag: ${tag} | Depth: ${depth}`);
    if (depth === 0) console.log(">> Block Closed at " + (match.index + match[0].length));
}
