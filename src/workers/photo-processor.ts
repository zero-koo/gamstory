export type SupportedMime = 'image/jpeg' | 'image/png' | 'image/webp';

const MAGIC: Array<{ mime: SupportedMime; prefix: number[] }> = [
  { mime: 'image/jpeg', prefix: [0xff, 0xd8, 0xff] },
  { mime: 'image/png', prefix: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
];

function startsWith(buf: Uint8Array, prefix: number[]): boolean {
  if (buf.length < prefix.length) return false;
  for (let i = 0; i < prefix.length; i++) if (buf[i] !== prefix[i]) return false;
  return true;
}

function isWebP(buf: Uint8Array): boolean {
  return (
    buf.length >= 12 &&
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50
  );
}

function isHeic(buf: Uint8Array): boolean {
  if (buf.length < 12) return false;
  // ISO-BMFF: bytes 4-7 = "ftyp", brand starts at byte 8.
  if (buf[4] !== 0x66 || buf[5] !== 0x74 || buf[6] !== 0x79 || buf[7] !== 0x70) return false;
  const brand = String.fromCharCode(buf[8] ?? 0, buf[9] ?? 0, buf[10] ?? 0, buf[11] ?? 0);
  return brand === 'heic' || brand === 'heif' || brand === 'heix' || brand === 'mif1';
}

export async function sniffMime(blob: Blob): Promise<SupportedMime | null> {
  const head = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
  if (isHeic(head)) {
    throw new Error('HEIC images are not supported yet. Please use JPEG, PNG, or WebP.');
  }
  for (const { mime, prefix } of MAGIC) {
    if (startsWith(head, prefix)) return mime;
  }
  if (isWebP(head)) return 'image/webp';
  return null;
}

export interface ProcessImageOptions {
  /** Longest edge in pixels for the re-encoded copy. */
  maxDimension?: number;
  /** JPEG quality 0..1. */
  quality?: number;
}

export interface ProcessImageResult {
  blob: Blob;
  mimeType: SupportedMime;
  width: number;
  height: number;
  byteSize: number;
}

/**
 * Decode the blob via createImageBitmap (which discards all EXIF), re-draw
 * onto an OffscreenCanvas at most `maxDimension` px on the long edge, then
 * re-encode. The output has no EXIF, no GPS, no orientation tag — just pixels.
 */
export async function processImage(
  blob: Blob,
  opts: ProcessImageOptions = {},
): Promise<ProcessImageResult> {
  const detectedMime = await sniffMime(blob);
  if (!detectedMime) throw new Error('Unsupported image format');

  // createImageBitmap honours JPEG's stored orientation in browsers that support
  // it (Chrome/Safari); imageOrientation: 'from-image' makes it consistent.
  const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
  const maxDim = opts.maxDimension ?? 1600;
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('OffscreenCanvas 2d context unavailable');
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  // Always re-encode to image/jpeg unless input was PNG (lossless preservation).
  const outMime: SupportedMime = detectedMime === 'image/png' ? 'image/png' : 'image/jpeg';
  const outBlob = await canvas.convertToBlob({
    type: outMime,
    quality: outMime === 'image/jpeg' ? (opts.quality ?? 0.85) : undefined,
  });

  return { blob: outBlob, mimeType: outMime, width: w, height: h, byteSize: outBlob.size };
}
