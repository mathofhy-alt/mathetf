'use client';

import React, { useMemo, useEffect, useState, useRef } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { convertHwpEqToLatex } from '@/lib/hwp-to-latex';
import html2canvas from 'html2canvas';

interface QuestionRendererProps {
    xmlContent: string;
    showDownloadAction?: boolean;
    fileName?: string;
}

export default function QuestionRenderer({ xmlContent, showDownloadAction = false, fileName = 'question' }: QuestionRendererProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [images, setImages] = useState<Map<string, string>>(new Map());

    // 1. Parse content and extract binaries
    const { cleanXml, extractedImages } = useMemo(() => {
        if (!xmlContent) return { cleanXml: '', extractedImages: new Map() };

        let xml = xmlContent;
        const imgMap = new Map<string, string>();

        // Extract Binary Metadata (Legacy Comment or New Processing Instruction)
        const stowawayMatch = xml.match(/<!-- ANTIGRAVITY_BINARIES: ([\s\S]*?) -->/);
        const piMatch = xml.match(/<\?antigravity-binaries data="([\s\S]*?)"\?>/);

        if (piMatch) {
            try {
                const decoded = Buffer.from(piMatch[1], 'base64').toString('utf-8');
                const binaries = JSON.parse(decoded);
                if (Array.isArray(binaries)) {
                    binaries.forEach((b: any) => {
                        const mime = b.type === 'jpg' ? 'jpeg' : b.type;
                        imgMap.set(b.id, `data:image/${mime};base64,${b.data}`);
                    });
                }
            } catch (e) {
                console.error("Failed to parse PI binaries", e);
            }
            xml = xml.replace(piMatch[0], '');
        } else if (stowawayMatch) {
            try {
                const binaries = JSON.parse(stowawayMatch[1]);
                if (Array.isArray(binaries)) {
                    binaries.forEach((b: any) => {
                        const mime = b.type === 'jpg' ? 'jpeg' : b.type;
                        imgMap.set(b.id, `data:image/${mime};base64,${b.data}`);
                    });
                }
            } catch (e) {
                console.error("Failed to parse Comment binaries", e);
            }
            xml = xml.replace(stowawayMatch[0], '');
        }

        // [FEATURE] Hide Endnotes (Answers)
        // Remove <ENDNOTE>...</ENDNOTE> blocks
        // HWPML uses <ENDNOTE> ... </ENDNOTE> or <hp:endNote> ... </hp:endNote>
        xml = xml.replace(/<(?:[a-zA-Z0-9]+:)?ENDNOTE\b[\s\S]*?<\/(?:[a-zA-Z0-9]+:)?ENDNOTE>/gi, '');

        return { cleanXml: xml, extractedImages: imgMap };
    }, [xmlContent]);

    // 2. Render Logic
    const renderedContent = useMemo(() => {
        if (!cleanXml) return <div className="text-gray-400">No content</div>;

        try {
            const parser = new DOMParser();
            // Wrap to ensure validity
            const doc = parser.parseFromString(`<root>${cleanXml}</root>`, "text/xml");

            // We iterate paragraphs (P)
            // Note: Select both standard P and HWP namespace P if present
            const paragraphs = Array.from(doc.getElementsByTagName("P")); // or hp:p
            if (paragraphs.length === 0) {
                // Try lowercase or 'hp:p'
                const p2 = Array.from(doc.getElementsByTagName("hp:p"));
                if (p2.length > 0) paragraphs.push(...p2);
            }

            return paragraphs.map((p, idx) => {
                const nodes = Array.from(p.childNodes);

                return (
                    <div key={idx} className="mb-2 leading-relaxed text-gray-900 min-h-[1.5em] break-words">
                        {nodes.map((node, nIdx) => {
                            if (node.nodeName === 'TEXT' || node.nodeName === 'hp:run') {
                                // Basic Text Run
                                return <TextRun key={nIdx} node={node} extractedImages={extractedImages} />;
                            }
                            return null;
                        })}
                    </div>
                );
            });

        } catch (e) {
            console.error("Render Error", e);
            return <div className="text-red-500">Rendering failed</div>;
        }
    }, [cleanXml, extractedImages]);

    const handleDownload = async () => {
        if (!containerRef.current) return;
        try {
            const canvas = await html2canvas(containerRef.current, {
                useCORS: true,
                scale: 2,
                backgroundColor: '#ffffff'
            } as any);
            const url = canvas.toDataURL('image/png');
            const a = document.createElement('a');
            a.href = url;
            a.download = `${fileName}.png`;
            a.click();
        } catch (e) {
            console.error("Capture failed", e);
            alert("이미지 저장 실패");
        }
    };

    return (
        <div className="relative group">
            <div
                ref={containerRef}
                className="bg-white p-6 border rounded shadow-sm max-w-full overflow-x-auto text-sm"
            >
                {renderedContent}
            </div>

            {showDownloadAction && (
                <button
                    onClick={handleDownload}
                    className="absolute top-2 right-2 bg-blue-600 text-white p-1.5 rounded opacity-0 group-hover:opacity-100 transition-opacity shadow-lg z-10"
                    title="이미지로 저장"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                </button>
            )}
        </div>
    );
}

