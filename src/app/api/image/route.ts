import { NextResponse } from "next/server";
import { generateTokenImage, type ImageStyle } from "@/lib/ai/image";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/image  { ticker, description, style?: "icon" | "photo" }
 * → { image } (data URI or absolute URL). Falls back to an SVG mark when no
 *   image provider is configured (icon), so the studio never blocks.
 */
export async function POST(req: Request) {
  let ticker = "";
  let description = "";
  let style: ImageStyle = "icon";
  try {
    const body = (await req.json()) as { ticker?: string; description?: string; style?: string };
    ticker = (body.ticker ?? "").trim().slice(0, 12);
    description = (body.description ?? "").trim().slice(0, 400);
    if (body.style === "photo" || body.style === "icon") style = body.style;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (ticker.length < 1 && description.length < 3) {
    return NextResponse.json({ error: "Provide a ticker or description." }, { status: 400 });
  }

  try {
    const image = await generateTokenImage(ticker || "CREO", description, style);
    return NextResponse.json({ image, style });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Image generation failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
