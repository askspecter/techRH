import { getKv } from "@/lib/kv";

export const runtime = "nodejs";

/** GET /api/img/[id] - serve a stored image with long-lived caching. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const kv = getKv();
  if (!kv) return new Response("Storage not configured", { status: 503 });

  const id = params.id.replace(/[^a-zA-Z0-9]/g, "");
  let dataUrl: string | null = null;
  try {
    dataUrl = await kv.get<string>(`img:${id}`);
  } catch {
    return new Response("Storage error", { status: 502 });
  }
  if (!dataUrl) return new Response("Not found", { status: 404 });

  const m = /^data:([^;]+);base64,(.+)$/s.exec(dataUrl);
  if (!m) return new Response("Corrupt image", { status: 500 });

  const buf = Buffer.from(m[2], "base64");
  return new Response(buf, {
    headers: {
      "content-type": m[1],
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
}
