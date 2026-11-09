import { requireThat } from './errors.js';
export function inspectMedia(data, mime, photo = false) {
  requireThat(Buffer.isBuffer(data) && data.length > 8 && data.length <= (photo ? 3 : 15) * 1024 * 1024, 'File must be under 3 MB for photos or 15 MB for slides.');
  const valid = mime === 'image/png' ? data.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
    : mime === 'image/jpeg' ? data[0] === 255 && data[1] === 216 && data[2] === 255
    : mime === 'image/webp' ? data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP'
    : !photo && mime === 'application/pdf' ? data.toString('ascii', 0, 5) === '%PDF-' : false;
  requireThat(valid, 'Use a valid JPEG, PNG, WebP image or PDF (slides only).');
}
