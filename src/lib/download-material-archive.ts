// A single native form navigation downloads the archive without popups or blobs.
export function downloadMaterialArchive(files: { path: string; name: string }[]) {
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = '/api/admin/material-archive';
    form.hidden = true;
    const input = document.createElement('input');
    input.type = 'hidden'; input.name = 'files'; input.value = JSON.stringify(files);
    form.appendChild(input); document.body.appendChild(form);
    form.submit(); form.remove();
}
