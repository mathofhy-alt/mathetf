import { mathjax } from 'mathjax-full/js/mathjax.js';
import { TeX } from 'mathjax-full/js/input/tex.js';
import { SVG } from 'mathjax-full/js/output/svg.js';
import { liteAdaptor } from 'mathjax-full/js/adaptors/liteAdaptor.js';
import { RegisterHTMLHandler } from 'mathjax-full/js/handlers/html.js';
import { AllPackages } from 'mathjax-full/js/input/tex/AllPackages.js';

import { convertHwpEqToLatex } from './hwp-to-latex';

// Initialize MathJax with TeX input and SVG output
const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);

const tex = new TeX({ packages: AllPackages });
const svg = new SVG({ fontCache: 'local' });
const html = mathjax.document('', { InputJax: tex, OutputJax: svg });

/**
 * Renders an HWP math script to a PURE SVG string (server-side)
 * V28 Update: Prioritizes Python Native Rendering (100% fidelity) via local proxy.
 * Falls back to MathJax (V27) if proxy is unavailable.
 */
export async function renderMathToSvg(hwpScript: string): Promise<string> {
  try {
    // 1. Attempt Python Native Rendering (V28)
    try {
      const response = await fetch('http://127.0.0.1:5000/render-math', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ script: hwpScript.trim() }),
        // @ts-ignore - short timeout for failover
        next: { revalidate: 0 },
        signal: AbortSignal.timeout(120000)
      } as any);

      if (response.ok) {
        const data = await response.json();
        const base64Data = data.image || data.base64;
        if (data.success && base64Data) {
          return `<svg xmlns="http://www.w3.org/2000/svg" width="auto" height="auto" style="vertical-align: middle; max-width: 100%;">
            <image href="data:image/png;base64,${base64Data}" height="100%" width="100%" style="vertical-align: middle; object-fit: contain;"/>
          </svg>`;
        }
      } else {
        console.warn(`[MathProxy] HTTP Error: ${response.status} ${response.statusText}`);
      }
    } catch (proxyErr: any) {
      console.warn(`[MathProxy] Python renderer unavailable: ${proxyErr.message}, falling back to MathJax/LaTeX.`);
    }

    // 2. Fallback to MathJax (V27 RD Parser logic)
    const latex = convertHwpEqToLatex(hwpScript);
    if (!latex) return "";

    // Render to SVG node
    const node = html.convert(latex, {
      display: true,
      em: 16,
      ex: 8,
      containerWidth: 80 * 16
    });

    // Extract SVG string
    let svgStr = adaptor.innerHTML(node);

    // Optimization: Ensure responsive and clean
    // MathJax outputs <mjx-container>...<svg>...</mjx-container>
    // We just want the <svg>...
    const svgMatch = svgStr.match(/<svg[^>]*>([\s\S]*)<\/svg>/i);
    if (svgMatch) {
      svgStr = svgMatch[0];
      // Explicitly set dimensions if needed or keep responsive
      svgStr = svgStr.replace(/width="([^"]*)"/, 'width="auto" style="vertical-align: middle; max-width: 100%;"')
        .replace(/height="([^"]*)"/, 'height="auto"');
    }

    return svgStr;
  } catch (error) {
    console.error("[Math Render Error]:", error);
    return `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="30"><text y="20" fill="red">Render Error</text></svg>`;
  }
}

/**
 * Helper to upload math SVG (Legacy placeholder if needed)
 */
export async function uploadMathImage(supabase: any, svgString: string, path: string) {
  const { data, error } = await supabase.storage
    .from('question-math')
    .upload(path, svgString, {
      contentType: 'image/svg+xml',
      upsert: true
    });

  if (error) throw error;
  return data.path;
}
