
/**
 * Simple Image Utils to get dimensions from Buffer without external dependencies.
 * Supports PNG and JPG.
 */

export function getImageDimensions(buffer: Buffer): { width: number; height: number; type: string } | null {
    if (!buffer || buffer.length < 24) return null;

    // PNG
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
        // IHDR chunk starts at byte 8
        // Width at byte 16 (4 bytes, big endian)
        // Height at byte 20 (4 bytes, big endian)
        const width = buffer.readUInt32BE(16);
        const height = buffer.readUInt32BE(20);
        return { width, height, type: 'png' };
    }

    // JPG (SOF0/SOF2 segments)
    if (buffer[0] === 0xFF && buffer[1] === 0xD8) {
        let i = 2;
        while (i < buffer.length) {
            // Find next marker
            while (i < buffer.length && buffer[i] !== 0xFF) i++;
            while (i < buffer.length && buffer[i] === 0xFF) i++;

            if (i >= buffer.length) break;

            const marker = buffer[i];
            i++;

            // Length of segment
            if (i + 2 > buffer.length) break;
            const length = buffer.readUInt16BE(i);

            // Start of Frame markers (Baseline or Progressive)
            // SOF0 = C0, SOF2 = C2
            if (marker === 0xC0 || marker === 0xC2) {
                if (i + 1 + 2 + 2 > buffer.length) break;
                // Structure: Precision (1), Height (2), Width (2)
                const height = buffer.readUInt16BE(i + 1);
                const width = buffer.readUInt16BE(i + 3);
                return { width, height, type: 'jpg' };
            }

            i += length;
        }
    }

    return null;
}
