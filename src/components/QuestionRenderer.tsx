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
    /** External images from DB if available */
    externalImages?: any[];
    /** Callback for deleting a manual capture image */
    onDeleteCapture?: (imageId: string, imageUrl: string) => void;
    /** Whether to show question part or solution part */
    displayMode?: 'question' | 'solution';
    /** Custom class name for the container */
    className?: string;
}

const QuestionRenderer: React.FC<QuestionRendererProps> = ({
    xmlContent,
    showDownloadAction = true,
    fileName = 'question',
    externalImages = [],
    onDeleteCapture,
    displayMode = 'question',
    className = ''
}) => {
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

        // Merge with externalImages from Props (Support both Base64 and Storage Path)
        if (externalImages && externalImages.length > 0) {
            externalImages.forEach(img => {
                const binId = img.original_bin_id;
                let format = img.format || 'jpg';
                if (format === 'svg') format = 'svg+xml';

                if (binId && img.data && img.data !== '') {
                    if (img.data.startsWith('http')) {
                        // Support Direct URLs (Manual Captures)
                        imgMap.set(binId, img.data);
                    } else {
                        // PRIORITIZE EMBEDDED DATA (Base64) - IT IS BULLETPROOF
                        imgMap.set(binId, `data:image/${format};base64,${img.data}`);
                    }
                } else if (img.storage_path) {
                    imgMap.set(binId, img.storage_path);
                }
            });
        }

        // [FEATURE] Hide Endnotes (Answers)
        // Remove <ENDNOTE>...</ENDNOTE> blocks
        // HWPML uses <ENDNOTE> ... </ENDNOTE> or <hp:endNote> ... </hp:endNote>
        xml = xml.replace(/<(?:[a-zA-Z0-9]+:)?ENDNOTE\b[\s\S]*?<\/(?:[a-zA-Z0-9]+:)?ENDNOTE>/gi, '');

        return { cleanXml: xml, extractedImages: imgMap };
    }, [xmlContent]);

    // 2. Render Logic
    const renderedContent = useMemo(() => {
        // [STRATEGY] Filter Manual Captures by Display Mode
        const manualCaps = externalImages.filter(img => {
            if (displayMode === 'solution') {
                return img.original_bin_id?.startsWith('MANUAL_S_');
            } else {
                // Question mode: Show MANUAL_Q_ or legacy MANUAL_ (excluding S)
                return img.original_bin_id?.startsWith('MANUAL_Q_') ||
                    (img.original_bin_id?.startsWith('MANUAL_') && !img.original_bin_id?.startsWith('MANUAL_S_'));
            }
        });

        if (manualCaps.length > 0) {
            return (
                <div className="flex flex-col items-center gap-6 py-2 bg-white">
                    {manualCaps.map((img, i) => (
                        <div key={i} className="w-full flex flex-col items-center relative group/img">
                            <img
                                src={img.data}
                                alt={`${displayMode} capture`}
                                className={`w-full rounded-xl shadow-2xl border-2 border-white bg-white ${displayMode === 'solution' ? 'ring-4 ring-green-500/5' : 'ring-4 ring-blue-500/5'}`}
                                style={{ maxHeight: '1000px' }}
                            />
                            {onDeleteCapture && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (confirm(`이 ${displayMode === 'solution' ? '해설' : '문제'} 이미지를 삭제하시겠습니까?`)) {
                                            onDeleteCapture(img.id, img.data);
                                        }
                                    }}
                                    className="absolute top-4 right-4 bg-red-500 text-white p-2 rounded-full opacity-0 group-hover/img:opacity-100 transition-opacity shadow-lg hover:bg-red-600 z-10"
                                    title="이미지 삭제"
                                >
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                </button>
                            )}
                        </div>
                    ))}
                    <div className={`mt-4 w-full h-[1px] ${displayMode === 'solution' ? 'bg-green-50' : 'bg-blue-50'}`} />
                </div>
            );
        }

        // If in solution mode and no caps, show empty
        if (displayMode === 'solution') {
            return (
                <div className="py-12 bg-gray-50/50 rounded-xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center text-gray-400">
                    <span className="text-4xl mb-2">📒</span>
                    <p className="font-bold text-sm">등록된 해설 이미지가 없습니다.</p>
                    <p className="text-xs">우측의 [해설 캡쳐] 버튼을 사용해 등록해 주세요.</p>
                </div>
            );
        }

        if (!cleanXml) return <div className="text-gray-400">No content</div>;

        // V28: Prioritize Whole-Question High-Fidelity Capture (Legacy/Auto)
        if (extractedImages.has('WHOLE_QUESTION_V28')) {
            return (
                <div className="flex flex-col items-center py-2 bg-white">
                    <img
                        src={extractedImages.get('WHOLE_QUESTION_V28')}
                        alt="High Fidelity Question Capture"
                        className="w-full rounded shadow-md border"
                    />
                    <div className="mt-4 w-full h-[1px] bg-gray-100" />
                    {/* Removed Visual Engine label */}
                </div>
            );
        }

        try {
            const parser = new DOMParser();
            // Wrap to ensure validity
            const doc = parser.parseFromString(`<root>${cleanXml}</root>`, "text/xml");

            // We iterate ONLY root-level paragraphs to prevent redundant rendering of nested table content
            const root = doc.documentElement;
            const rootElements = Array.from(root.children).filter(el => {
                const name = el.nodeName.toUpperCase().replace('HP:', '');
                return ['P', 'TABLE', 'TABLE', 'PICTURE', 'EQUATION'].includes(name);
            });

            if (rootElements.length === 0 && root.childNodes.length > 0) {
                // If no recognized elements but has content, might be a single text run or weird structure
                // Fallback: render everything as a generic block
                rootElements.push(...Array.from(root.children));
            }

            if (rootElements.length === 0) {
                return (
                    <div className="text-gray-500 italic p-4 border border-dashed rounded text-center">
                        표시할 내용이 없습니다. (HML 구조 확인 필요)
                    </div>
                );
            }

            const elements = rootElements.map((el, idx) => {
                const name = el.nodeName.toUpperCase().replace('HP:', '');
                const nodes = Array.from(el.childNodes);
                const role = (el as Element).getAttribute('data-hml-style') || '';
                const align = (el as Element).getAttribute('data-hml-align');
                const isBox = role.startsWith('BOX_');

                let className = "mb-2 leading-relaxed text-gray-900 min-h-[1.5em] break-words";
                if (isBox) {
                    className += " border-2 border-slate-300 bg-slate-50 p-4 my-4 rounded-md shadow-inner font-medium text-slate-800";
                    if (role === 'BOX_BOGI') className += " bg-gray-50 border-gray-400";
                    if (role === 'BOX_JOKUN') className += " bg-blue-50/30 border-blue-200 dotted";
                }

                const style: React.CSSProperties = {};
                if (align) {
                    if (align === 'Center') style.textAlign = 'center';
                    else if (align === 'Right') style.textAlign = 'right';
                    else if (align === 'Justify') style.textAlign = 'justify';
                }

                // If it's a TABLE, handle it specially even if at root
                if (name === 'TABLE') {
                    return <TextRun key={idx} node={el} extractedImages={extractedImages} />;
                }

                return (
                    <div key={idx} className={className} style={style}>
                        {nodes.map((node, nIdx) => {
                            const nName = node.nodeName.toUpperCase().replace('HP:', '');
                            if (node.nodeType === 3 || nName === 'TEXT' || nName === 'RUN' || nName === 'T') {
                                return <TextRun key={nIdx} node={node} extractedImages={extractedImages} />;
                            }
                            return <TextRunInner key={nIdx} node={node} extractedImages={extractedImages} />;
                        })}
                    </div>
                );
            });

            return elements;

        } catch (e) {
            console.error("Render Error", e);
            return <div className="text-red-500">렌더링 중 오류가 발생했습니다.</div>;
        }
    }, [cleanXml, extractedImages, externalImages, onDeleteCapture, displayMode]);

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
                className={`bg-white p-2 border rounded shadow-sm max-w-full overflow-x-auto text-2xl font-medium ${className}`}
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

