'use client';

import React, { useMemo } from 'react';

interface HwpxPreviewProps {
    xmlContent: string;
}

export default function HwpxPreview({ xmlContent }: HwpxPreviewProps) {
    const renderedContent = useMemo(() => {
        if (!xmlContent) return <div className="text-gray-400">No content</div>;

        // Simple Regex-based parser for Client Side Rendering
        // Note: A full XML parser might be heavy, but DOMParser is available in browser.

        try {
            const parser = new DOMParser();
            // Wrap in a root tag to ensure valid XML for partial fragments
            const xmlDoc = parser.parseFromString(`<root>${xmlContent}</root>`, "text/xml");

            const paragraphs = Array.from(xmlDoc.getElementsByTagName("hp:p"));

            return paragraphs.map((p, pIdx) => {
                const runs = Array.from(p.childNodes).filter(node => node.nodeName === 'hp:run');

                return (
                    <p key={pIdx} className="mb-2 leading-relaxed text-gray-800 min-h-[1em]">
                        {runs.map((run: any, rIdx) => {
                            // Extract text ONLY from direct children keys (hp:t, hp:equation)
                            // We explicitly avoid digging into hp:ctrl (which contains hp:endNote)
                            const children = Array.from(run.childNodes) as any[];
                            const elements = [];

                            for (let i = 0; i < children.length; i++) {
                                const node = children[i];
                                if (node.nodeName === 'hp:t') {
                                    elements.push(node.textContent);
                                } else if (node.nodeName === 'hp:equation') {
                                    const script = node.getElementsByTagName("hp:script")[0]?.textContent;
                                    if (script) {
                                        elements.push(
                                            <span key={`eq-${i}`} className="mx-1 inline-block bg-gray-100 border border-gray-300 rounded px-1 text-xs text-blue-700 font-mono align-middle">
                                                {script}
                                            </span>
                                        );
                                    }
                                }
                                // Ignore hp:ctrl (EndNotes/FootNotes/Tables) for the preview text flow
                            }

                            return <span key={rIdx}>{elements}</span>;
                        })}
                    </p>
                );
            });

        } catch (e) {
            console.error("Preview Render Error", e);
            return <div className="text-red-500">Error parsing XML content</div>;
        }
    }, [xmlContent]);

    return (
        <div className="h-full overflow-y-auto p-8 bg-white border rounded shadow-inner max-w-[21cm] mx-auto">
            {renderedContent}
        </div>
    );
}
