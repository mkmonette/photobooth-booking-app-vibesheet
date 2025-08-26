export async function fileToBase64(file: File): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => {
      reader.abort();
      reject(new Error('Failed to read file.'));
    };
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === 'string') {
        resolve(result);
      } else {
        reject(new Error('Unexpected FileReader result type.'));
      }
    };
    reader.readAsDataURL(file);
  });
}

export function estimateBase64Size(base64: string): number {
  const dataPart = base64.split(',').pop() ?? '';
  if (!dataPart) return 0;
  // Remove whitespace/newlines
  const cleaned = dataPart.replace(/\s+/g, '');
  if (cleaned.length === 0) return 0;
  // Count padding characters (0-2)
  const paddingMatch = cleaned.match(/=+$/);
  const padding = paddingMatch ? paddingMatch[0].length : 0;
  // Calculate bytes: floor((len * 3) / 4) - padding
  const bytes = Math.floor((cleaned.length * 3) / 4) - padding;
  return Math.max(0, bytes);
}

function getMimeTypeFromDataUrl(dataUrl: string): string | null {
  // Accept data:<mime>[;charset=...][;base64],...
  // Capture the mime type if present
  const match = dataUrl.match(/^data:([^;,]+)(?:[;][^,]*)?,/i);
  return match ? match[1].toLowerCase() : null;
}

function loadImageFromDataUrl(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // Data URLs are same-origin; anonymous helps ensure canvas isn't tainted in other cases.
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image.'));
    img.src = dataUrl;
  });
}

function isOffscreenCanvasAvailable(): boolean {
  return typeof OffscreenCanvas !== 'undefined' && typeof OffscreenCanvas === 'function';
}

function createCanvasElement(width: number, height: number): {
  canvas: HTMLCanvasElement | OffscreenCanvas;
  isOffscreen: boolean;
} {
  if (isOffscreenCanvasAvailable()) {
    try {
      const off = new OffscreenCanvas(width, height);
      // ensure width/height are set
      off.width = width;
      off.height = height;
      return { canvas: off, isOffscreen: true };
    } catch {
      // fall back to HTML canvas
    }
  }
  const el = document.createElement('canvas');
  el.width = width;
  el.height = height;
  return { canvas: el, isOffscreen: false };
}

async function canvasToDataUrl(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  mime: string,
  quality?: number
): Promise<string> {
  // Prefer toDataURL on HTMLCanvasElement
  if ('toDataURL' in canvas && typeof (canvas as HTMLCanvasElement).toDataURL === 'function') {
    try {
      // @ts-ignore - some browsers accept quality param only for certain mime types
      const dataUrl = (canvas as HTMLCanvasElement).toDataURL(mime, quality);
      if (typeof dataUrl === 'string' && dataUrl.length > 0) {
        return dataUrl;
      }
    } catch {
      // fall through to blob path
    }
  }

  // Use convertToBlob if available (OffscreenCanvas or HTMLCanvasElement with toBlob)
  const blobPromise = (() => {
    // OffscreenCanvas.convertToBlob
    if (typeof (canvas as OffscreenCanvas).convertToBlob === 'function') {
      try {
        // @ts-ignore
        return (canvas as OffscreenCanvas).convertToBlob({ type: mime, quality });
      } catch {
        // fall through
      }
    }
    // HTMLCanvasElement.toBlob
    if (typeof (canvas as HTMLCanvasElement).toBlob === 'function') {
      return new Promise<Blob | null>((resolve) => {
        try {
          (canvas as HTMLCanvasElement).toBlob((b) => resolve(b), mime, quality);
        } catch {
          resolve(null);
        }
      });
    }
    return Promise.resolve<Blob | null>(null);
  })();

  const blob = await blobPromise;
  if (!blob) {
    throw new Error('Unable to export canvas to blob.');
  }
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to convert blob to base64.'));
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === 'string') resolve(result);
      else reject(new Error('Unexpected result converting blob to base64.'));
    };
    reader.readAsDataURL(blob);
  });
}

