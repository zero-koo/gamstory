import { describe, it, expect } from 'vitest';
import { processImage, sniffMime } from './photo-processor';
// piexifjs ships as CJS with no .d.ts shipped.
// @ts-expect-error — piexifjs has no type definitions
import piexif from 'piexifjs';
import exifr from 'exifr';

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  const matches = hex.match(/.{2}/g)!;
  const out = new Uint8Array(new ArrayBuffer(matches.length));
  for (let i = 0; i < matches.length; i++) out[i] = parseInt(matches[i]!, 16);
  return out;
}

function makeTinyJpegBytes(): Uint8Array<ArrayBuffer> {
  // Minimal 1×1 JPEG (hex literal sourced from the JFIF spec).
  const hex =
    'ffd8ffe000104a46494600010101006000600000ffdb004300080606070605' +
    '08070706090908' +
    '0a0c140d0c0b0b0c1912130f141d1a1f1e1d1a1c1c2024362c20272a2c2b' +
    '2c2c1d2f31302e3134333133' +
    'ffdb0043010c0c0c111111171818175b272a275b51474751' +
    '5151515151515151515151515151515151515151' +
    '5151515151515151515151515151515151515151515151515151' +
    'ffc00011080001000103012200021101031101ffc4001f0000010501010101010100000000' +
    '0000000001020304050607080910111213141516171819' +
    'ffc400b5100002010303020403050504040000017d010203041105122131410613516107' +
    '227114328191a1082342b1c11552d1f02433627282090a161718191a25262728292a3435' +
    '363738393a434445464748494a535455565758595a636465666768696a737475767778' +
    '797a838485868788898a92939495969798999aa2a3a4a5a6a7a8a9aab2b3b4b5b6b7b8' +
    'b9bac2c3c4c5c6c7c8c9cad2d3d4d5d6d7d8d9dae1e2e3e4e5e6e7e8e9eaf1f2f3f4f5' +
    'f6f7f8f9faffda000c03010002110311003f00fbd3ffd9';
  return hexToBytes(hex);
}

function withGps(jpegBytes: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> {
  // piexifjs operates on binary strings, not Uint8Array.
  const binary = Array.from(jpegBytes).map((b) => String.fromCharCode(b)).join('');
  const exifObj = {
    '0th': {},
    Exif: {},
    GPS: {
      [piexif.GPSIFD.GPSLatitudeRef]: 'N',
      [piexif.GPSIFD.GPSLatitude]: [[37, 1], [33, 1], [0, 1]], // ~Seoul
      [piexif.GPSIFD.GPSLongitudeRef]: 'E',
      [piexif.GPSIFD.GPSLongitude]: [[126, 1], [58, 1], [0, 1]],
    },
    Interop: {},
    '1st': {},
    thumbnail: null,
  };
  const exifBytes = piexif.dump(exifObj);
  const newBinary: string = piexif.insert(exifBytes, binary);
  const out = new Uint8Array(new ArrayBuffer(newBinary.length));
  for (let i = 0; i < newBinary.length; i++) out[i] = newBinary.charCodeAt(i) & 0xff;
  return out;
}

describe('sniffMime', () => {
  it('detects JPEG magic bytes', async () => {
    const bytes = makeTinyJpegBytes();
    const blob = new Blob([bytes], { type: 'application/octet-stream' });
    expect(await sniffMime(blob)).toBe('image/jpeg');
  });

  it('detects PNG magic bytes', async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    const blob = new Blob([png]);
    expect(await sniffMime(blob)).toBe('image/png');
  });

  it('detects WebP magic bytes', async () => {
    const webp = new Uint8Array(16);
    webp.set([0x52, 0x49, 0x46, 0x46], 0);
    webp.set([0x57, 0x45, 0x42, 0x50], 8);
    expect(await sniffMime(new Blob([webp]))).toBe('image/webp');
  });

  it('rejects HEIC (sentinel "ftypheic") with a specific error', async () => {
    const heic = new Uint8Array(32);
    heic.set([0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63], 0);
    await expect(sniffMime(new Blob([heic]))).rejects.toThrow(/heic/i);
  });

  it('returns null for unknown bytes', async () => {
    expect(await sniffMime(new Blob([new Uint8Array([1, 2, 3, 4])]))).toBeNull();
  });
});

// Probe whether the active test environment actually supports the canvas
// pipeline `processImage` relies on. Happy-DOM ships `OffscreenCanvas` and
// `createImageBitmap` as globals BUT:
//   - createImageBitmap throws TypeError for Blob inputs (only DOM elements accepted)
//   - OffscreenCanvas.getContext('2d') returns null without a canvasAdapter
// So we probe the actual behaviour, not just `typeof`.
async function canRunCanvasPipeline(): Promise<boolean> {
  if (typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap === 'undefined') {
    return false;
  }
  try {
    const c = new OffscreenCanvas(1, 1);
    if (!c.getContext('2d')) return false;
    const tinyBlob = new Blob([makeTinyJpegBytes()], { type: 'image/jpeg' });
    await createImageBitmap(tinyBlob);
    return true;
  } catch {
    return false;
  }
}

const canvasPipelineAvailable = await canRunCanvasPipeline();

describe('processImage — GPS stripping', () => {
  // TODO(env): happy-dom v20 does not support `createImageBitmap(Blob)` nor
  // `OffscreenCanvas.getContext('2d')` (returns null without a registered
  // canvasAdapter). This skip is environment-driven, not behavioural — when
  // running this suite in a real browser via Storybook test-runner or
  // Playwright, the assertion below must pass. The Plan 2 spec authorises
  // gating with a runtime probe (Task 4 Step 6). Re-evaluate when migrating
  // unit tests to jsdom+canvas or moving image-pipeline tests to Playwright.
  it.skipIf(!canvasPipelineAvailable)(
    'removes GPS tags from a JPEG that had them',
    async () => {
      const bytes = withGps(makeTinyJpegBytes());

      // sanity: GPS is present in the input
      const before = (await exifr.gps(new Blob([bytes]))) as { latitude?: number } | undefined;
      expect(before?.latitude).toBeCloseTo(37.55, 1);

      const processed = await processImage(new Blob([bytes], { type: 'image/jpeg' }), {
        maxDimension: 16,
      });

      // GPS must be gone in the output
      const after = await exifr.gps(processed.blob);
      expect(after).toBeFalsy();
      expect(processed.mimeType).toBe('image/jpeg');
      expect(processed.width).toBeGreaterThan(0);
      expect(processed.height).toBeGreaterThan(0);
    },
  );
});
