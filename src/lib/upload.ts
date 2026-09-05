/**
 * Client-side image upload for token logos.
 * Downscales to a square-ish max edge (keeps KV values small + logos crisp),
 * then stores via /api/upload and returns an absolute URL usable as the
 * on-chain `logo` (so it renders in the feed and wallets).
 */

// Stored images live as base64 in KV (Upstash), whose REST request cap is ~1MB.
// Keep the encoded data URL comfortably under that so uploads never fail on size.
const MAX_EDGE = 512;
const TARGET_CHARS = 600_000; // ~450KB of image bytes — safely under the KV limit

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read that image."));
    };
    img.src = url;
  });
}

function drawAt(img: HTMLImageElement, edge: number): HTMLCanvasElement {
  const scale = Math.min(1, edge / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported.");
  ctx.drawImage(img, 0, 0, w, h);
  return canvas;
}

async function toDownscaledDataUrl(file: File): Promise<string> {
  const img = await loadImage(file);

  // Shrink the max edge and/or the JPEG quality until the encoded data URL fits
  // under the KV size cap. PNG (keeps transparency) is preferred when it's small
  // enough; otherwise JPEG at decreasing quality.
  let smallest = "";
  for (const edge of [MAX_EDGE, 448, 384, 320, 256]) {
    const canvas = drawAt(img, edge);
    const png = canvas.toDataURL("image/png");
    if (png.length <= TARGET_CHARS) return png;
    for (const q of [0.85, 0.72, 0.6, 0.5]) {
      const jpg = canvas.toDataURL("image/jpeg", q);
      if (!smallest || jpg.length < smallest.length) smallest = jpg;
      if (jpg.length <= TARGET_CHARS) return jpg;
    }
  }
  // Nothing fit the target (extreme source) — return the smallest we produced.
  return smallest || (await Promise.resolve(drawAt(img, 256).toDataURL("image/jpeg", 0.4)));
}

/** Upload a data-URL string to storage and return an absolute short URL. */
export async function uploadDataUrl(dataUrl: string): Promise<string> {
  const res = await fetch("/api/upload", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ dataUrl }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "Upload failed.");
  return `${window.location.origin}${json.path}`;
}

/** Upload a file and return an absolute URL to the stored image. */
export async function uploadLogo(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Please choose an image file.");
  const dataUrl = await toDownscaledDataUrl(file);
  return uploadDataUrl(dataUrl);
}

/**
 * On-chain token metadata (logo) must be a SHORT reference — a data: URI or an
 * over-long string makes the launch revert with MetadataTooLong(). If the given
 * logo is a data URI or too long, upload it and return a short absolute URL;
 * otherwise return it unchanged. Never throws — falls back to a safe empty
 * string if it can't be shortened (a launch with no logo still succeeds).
 */
const MAX_ONCHAIN_LOGO = 200; // chars — well under the contract's metadata cap
export async function toOnchainLogo(logo: string | undefined | null): Promise<string> {
  const v = (logo ?? "").trim();
  if (!v) return "";
  const isData = v.startsWith("data:");
  if (!isData && v.length <= MAX_ONCHAIN_LOGO) return v; // already a short URL/ipfs
  try {
    const short = await uploadDataUrl(v);
    return short.length <= MAX_ONCHAIN_LOGO ? short : "";
  } catch {
    return ""; // storage unavailable — launch without an on-chain logo rather than revert
  }
}