export async function resizeBase64(
  base64: string,
  maxWidth: number,
  maxHeight: number
): Promise<string> {
  if (!base64 || typeof base64 !== 'string') {
    throw new Error('Invalid base64 input.');
  }

  const mime = getMimeTypeFromDataUrl(base64);
  if (!mime) {
    throw new Error('Invalid data URL.');
  }

  // Don't process GIFs (canvas will drop animation)
  if (mime === 'image/gif') {
    return base64;
  }

  const img = await loadImageFromDataUrl(base64);

  const origWidth = img.naturalWidth || img.width;
  const origHeight = img.naturalHeight || img.height;

  // Determine target size preserving aspect ratio and not upscaling
  const widthRatio = maxWidth > 0 ? maxWidth / origWidth : 1;
  const heightRatio = maxHeight > 0 ? maxHeight / origHeight : 1;
  const ratio = Math.min(widthRatio || 1, heightRatio || 1, 1);

  const targetWidth = Math.max(1, Math.floor(origWidth * ratio));
  const targetHeight = Math.max(1, Math.floor(origHeight * ratio));

  // If no resizing needed, return original
  if (targetWidth === origWidth && targetHeight === origHeight) {
    return base64;
  }

  const { canvas, isOffscreen } = createCanvasElement(targetWidth, targetHeight);

  // set width/height if not already applied
  try {
    if ('width' in canvas) {
      // types are fine for both canvas types
      (canvas as any).width = targetWidth;
      (canvas as any).height = targetHeight;
    }
  } catch {
    // ignore
  }

  const ctx = (canvas as any).getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!ctx) {
    throw new Error('Canvas not supported.');
  }

  // High-quality scaling hints
  try {
    if ('imageSmoothingEnabled' in ctx) ctx.imageSmoothingEnabled = true;
    // @ts-ignore
    if (ctx.imageSmoothingQuality !== undefined) ctx.imageSmoothingQuality = 'high';
  } catch {
    // ignore
  }

  try {
    if ('clearRect' in ctx) ctx.clearRect(0, 0, targetWidth, targetHeight);
    // drawImage exists on both contexts
    ctx.drawImage(img as CanvasImageSource, 0, 0, targetWidth, targetHeight);
  } catch (err) {
    throw new Error('Failed to draw image on canvas.');
  }

  // Preserve mime type; for PNG quality is ignored by toDataURL/convertToBlob
  const outMime = mime === 'image/png' ? 'image/png' : mime === 'image/webp' ? 'image/webp' : 'image/jpeg';
  const defaultQuality = 0.92;

  return canvasToDataUrl(canvas, outMime, defaultQuality);
}

async function detectCanvasMimeSupport(mime: string): Promise<boolean> {
  // Quick runtime check for canvas.toDataURL support for a given mime
  try {
    const { canvas } = createCanvasElement(1, 1);
    if ('toDataURL' in canvas && typeof (canvas as HTMLCanvasElement).toDataURL === 'function') {
      const data = (canvas as HTMLCanvasElement).toDataURL(mime);
      return typeof data === 'string' && data.startsWith(`data:${mime}`);
    }
    // If toDataURL not available, try convertToBlob quickly
    if (typeof (canvas as OffscreenCanvas).convertToBlob === 'function') {
      try {
        // @ts-ignore
        const blob = await (canvas as OffscreenCanvas).convertToBlob({ type: mime });
        return blob instanceof Blob && blob.type === mime;
      } catch {
        return false;
      }
    }
  } catch {
    // ignore and return false
  }
  return false;
}

async function imageHasAlpha(img: HTMLImageElement): Promise<boolean> {
  try {
    const w = Math.max(1, Math.min(16, img.naturalWidth || img.width || 1));
    const h = Math.max(1, Math.min(16, img.naturalHeight || img.height || 1));
    const { canvas } = createCanvasElement(w, h);
    const ctx = (canvas as any).getContext('2d') as CanvasRenderingContext2D | null;
    if (!ctx) return false;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(img as CanvasImageSource, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h).data;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] < 255) return true;
    }
  } catch {
    // If any step fails (tainted canvas etc.), assume no alpha to avoid blocking compression
  }
  return false;
}