// Subcomponent to handle Text/Equation/Image nodes recurisvely
function TextRun({ node, extractedImages }: { node: ChildNode, extractedImages: Map<string, string> }) {
    const children = Array.from(node.childNodes);
    const elements: JSX.Element[] = [];

    // HWPML often has CHAR > content
    // Or hp:run > hp:t / hp:equation

    // Helper to process a text/char node
    const processChild = (child: ChildNode, i: number) => {
        if (child.nodeType === 3) { // Text Node
            elements.push(<span key={i}>{child.textContent}</span>);
        }
        else if (child.nodeName === 'SECDEF' || child.nodeName === 'COLDEF') {
            // Ignore format defs
        }
        else if (child.nodeName === 'CHAR' || child.nodeName === 'hp:t') {
            elements.push(<span key={i}>{child.textContent}</span>);
        }
        else if (child.nodeName === 'EQUATION' || child.nodeName === 'hp:equation') {
            // Extract script
            let script = "";
            let scriptNode = Array.from(child.childNodes).find(n => n.nodeName === 'SCRIPT' || n.nodeName === 'hp:script');
            if (scriptNode) script = scriptNode.textContent || "";

            if (script) {
                const latex = convertHwpEqToLatex(script);
                try {
                    const html = katex.renderToString(latex, {
                        throwOnError: false,
                        displayMode: false
                    });
                    elements.push(
                        <span
                            key={i}
                            dangerouslySetInnerHTML={{ __html: html }}
                            className="inline-block mx-1 align-middle"
                        />
                    );
                } catch (e) {
                    elements.push(<code key={i} className="text-xs bg-red-50 text-red-500">{script}</code>);
                }
            }
        }
        else if (child.nodeName === 'BINDATA' || child.nodeName === 'hp:binData') {
            // Often images are referenced here? No, BINDATA is definition. 
            // Usage is usually <PICTURE>... <BinData>ID</BinData> ... </PICTURE>
        }
        else if (child.nodeName === 'TABLE' || child.nodeName === 'hp:table') {
            const el = child as Element;
            const rows = Array.from(el.getElementsByTagName('ROW').length > 0 ? el.getElementsByTagName('ROW') : el.getElementsByTagName('hp:tr'));

            if (rows.length === 0) {
                const allRows = Array.from(el.getElementsByTagName('*')).filter(n => n.nodeName === 'ROW' || n.nodeName === 'hp:tr');
                rows.push(...(allRows as Element[]));
            }

            elements.push(
                <table key={i} className="border-collapse border border-gray-400 my-4 w-full text-xs">
                    <tbody>
                        {rows.map((rowNode, rIdx) => {
                            const row = rowNode as Element;
                            const cells = Array.from(row.getElementsByTagName('CELL').length > 0 ? row.getElementsByTagName('CELL') : row.getElementsByTagName('hp:tc'));
                            return (
                                <tr key={rIdx}>
                                    {cells.map((cellNode, cIdx) => {
                                        const cell = cellNode as Element;
                                        const pNodes = Array.from(cell.getElementsByTagName('P').length > 0 ? cell.getElementsByTagName('P') : cell.getElementsByTagName('hp:p'));
                                        return (
                                            <td key={cIdx} className="border border-gray-400 p-1 min-w-[20px] align-top">
                                                {pNodes.map((pNode, pIdx) => {
                                                    const p = pNode as Element;
                                                    const pNodesList = Array.from(p.childNodes);
                                                    return (
                                                        <div key={pIdx} className="min-h-[1em]">
                                                            {pNodesList.map((node, nodeIdx) => (
                                                                <TextRunInner key={nodeIdx} node={node} extractedImages={extractedImages} />
                                                            ))}
                                                        </div>
                                                    );
                                                })}
                                            </td>
                                        );
                                    })}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            );
        }
        // HWPX Control characters
        else if (child.nodeName === 'hp:ctrl') {
            // Iterate children of ctrl
            Array.from(child.childNodes).forEach((cc, cci) => processChild(cc, i * 100 + cci));
        }
    };

    children.forEach((child, i) => processChild(child, i));

    return <>{elements}</>;
}

// Internal helper for text/math/image nodes within a run or cell
function TextRunInner({ node, extractedImages }: { node: ChildNode, extractedImages: Map<string, string> }) {
    if (node.nodeName === 'TEXT' || node.nodeName === 'hp:run') {
        return <TextRun node={node} extractedImages={extractedImages} />;
    }
    // Handle inline nodes like EQUATION if they appear directly
    if (node.nodeName === 'EQUATION' || node.nodeName === 'hp:equation') {
        let script = "";
        let scriptNode = Array.from(node.childNodes).find(n => n.nodeName === 'SCRIPT' || n.nodeName === 'hp:script');
        if (scriptNode) script = scriptNode.textContent || "";

        if (script) {
            const latex = convertHwpEqToLatex(script);
            try {
                const html = katex.renderToString(latex, { throwOnError: false, displayMode: false });
                return <span dangerouslySetInnerHTML={{ __html: html }} className="inline-block mx-1 align-middle" />;
            } catch (e) {
                return <code className="text-xs bg-red-50 text-red-500">{script}</code>;
            }
        }
    }
    return null;
}
