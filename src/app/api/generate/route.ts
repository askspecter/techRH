import { NextResponse } from "next/server";
import { generateLaunchPackage } from "@/lib/ai/generate";
import { generateTokenImage } from "@/lib/ai/image";
import { checkTickerAvailability } from "@/lib/ai/availability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/generate  { idea: string }
 * → full launch package + a logo (data URI) + on-chain availability warning.
 */
export async function POST(req: Request) {
  let idea = "";
  try {
    const body = (await req.json()) as { idea?: string };
    idea = (body.idea ?? "").trim();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (idea.length < 3) {
    return NextResponse.json({ error: "Write at least 3 characters for your idea." }, { status: 400 });
  }
  if (idea.length > 500) {
    return NextResponse.json({ error: "Idea is too long (max 500 characters)." }, { status: 400 });
  }

  try {
    const pkg = await generateLaunchPackage(idea);

    // Logo: real AI image if a provider is configured, else deterministic SVG.
    const logo = await generateTokenImage(pkg.ticker, pkg.description, "icon");

    // Availability is a soft warning; run it in parallel-safe fashion.
    const availability = await checkTickerAvailability(pkg.ticker);

    return NextResponse.json({ package: pkg, logo, availability });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to build the launch package.";
    // config / provider issues → 503 (service not ready), otherwise 500.
    const status = /API_KEY|credits|LLM Gateway|not set|rejected the API key/i.test(message)
      ? 503
      : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
