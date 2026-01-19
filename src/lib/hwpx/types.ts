export interface HwpxFragment {
    index: number;
    xml: string;
    assets: HwpxAsset[];
    styles: HwpxStyleData;
    manifestItems: { [id: string]: string }; // id -> <opf:item ...> XML string
}

export interface HwpxAsset {
    id: string; // binaryItemIDRef (e.g. "image1")
    path: string; // "BinData/image1.jpg"
    dataBase64: string;
    extension: string; // ".jpg"
}

export interface HwpxStyleData {
    [key: string]: { [id: string]: string };
}

export interface ParseResult {
    fragments: HwpxFragment[];
    logs: string[];
}
