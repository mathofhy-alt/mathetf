/**
 * HML Body Builder (Style Injection Ready)
 */

import * as fs from 'fs';
import * as path from 'path';

const LOG_FILE = path.join(process.cwd(), 'server_debug.log');

const logToFile = (msg: string) => {
  try {
    const timestamp = new Date().toISOString();
    fs.appendFileSync(LOG_FILE, `[${timestamp}] ${msg}\n`);
  } catch (e) {
    // console.error('Log failed', e);
  }
};



export interface Question {
  question_number: number;
  content_xml: string;
  binaries?: {
    id: string;
    data: string;
    type: string;
    binType?: string;
    compress: string;
  }[];
}

export interface BinDataItem {
  id: number;
  size: number;
  data: string;
  type: string;
  binType: string;
  compress: string;
}

export interface StyleItem {
  type: string;
  id: string;
  xml: string;
}

export interface BuildBodyResult {
  combinedBodyPs: string;
  bodyFragments: string[];
  binDataItems: BinDataItem[];
  styleItems: StyleItem[];
}

export const buildBody = (questions: Question[], startBinDataId: number = 0): BuildBodyResult => {
  let combinedBodyPs = "";
  const bodyFragments: string[] = [];
  const globalBinItems: BinDataItem[] = [];
  const globalStyleItems: StyleItem[] = [];

  let nextBinDataId = startBinDataId + 1;

  const fromB64Json = <T = any>(b64: string): T => JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));

  questions.forEach((q) => {
    let xml = q.content_xml;
    if (!xml || xml.trim().length === 0) return;

    // 1. Metadata Extraction (PI Priority)

    // A. Binaries
    let binDataRaw: any[] = [];
    const binPi = xml.match(/<\?ANTIGRAVITY_BINARIES_B64\s+([\s\S]*?)\?>/i);
    if (binPi && binPi[1]) {
      try { binDataRaw = fromB64Json<any[]>(binPi[1].trim()); } catch (e) { }
    }
    if (Array.isArray(binDataRaw) && binDataRaw.length > 0) {
      q.binaries = [...(q.binaries || []), ...binDataRaw];
    }

    // B. Styles
    let stylesRaw: StyleItem[] = [];
    const stylePi = xml.match(/<\?ANTIGRAVITY_STYLES_B64\s+([\s\S]*?)\?>/i);
    if (stylePi && stylePi[1]) {
      try { stylesRaw = fromB64Json<StyleItem[]>(stylePi[1].trim()); } catch (e) { }
    }
    if (Array.isArray(stylesRaw)) {
      globalStyleItems.push(...stylesRaw);
    }

    // Cleanup PIs
    xml = xml.replace(/<\?ANTIGRAVITY_BINARIES_B64[\s\S]*?\?>/gi, '');
    xml = xml.replace(/<\?ANTIGRAVITY_STYLES_B64[\s\S]*?\?>/gi, '');
    xml = xml.replace(/<!--[\s\S]*?-->/gi, ''); // Cleanup legacy comments

    // 2. Image Mapping
    const localBinMap = new Map<string, string>();
    if (q.binaries && q.binaries.length > 0) {
      q.binaries.forEach(bin => {
        const oldId = bin.id;
        const newId = String(nextBinDataId++);
        localBinMap.set(oldId, newId);
        const cleanData = bin.data.replace(/\s/g, '');
        globalBinItems.push({
          id: parseInt(newId, 10),
          size: cleanData.length,
          data: cleanData,
          type: (bin.type || "png").toLowerCase() === "jpeg" ? "jpg" : (bin.type || "png").toLowerCase(),
          binType: bin.binType || "Embedding",
          compress: bin.compress || "false"
        });
      });
    }

    // 3. Sanitization
    xml = xml.replace(/<SECDEF[\s\S]*?<\/SECDEF>/gi, '').replace(/<SECDEF[^>]*?\/>/gi, '')
      .replace(/<COLDEF[\s\S]*?<\/COLDEF>/gi, '').replace(/<COLDEF[^>]*?\/>/gi, '')
      .replace(/<P[^>]*><TEXT[^>]*><\/TEXT><\/P>/gi, '')
      .replace(/<\/?HWPML[^>]*>/gi, '')
      .replace(/<HEAD[^>]*>[\s\S]*?<\/HEAD>/gi, '')
      .replace(/<BODY[^>]*>/gi, '').replace(/<\/BODY>/gi, '')
      .replace(/<BODYTEXT[^>]*>/gi, '').replace(/<\/BODYTEXT>/gi, '')
      .replace(/<SECTION[^>]*>/gi, '').replace(/<\/SECTION>/gi, '')
      .replace(/<BINDATALIST[^>]*>[\s\S]*?<\/BINDATALIST>/gi, '')
      .replace(/<BINDATASTORAGE[^>]*>[\s\S]*?<\/BINDATASTORAGE>/gi, '')
      .replace(/<HEADER[\s\S]*?<\/HEADER>/gi, '').replace(/<FOOTER[\s\S]*?<\/FOOTER>/gi, '')
      .replace(/<PAGEBORDERFILL[\s\S]*?<\/PAGEBORDERFILL>/gi, '').replace(/<PAGEBORDERFILL[^>]*?\/>/gi, '')
      .replace(/<PRESENTATION[\s\S]*?<\/PRESENTATION>/gi, '');

    xml = xml.replace(/ (TreatAsChar)="false"/gi, ' $1="true"');

    // 4. Picture Wrapping (Safety Net for bare PICTURE tags)
    // If we find a <PICTURE> that is NOT inside a <SHAPEOBJECT>, we wrap it.
    // This regex looks for PICTURE tags. We assume if it's already wrapped, the upstream logic handled it.
    // However, to be safe and simple: We'll regex replace bare <PICTURE> tags that look "simple".
    // A robust way: Replace all <PICTURE ...> with a full SHAPE block if it doesn't look like it's inside one? 
    // Actually, the easiest way for "re-assembly" where we controlled the input is assuming the input XML *might* miss it.

    // Strategy: Find <PICTURE> tags. If they don't have a parent SHAPEOBJECT nearby (heuristic), wrap them.
    // BUT regex lookbehind is limited. 
    // BETTER STRATEGY: We just enforce the wrapper for *every* PICTURE tag found in the fragments we control at this stage?
    // No, that might double-wrap.
    // REFINED STRATEGY: Match <PICTURE> and check if it's "safe".
    // Let's assume for this fix that *ALL* inputs currently failing are missing the wrapper.
    // We will generate a random InstId.

    // FIX: Repair broken "Split" SHAPEOBJECT/IMAGE structures (Common in some HWPX conversions)
    // Pattern: <SHAPEOBJECT ...>...</SHAPEOBJECT> ... <IMAGE .../>
    // We convert this to a bare <PICTURE> so the logic below can wrap it cleanly.
    xml = xml.replace(/<SHAPEOBJECT[^>]*?>[\s\S]*?<\/SHAPEOBJECT>[\s\S]*?<IMAGE\b([^>]*?)\/?>/gi, (match, attrs) => {
      // Only proceed if it looks like a broken figure (check for BinData or BinItem)
      if (/Bin(Data|Item)/i.test(attrs)) {
        return `<PICTURE ${attrs} />`;
      }
      return match; // Keep if not binary image
    });

    // Also handle bare <IMAGE> tags that might not have the ghost SHAPEOBJECT
    xml = xml.replace(/<IMAGE\b([^>]*?)\/?>/gi, (match, attrs) => {
      if (/Bin(Data|Item)/i.test(attrs)) {
        return `<PICTURE ${attrs} />`;
      }
      return match;
    });

    xml = xml.replace(/<PICTURE([^>]*?)\/?>/gi, (match, attrs) => {
      // Generate unique IDs
      const instId = Math.floor(Math.random() * 1000000000);

      // Explicitly handle BinData linking here to avoid regex fragility later
      logToFile(`[DEBUG] Wrapper processing attrs: [${attrs}]`);
      const binMatch = attrs.match(/(?:hp:|)(?:BinData|BinItem)="([^"]+)"/i);
      const oldId = binMatch ? binMatch[1] : "";
      let finalBinAttr = "";

      if (oldId) {
        // Remove old attribute to prevent conflicts
        attrs = attrs.replace(new RegExp(`(?:hp:|)(?:BinData|BinItem)="${oldId}"`, 'gi'), '');

        const newId = localBinMap.get(oldId);
        if (newId) {
          finalBinAttr = ` BinItem="${newId}"`;
          logToFile(`[DEBUG] Wrapper injected BinItem="${newId}" for OldId="${oldId}"`);
        } else {
          finalBinAttr = ` BinItem="${oldId}"`; // Fallback
          logToFile(`[DEBUG] Wrapper preserved BinItem="${oldId}" (No remap found)`);
        }
      }

      // Safely merge defaults & Sanitize
      const defaults: Record<string, string> = {
        BorderColor: "0",
        BorderStyle: "Solid",
        BorderWidth: "0",
        Bright: "0",
        Contrast: "0",
        Effect: "RealPic",
        Flip: "None",
        InsideMargin: "0"
      };

      const validKeys = new Set([
        'BinItem', 'Reverse',
        ...Object.keys(defaults)
      ]);

      // 1. Remove garbage attributes (Alpha, etc.)
      const attrRegex = /([a-zA-Z:]+)\s*=\s*"([^"]*)"/g;
      let cleanAttrs = "";
      let m;
      while ((m = attrRegex.exec(attrs)) !== null) {
        const key = m[1];
        const val = m[2];
        // Standardize key check (ignore casing issues for whitelist)
        // But Hancom is PascalCase usually.
        const cleanKey = Array.from(validKeys).find(k => k.toLowerCase() === key.toLowerCase()) || key;

        if (validKeys.has(cleanKey)) {
          cleanAttrs += ` ${cleanKey}="${val}"`;
        } else {
          logToFile(`[DEBUG] Stripped invalid PICTURE attribute: ${key}="${val}"`);
        }
      }

      // 2. Inject BinItem if we computed it (priority)
      if (finalBinAttr) {
        if (!/BinItem=/i.test(cleanAttrs)) {
          cleanAttrs = finalBinAttr + cleanAttrs;
        }
      }

      // 3. Merge defaults
      for (const [key, val] of Object.entries(defaults)) {
        if (!new RegExp(`${key}=`, 'i').test(cleanAttrs)) {
          cleanAttrs += ` ${key}="${val}"`;
        }
      }

      return `<SHAPEOBJECT InstId="${instId}" Lock="false" NumberingType="Figure" TextWrap="TopAndBottom" ZOrder="0">` +
        `<SIZE Height="2976" HeightRelTo="Absolute" Protect="false" Width="3968" WidthRelTo="Absolute" />` +
        `<POSITION AffectLSpacing="false" AllowOverlap="true" FlowWithText="true" HoldAnchorAndSO="false" HorzAlign="Left" HorzOffset="0" HorzRelTo="Column" TreatAsChar="true" VertAlign="Top" VertOffset="0" VertRelTo="Para" />` +
        `<OUTSIDEMARGIN Bottom="0" Left="0" Right="0" Top="0" />` +
        `<SHAPECOMMENT />` +
        `<PICTURE${cleanAttrs} />` +
        `</SHAPEOBJECT>`;
    });

    // DEBUG: Log localBinMap
    const mapEntries = Array.from(localBinMap.entries());
    if (mapEntries.length > 0) {
      logToFile(`[DEBUG] Q${q.question_number} localBinMap: ${JSON.stringify(mapEntries)}`);
    }

    // Style and BinData Remapping (Style remapping handles IDs, BinData handles binary links)
    xml = xml.replace(/(\s+)(ParaShape|CharShape|Style|BorderFill|hp:ParaShape|hp:CharShape|hp:Style|hp:BorderFill|BinItem|BinData|hp:BinData|hp:BinItem|hp:binData|hp:bindata)="([^"]+)"/gi, (match, space, attrName, oldId) => {
      const newId = localBinMap.get(oldId);
      if (attrName.toLowerCase().includes('bin') && newId) {
        logToFile(`[DEBUG] Remapping BinData: ${oldId} -> ${newId} (Attr: ${attrName})`);
      }
      return newId ? `${space}${attrName}="${newId}"` : match;
    });

    if (xml.includes('<PICTURE')) {
      const picSnippet = xml.match(/<PICTURE[^>]*>/);
      logToFile(`[DEBUG] Final PICTURE Tag: ${picSnippet ? picSnippet[0] : 'Not Found'}`);
    }

    combinedBodyPs += xml + "\n";
    bodyFragments.push(xml);
  });

  // DEBUG: Check globalBinItems count
  // DEBUG: Check globalBinItems count
  logToFile(`[DEBUG] buildBody globalBinItems count: ${globalBinItems.length}`);
  if (globalBinItems.length > 0) {
    logToFile(`[DEBUG] First bin item ID: ${globalBinItems[0].id} Size: ${globalBinItems[0].size}`);
  }


  return {
    combinedBodyPs,
    bodyFragments,
    binDataItems: globalBinItems,
    styleItems: globalStyleItems
  };
};
