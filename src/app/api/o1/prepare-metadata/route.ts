import { NextResponse } from "next/server";
import { isAddress } from "viem";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/o1/prepare-metadata
 *
 * o1.exchange only shows a launch's logo, description and links when the
 * ERC-7572 metadata document is pinned in o1's OWN Pinata account — their
 * gateway 403s any other CID. o1's Public API `POST /launches/prepare` pins
 * the image + document and returns an `ipfs://` metadata URI, which we then
 * pass to the factory as `tokenContractURI`.
 *
 * This runs server-side so the O1_API_KEY never reaches the browser. When no
 * key is configured it returns { metadataUri: null } and the launch falls back
 * to using the plain logo URL (the token still launches, but o1's pages will
 * show it blank until a key is set).
 *
 * Env: O1_API_KEY (required to pin), O1_API_URL (default o1 production API).
 */

const O1_API_URL = (process.env.O1_API_URL || "https://api.launch.o1.exchange/v1").replace(/\/$/, "");
const ARC_CHAIN_ID = 5042;
const USDC_ERC20 = "0x3600000000000000000000000000000000000000";
const IMAGE_MAX_BYTES = 2 * 1024 * 1024;

const X_RE = /^https?:\/\/(?:www\.)?x\.com\/.+/;
const WEBSITE_RE = /^https?:\/\/[^/]*\.[^/]+(?:\/.*)?$/;
const TELEGRAM_RE = /^https?:\/\/(?:www\.)?(?:t\.me|telegram\.me)\/.+/;
const link = (v: string | undefined, re: RegExp) => {
  const s = (v ?? "").trim();
  return s.length <= 2048 && re.test(s) ? s : "";
};

function sniffMime(bytes: Uint8Array): string | null {
  const a = (f: number, t: number) => String.fromCharCode(...bytes.subarray(f, t));
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 6 && (a(0, 6) === "GIF87a" || a(0, 6) === "GIF89a")) return "image/gif";
  if (bytes.length >= 12 && a(0, 4) === "RIFF" && a(8, 12) === "WEBP") return "image/webp";
  return null;
}

/** Resolve a logo (data: URI or absolute URL) to raw bytes. */
async function resolveImage(logo: string): Promise<Uint8Array | null> {
  try {
    if (logo.startsWith("data:")) {
      const b64 = logo.slice(logo.indexOf(",") + 1);
      return new Uint8Array(Buffer.from(b64, "base64"));
    }
    if (/^https?:\/\//.test(logo)) {
      const res = await fetch(logo, { signal: AbortSignal.timeout(15_000), redirect: "follow" });
      if (!res.ok) return null;
      return new Uint8Array(await res.arrayBuffer());
    }
  } catch {
    /* fall through */
  }
  return null;
}

export async function POST(req: Request) {
  const key = process.env.O1_API_KEY;
  if (!key) return NextResponse.json({ metadataUri: null, reason: "no_api_key" });

  let body: {
    name?: string;
    symbol?: string;
    description?: string;
    logo?: string;
    website?: string;
    x?: string;
    telegram?: string;
    creator?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const creator = body.creator ?? "";
  if (!isAddress(creator)) return NextResponse.json({ error: "Invalid creator address." }, { status: 400 });
  const name = (body.name ?? "").trim();
  const symbol = (body.symbol ?? "").trim();
  if (!name || !symbol) return NextResponse.json({ error: "Missing name/symbol." }, { status: 400 });

  const bytes = body.logo ? await resolveImage(body.logo) : null;
  if (!bytes || bytes.length === 0) return NextResponse.json({ metadataUri: null, reason: "no_image" });
  if (bytes.length > IMAGE_MAX_BYTES) return NextResponse.json({ metadataUri: null, reason: "image_too_large" });
  const mime = sniffMime(bytes);
  if (!mime) return NextResponse.json({ metadataUri: null, reason: "image_not_allowed" });

  const payload = {
    chain_id: ARC_CHAIN_ID,
    creator,
    market: "standard",
    quote_address: USDC_ERC20,
    token: {
      name,
      symbol,
      description: (body.description ?? "").slice(0, 2000),
      image_base64: Buffer.from(bytes).toString("base64"),
      image_type: mime,
      website: link(body.website, WEBSITE_RE),
      x: link(body.x, X_RE),
      telegram: link(body.telegram, TELEGRAM_RE),
      editable_metadata: false,
      extra_metadata: [],
    },
  };

  try {
    const res = await fetch(`${O1_API_URL}/launches/prepare`, {
      method: "POST",
      headers: { "x-api-key": key, "content-type": "application/json", "Idempotency-Key": crypto.randomUUID() },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(90_000),
    });
    const text = await res.text().catch(() => "");
    if (!res.ok) {
      let detail = text;
      try {
        const j = JSON.parse(text) as { detail?: string; title?: string; code?: string };
        detail = (j.detail ?? j.title ?? text) + (j.code ? ` (${j.code})` : "");
      } catch {
        /* keep raw text */
      }
      return NextResponse.json({ metadataUri: null, reason: "o1_error", detail: String(detail).replace(/\s+/g, " ").slice(0, 200), status: res.status });
    }
    const json = JSON.parse(text) as { data?: { metadata_uri?: string; image_url?: string | null } };
    const metadataUri = json.data?.metadata_uri ?? null;
    const imageUrl = json.data?.image_url ?? null;
    if (!metadataUri || !metadataUri.startsWith("ipfs://")) {
      return NextResponse.json({ metadataUri: null, reason: "no_metadata_uri" });
    }
    return NextResponse.json({ metadataUri, imageUrl });
  } catch (err) {
    return NextResponse.json({ metadataUri: null, reason: "request_failed", detail: err instanceof Error ? err.message : String(err) });
  }
}