// Subcomponent to handle Text/Equation/Image nodes recursively
function TextRun({ node, extractedImages }: { node: ChildNode, extractedImages: Map<string, string> }) {
    const children = Array.from(node.childNodes);
    const elements: JSX.Element[] = [];

    const processChild = (child: ChildNode, i: number) => {
        const cName = child.nodeName.toUpperCase().replace('HP:', '');

        if (child.nodeType === 3) {
            let text = child.textContent || '';
            text = text.replace(/(수식|그림|표)입니다\.?\s*/g, '').replace(/\[(수식|그림|표)\]\s*/g, '');
            if (text) elements.push(<React.Fragment key={i}>{text}</React.Fragment>);
        }
        else if (cName === 'T' || cName === 'TEXT' || cName === 'CHAR') {
            let text = child.textContent || '';
            text = text.replace(/(수식|그림|표)입니다\.?\s*/g, '').replace(/\[(수식|그림|표)\]\s*/g, '');
            if (text) elements.push(<React.Fragment key={i}>{text}</React.Fragment>);
        }
        else if (cName === 'EQUATION') {
            elements.push(<EquationRenderer key={i} node={child as Element} extractedImages={extractedImages} />);
        }
        else if (cName === 'PICTURE' || cName === 'hp:pic') {
            const imageNode = Array.from((child as Element).getElementsByTagName('*'))
                .find(n => n.nodeName === 'IMAGE' || n.nodeName === 'hp:img' || n.nodeName === 'hp:binData');

            if (imageNode) {
                const binId = (imageNode as Element).getAttribute('BinItem') ||
                    (imageNode as Element).getAttribute('BinData') ||
                    (imageNode as Element).getAttribute('hp:binData') ||
                    imageNode.textContent;

                if (binId && extractedImages.has(binId)) {
                    elements.push(
                        <img
                            key={i}
                            src={extractedImages.get(binId)}
                            alt="Visual Content"
                            className="inline-block w-full my-2 rounded shadow-sm align-middle"
                        />
                    );
                }
            }
        }
        else if (cName === 'TABLE' || cName === 'hp:table') {
            const rows = Array.from((child as Element).getElementsByTagName('ROW').length > 0 ? (child as Element).getElementsByTagName('ROW') : (child as Element).getElementsByTagName('hp:tr'));
            if (rows.length === 0) {
                const allRows = Array.from((child as Element).getElementsByTagName('*')).filter(n => n.nodeName === 'ROW' || n.nodeName === 'hp:tr');
                rows.push(...(allRows as Element[]));
            }
            const width = (child as Element).getAttribute('Width') || 'auto';
            elements.push(
                <table key={i} className="border-collapse my-2" style={{ width: width !== 'auto' ? '100%' : 'auto' }}>
                    <tbody>
                        {rows.map((rowNode, rIdx) => {
                            const cells = Array.from((rowNode as Element).getElementsByTagName('CELL').length > 0 ? (rowNode as Element).getElementsByTagName('CELL') : (rowNode as Element).getElementsByTagName('hp:tc'));
                            return (
                                <tr key={rIdx}>
                                    {cells.map((cellNode, cIdx) => {
                                        const cell = cellNode as Element;
                                        const colSpan = parseInt(cell.getAttribute('ColSpan') || '1');
                                        const rowSpan = parseInt(cell.getAttribute('RowSpan') || '1');
                                        const cellStyle: React.CSSProperties = { border: '1px solid #94a3b8', padding: '4px', verticalAlign: 'top', minWidth: '20px' };

                                        const borderXmlBase64 = cell.getAttribute('data-hml-border-xml');
                                        if (borderXmlBase64) {
                                            try {
                                                const borderXml = atob(borderXmlBase64);
                                                const bp = new DOMParser();
                                                const bDoc = bp.parseFromString(borderXml, "text/xml");
                                                cellStyle.border = 'none';
                                                ['Top', 'Bottom', 'Left', 'Right'].forEach(side => {
                                                    const node = bDoc.getElementsByTagName(side.toUpperCase() + 'BORDER')[0];
                                                    if (node) {
                                                        const type = node.getAttribute('Type');
                                                        const widthStr = node.getAttribute('Width');
                                                        const colorNum = node.getAttribute('Color');
                                                        const mapping: any = { 'None': 'none', 'Solid': 'solid', 'Dot': 'dotted', 'Dash': 'dashed', 'Double': 'double' };
                                                        const style = mapping[type || 'Solid'] || 'solid';
                                                        let width = '1px';
                                                        if (widthStr && widthStr.includes('mm')) width = widthStr;
                                                        else if (widthStr) width = `${parseInt(widthStr) / 100}px`;
                                                        let color = '#94a3b8';
                                                        if (colorNum) {
                                                            const num = parseInt(colorNum);
                                                            color = `rgb(${num & 0xFF},${(num >> 8) & 0xFF},${(num >> 16) & 0xFF})`;
                                                        }
                                                        (cellStyle as any)[`border${side}`] = `${width} ${style} ${color}`;
                                                    }
                                                });
                                            } catch (e) { }
                                        }

                                        const pNodes = Array.from(cell.getElementsByTagName('P').length > 0 ? cell.getElementsByTagName('P') : cell.getElementsByTagName('hp:p'));
                                        return (
                                            <td key={cIdx} style={cellStyle} colSpan={colSpan} rowSpan={rowSpan}>
                                                {pNodes.map((p, pIdx) => (
                                                    <div key={pIdx} className="min-h-[1em]">
                                                        {Array.from(p.childNodes).map((node, nodeIdx) => (
                                                            <TextRunInner key={nodeIdx} node={node} extractedImages={extractedImages} />
                                                        ))}
                                                    </div>
                                                ))}
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
        else if (cName === 'hp:ctrl' || cName === 'RUN') {
            Array.from(child.childNodes).forEach((cc, cci) => processChild(cc, i * 100 + cci));
        }
    };

    children.forEach((child, i) => processChild(child, i));
    return <>{elements}</>;
};

/**
 * Unified Equation Renderer
 * Always prioritize SVG (MathJax Vector) if available via mathId.
 */
function EquationRenderer({ node, extractedImages }: { node: Element, extractedImages: Map<string, string> }) {
    const [renderError, setRenderError] = useState(false);
    const mathId = node.getAttribute('data-hml-math-id');
    const scriptNode = Array.from(node.childNodes).find(n => {
        const name = n.nodeName.toUpperCase().replace('HP:', '');
        return name === 'SCRIPT';
    });

    let script = (scriptNode?.textContent || node.textContent || '').trim();
    script = script.replace(/(수식|그림|표)입니다\.?\s*/g, '').replace(/\[(수식|그림|표)\]\s*/g, '').trim();

    if (!script) return null;
    const latex = convertHwpEqToLatex(script);

    // 1. Try pre-rendered SVG (PRIORITIZE data-uri over storage_path)
    if (mathId && extractedImages.has(mathId) && !renderError) {
        const src = extractedImages.get(mathId)!;
        return (
            <img
                src={src}
                alt="Equation"
                onError={() => {
                    console.warn(`SVG load failed for ${mathId}, falling back to KaTeX.`);
                    setRenderError(true);
                }}
                title={`수식 (V22): ${latex}\n원본: ${script}`}
                className="inline-block mx-0.5 align-middle max-h-[2.5em] w-auto h-auto scale-[1.25] origin-center"
                style={{ verticalAlign: '-0.25em' }}
            />
        );
    }

    // 2. Fallback to LaTeX (KaTeX) - High Reliability
    try {
        const html = katex.renderToString(latex, { throwOnError: true, displayMode: false });
        return (
            <span
                dangerouslySetInnerHTML={{ __html: html }}
                title={`수식 (KaTeX Fallback): ${latex}\n원본: ${script}`}
                className="inline-block mx-1 align-middle scale-[1.15] origin-center font-medium"
                style={{ verticalAlign: '-0.15em', fontWeight: 600 }}
            />
        );
    } catch (e) {
        console.error("Equation Render Fatal Error:", latex, e);
        return <code className="bg-red-50 text-red-500 border border-red-200 px-1 rounded">{latex}</code>;
    }
}

function TextRunInner({ node, extractedImages }: { node: ChildNode, extractedImages: Map<string, string> }) {
    const nName = node.nodeName.toUpperCase().replace('HP:', '');
    if (nName === 'TEXT' || nName === 'RUN' || nName === 'T' || nName === 'CHAR') {
        return <TextRun node={node} extractedImages={extractedImages} />;
    }
    if (nName === 'EQUATION') {
        return <EquationRenderer node={node as Element} extractedImages={extractedImages} />;
    }
    return null;
}

export default QuestionRenderer;

