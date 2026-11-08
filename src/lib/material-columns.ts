// Public metadata only. file_path and raw-report description are server-only.
export const MATERIAL_COLUMNS = 'id,title,school,exam_year,grade,semester,exam_type,subject,file_type,content_type,price,created_at,region,district,uploader_name';

// A real page navigation lets in-app browsers and iOS handle attachments natively.
export function navigateMaterialDownload(itemId: string): void {
    window.location.assign(`/api/download?item=${encodeURIComponent(itemId)}`);
}
