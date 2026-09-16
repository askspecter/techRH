/**
 * FLUX.1 [schnell] on fal.ai — the image generator (ported from AgentHood).
 * FLUX renders stylized token art far better than the generic gpt-image path,
 * so it's CREO's preferred provider when FAL_KEY is set. The key stays
 * server-side. Returns a data URI (bytes fetched from fal's temporary URL) so
 * it flows through the rest of CREO's pipeline exactly like the other
 * providers; returns null when unconfigured or on any failure, so callers fall
 * back to Bankr/OpenAI/SVG.
 */
const FAL_URL = "https://fal.run/fal-ai/flux/schnell";

export async function fluxImageDataUri(prompt: string, timeoutMs = 45_000): Promise<string | null> {
  const key = process.env.FAL_KEY;
  if (!key) return null;
  try {
    const res = await fetch(FAL_URL, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Key ${key}` },
      cache: "no-store",
      body: JSON.stringify({
        prompt: prompt.slice(0, 600),
        image_size: "square_hd",
        num_images: 1,
        num_inference_steps: 4,
        enable_safety_checker: true,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { images?: Array<{ url?: string }> };
    const url = json.images?.[0]?.url;
    if (!url) return null;
    // fal's URL is temporary — fetch the bytes and return a data URI so the
    // launch pipeline (toOnchainLogo → upload) can persist it like any upload.
    const img = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(20_000) });
    if (!img.ok) return null;
    const mime = (img.headers.get("content-type") || "image/jpeg").split(";")[0];
    const b64 = Buffer.from(await img.arrayBuffer()).toString("base64");
    return `data:${mime};base64,${b64}`;
  } catch {
    return null;
  }
}