export async function compressImage(
  base64: string,
  options?: { quality?: number; maxWidth?: number; maxHeight?: number }
): Promise<string> {
  if (!base64 || typeof base64 !== 'string') {
    throw new Error('Invalid base64 input.');
  }

  const quality = typeof options?.quality === 'number' ? Math.max(0, Math.min(1, options!.quality)) : 0.8;
  const maxWidth = typeof options?.maxWidth === 'number' ? Math.max(1, Math.floor(options!.maxWidth)) : 1920;
  const maxHeight = typeof options?.maxHeight === 'number' ? Math.max(1, Math.floor(options!.maxHeight)) : 1080;

  const mime = getMimeTypeFromDataUrl(base64);
  if (!mime) {
    throw new Error('Invalid data URL.');
  }

  // Do not attempt to compress animated GIFs (canvas would drop frames)
  if (mime === 'image/gif') {
    return base64;
  }

  // First, resize if needed. If resize fails, fallback to original base64.
  let processedBase64 = base64;
  try {
    processedBase64 = await resizeBase64(base64, maxWidth, maxHeight);
  } catch {
    processedBase64 = base64;
  }

  // Quality-supporting types (standard): image/jpeg and image/webp
  const supportsQuality = mime === 'image/jpeg' || mime === 'image/webp';

  // If quality is effectively "no change", return processed image
  if (quality >= 0.999) {
    return processedBase64;
  }

  // If mime supports quality natively, re-encode directly.
  if (supportsQuality) {
    const img = await loadImageFromDataUrl(processedBase64);
    const width = img.naturalWidth || img.width;
    const height = img.naturalHeight || img.height;

    const { canvas } = createCanvasElement(width, height);
    const ctx = (canvas as any).getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
    if (!ctx) throw new Error('Canvas not supported.');

    try {
      if ('imageSmoothingEnabled' in ctx) ctx.imageSmoothingEnabled = true;
      // @ts-ignore
      if (ctx.imageSmoothingQuality !== undefined) ctx.imageSmoothingQuality = 'high';
    } catch {
      // ignore
    }

    try {
      if ('clearRect' in ctx) ctx.clearRect(0, 0, width, height);
      ctx.drawImage(img as CanvasImageSource, 0, 0, width, height);
    } catch {
      throw new Error('Failed to draw image on canvas.');
    }

    const outMime = mime === 'image/webp' ? 'image/webp' : 'image/jpeg';
    return canvasToDataUrl(canvas, outMime, quality);
  }

  // Mime does not support quality; attempt sensible conversions where safe.
  // For PNG: prefer to convert to webp (preserves alpha) if supported; otherwise, if image has no alpha, convert to jpeg; else, skip compression.
  // For other types (svg, bmp, etc.) prefer webp then jpeg.
  const img = await loadImageFromDataUrl(processedBase64);

  let targetMime: string | null = null;

  if (mime === 'image/png') {
    // Check if PNG has alpha
    const hasAlpha = await imageHasAlpha(img);
    const webpSupported = await detectCanvasMimeSupport('image/webp');
    if (webpSupported) {
      targetMime = 'image/webp';
    } else if (!hasAlpha) {
      // Safe to convert to jpeg
      targetMime = 'image/jpeg';
    } else {
      // Cannot safely compress PNG without losing alpha and no webp support; return processed
      return processedBase64;
    }
  } else {
    // Other non-quality-supporting types
    const webpSupported = await detectCanvasMimeSupport('image/webp');
    if (webpSupported) targetMime = 'image/webp';
    else targetMime = 'image/jpeg';
  }

  if (!targetMime) {
    return processedBase64;
  }

  const width = img.naturalWidth || img.width;
  const height = img.naturalHeight || img.height;

  const { canvas } = createCanvasElement(width, height);
  const ctx = (canvas as any).getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!ctx) throw new Error('Canvas not supported.');

  try {
    if ('imageSmoothingEnabled' in ctx) ctx.imageSmoothingEnabled = true;
    // @ts-ignore
    if (ctx.imageSmoothingQuality !== undefined) ctx.imageSmoothingQuality = 'high';
  } catch {
    // ignore
  }

  try {
    if ('clearRect' in ctx) ctx.clearRect(0, 0, width, height);
    ctx.drawImage(img as CanvasImageSource, 0, 0, width, height);
  } catch {
    throw new Error('Failed to draw image on canvas.');
  }

  return canvasToDataUrl(canvas, targetMime, quality);
}