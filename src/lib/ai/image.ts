import { generateFallbackLogo } from "./avatar";

/**
 * AI token art through the **Bankr LLM Gateway** (same key/base as text
 * generation - Bankr routes across many models). Two styles:
 *  - "icon"  → a clean, iconic token logo.
 *  - "photo" → a photorealistic, cinematic promo image.
 *
 * Order of providers:
 *  1. Bankr LLM Gateway (BANKR_API_KEY, OpenAI-compatible /v1/images/generations)
 *  2. A generic OpenAI-compatible endpoint (IMAGE_API_URL + IMAGE_API_KEY), if set
 *  3. Deterministic SVG fallback so the studio always works.
 */

export type ImageStyle = "icon" | "photo";

const NO_TEXT = "No text, no letters, no words, no numbers, no watermark, no signature, no frame, no border.";

export function buildImagePrompt(style: ImageStyle, ticker: string, description: string): string {
  const subject = description?.trim() || `a crypto token called $${ticker}`;
  if (style === "photo") {
    return (
      `INSANE, hyper-cinematic promotional key art - like a blockbuster movie poster. ` +
      `Subject: ${subject}. ` +
      `Epic dramatic composition, volumetric god-ray lighting, glowing neon rim light, ` +
      `swirling atmosphere with drifting embers and particles, subtle lens flares, ` +
      `rich bokeh and deep depth of field, ultra-detailed hyperreal 8k octane/unreal render, ` +
      `bold saturated cinematic color grade, high dynamic range, dramatic sense of scale and motion, ` +
      `awe-inspiring, larger than life, jaw-dropping. Warm sunset accents (amber, orange, deep red) ` +
      `with cool teal shadows for contrast. ${NO_TEXT}`
    );
  }
  // Icon: a bold, ultra-glossy emblem/mascot that MATCHES the description.
  return (
    `An insanely cool, ultra-glossy crypto token emblem that stops the scroll. ` +
    `Subject (make it unmistakably about this): ${subject}. ` +
    `A single bold centered 3D mascot character or symbolic emblem, whichever fits best. ` +
    `Thick clean outlines, glossy iridescent materials, dramatic studio rim lighting, ` +
    `subtle inner glow and energetic accent sparks, punchy high-contrast colors, ` +
    `strong readable silhouette, generous padding, plain soft radial background, ` +
    `premium sticker / app-icon look. Playful yet high-end, instantly iconic and ` +
    `crisp even at small sizes. ${NO_TEXT}`
  );
}

/** Generate token art. Returns a data URI or an absolute image URL. */
export async function generateTokenImage(
  ticker: string,
  description: string,
  style: ImageStyle = "icon"
): Promise<string> {
  const prompt = buildImagePrompt(style, ticker, description);
  // 1024x1024 is the one size supported by every current model (gpt-image-1,
  // dall-e-3). The old 512x512 was rejected by gpt-image-1 and forced the SVG
  // fallback every time.
  const size = process.env.IMAGE_SIZE || "1024x1024";

  // 1) Bankr LLM Gateway (preferred - one key for text + image + more).
  const bankrKey = process.env.BANKR_API_KEY;
  if (bankrKey) {
    const base = process.env.BANKR_BASE_URL || "https://llm.bankr.bot";
    const model = process.env.BANKR_IMAGE_MODEL || process.env.IMAGE_MODEL || "gpt-image-1";
    const img = await callImages(`${base}/v1/images/generations`, bankrKey, model, prompt, size);
    if (img) return img;
  }

  // 2) Generic OpenAI-compatible image endpoint (optional override).
  const url = process.env.IMAGE_API_URL;
  const key = process.env.IMAGE_API_KEY;
  if (url && key) {
    const model = process.env.IMAGE_MODEL || "gpt-image-1";
    const img = await callImages(url, key, model, prompt, size);
    if (img) return img;
  }

  // 3) Fallback: deterministic SVG mark.
  return generateFallbackLogo(ticker);
}

/** POST an OpenAI-compatible images request; tolerate several response shapes. */
async function callImages(
  endpoint: string,
  key: string,
  model: string,
  prompt: string,
  size: string
): Promise<string | null> {
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        // Bankr keys off X-API-Key; other gateways use Authorization. Send both.
        "x-api-key": key,
        authorization: `Bearer ${key}`,
      },
      // No response_format: gpt-image-1 rejects it (and always returns b64_json);
      // dall-e-3 returns a url. We parse both shapes below.
      body: JSON.stringify({ model, prompt, size, n: 1 }),
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      data?: Array<{ b64_json?: string; url?: string }>;
      image?: string;
      url?: string;
    };
    const b64 = data.data?.[0]?.b64_json;
    if (b64) return `data:image/png;base64,${b64}`;
    return data.data?.[0]?.url || data.url || data.image || null;
  } catch {
    return null;
  }
}
