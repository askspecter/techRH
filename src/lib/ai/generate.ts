import type AnthropicSDK from "@anthropic-ai/sdk";
import { launchPackageSchema, type LaunchPackage } from "./schema";

/**
 * CREO's launch-package generator.
 *
 * Primary provider is the **Bankr LLM Gateway** (OpenAI-compatible
 * /v1/chat/completions at https://llm.bankr.bot). Bankr routes to Claude / GPT
 * / Gemini behind one key, on a credit system. Anthropic (direct) stays as an
 * optional fallback.
 *
 * Output is JSON-mode + zod-validated (with one repair retry) so it stays
 * reliable across whichever model Bankr routes to.
 */

const CREATIVE_RULES = `You are the creative engine of CREO, a cinematic AI launchpad for the Pons protocol on Robinhood Chain.
Given a single idea, design a COMPLETE, launch-ready memecoin/token package.

- name: catchy and memorable. ticker: 2-10 UPPERCASE chars, no spaces.
- description: one punchy hook. lore: a short, fun narrative (2-4 short paragraphs) that gives the token identity.
- memePrompts: vivid image-generation prompts for shareable memes.
- xThread: a ready-to-post X thread; each entry <=280 chars, native crypto-Twitter voice, tasteful emoji.
- recommendation: pick the launch model that best fits the idea:
    * v1  = instant Uniswap V3 pool, WETH-only. Best when immediate tradability matters.
    * v2  = bonding curve that graduates to Uniswap V4 (~4.2 ETH), supports RWA quote pairs
            (ETH/USDG/NVDA/AAPL/HOOD), pays creators in ETH. Best for fair launches, or when the
            theme maps to an RWA (e.g. a stocks/markets theme -> NVDA/AAPL/HOOD quote).
  Explain the choice briefly in rationale.
- Write ALL copy in English. Keep ticker ASCII. Never promise financial returns or guaranteed price action.
- Never use em-dashes or en-dashes (U+2014 / U+2013). Use commas, periods, or plain hyphens instead.`;

const JSON_SPEC = `Respond with ONLY a single JSON object (no markdown, no code fences, no prose) with EXACTLY these keys:
{
  "name": string,                // <= 40 chars
  "ticker": string,              // 2-10 uppercase A-Z/0-9
  "description": string,         // <= 280 chars
  "lore": string,                // <= 1200 chars
  "memePrompts": string[],       // 2-4 items
  "xThread": string[],           // 3-6 items, each <= 280 chars
  "recommendation": {
    "version": "v1" | "v2",
    "quoteAsset": "ETH" | "USDG" | "NVDA" | "AAPL" | "HOOD",
    "rationale": string          // <= 400 chars
  }
}`;

type Provider = "bankr" | "anthropic";

function pickProvider(): Provider {
  const explicit = process.env.AI_PROVIDER?.toLowerCase();
  if (explicit === "bankr" || explicit === "anthropic") return explicit;
  if (process.env.BANKR_API_KEY) return "bankr";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  // default target is Bankr; surfaces a clear "not configured" error below
  return "bankr";
}

export async function generateLaunchPackage(idea: string): Promise<LaunchPackage> {
  const provider = pickProvider();
  const obj =
    provider === "bankr" ? await callBankr(idea) : await callAnthropic(idea);
  return launchPackageSchema.parse(obj);
}

/* ── Bankr LLM Gateway (OpenAI-compatible) ───────────────────────────────── */

async function callBankr(idea: string): Promise<unknown> {
  const key = process.env.BANKR_API_KEY;
  if (!key) {
    throw new Error(
      "BANKR_API_KEY is not set. Create a key with LLM Gateway enabled at bankr.bot/api-keys."
    );
  }
  const base = process.env.BANKR_BASE_URL || "https://llm.bankr.bot";
  const model = process.env.BANKR_MODEL || "claude-sonnet-5";

  const body = {
    model,
    max_tokens: 2000,
    temperature: 0.9,
    messages: [
      { role: "system", content: `${CREATIVE_RULES}\n\n${JSON_SPEC}` },
      { role: "user", content: `Idea: ${idea}` },
    ],
  };

  const first = await bankrChat(base, key, body);
  try {
    return extractJson(first);
  } catch {
    // One repair pass: hand the bad output back and demand valid JSON only.
    const repair = await bankrChat(base, key, {
      ...body,
      temperature: 0.2,
      messages: [
        { role: "system", content: JSON_SPEC },
        { role: "user", content: `Return valid JSON only for this idea: ${idea}` },
        { role: "assistant", content: first },
        { role: "user", content: "That was not valid JSON. Reply with ONLY the JSON object." },
      ],
    });
    return extractJson(repair);
  }
}

async function bankrChat(base: string, key: string, body: unknown): Promise<string> {
  const res = await fetch(`${base}/v1/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", "X-API-Key": key },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    if (res.status === 402 || /credit/i.test(text)) {
      throw new Error("Bankr LLM credits exhausted - top up at bankr.bot (bankr llm credits add).");
    }
    if (res.status === 401 || res.status === 403) {
      throw new Error("Bankr rejected the API key - ensure LLM Gateway is enabled for it.");
    }
    throw new Error(`Bankr LLM Gateway error ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("Bankr returned an empty completion.");
  return content;
}

/* ── Anthropic direct (fallback), structured via tool-use ────────────────── */

async function callAnthropic(idea: string): Promise<unknown> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set on the server.");

  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const { launchPackageJsonSchema } = await import("./schema");
  const client = new Anthropic({ apiKey });
  const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";

  const message = await client.messages.create({
    model,
    max_tokens: 2000,
    system: CREATIVE_RULES,
    tools: [
      {
        name: "emit_launch_package",
        description: "Emit the complete, structured launch package.",
        input_schema: launchPackageJsonSchema as unknown as AnthropicSDK.Tool.InputSchema,
      },
    ],
    tool_choice: { type: "tool", name: "emit_launch_package" },
    messages: [{ role: "user", content: `Idea: ${idea}` }],
  });

  const toolUse = message.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("The model did not return a launch package.");
  }
  return toolUse.input;
}

/* ── helpers ─────────────────────────────────────────────────────────────── */

/** Pull a JSON object out of a model reply, tolerating code fences / prose. */
function extractJson(text: string): unknown {
  let s = text.trim();
  // strip ```json ... ``` fences if present
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  // otherwise slice from first { to last }
  if (!s.startsWith("{")) {
    const start = s.indexOf("{");
    const end = s.lastIndexOf("}");
    if (start !== -1 && end !== -1) s = s.slice(start, end + 1);
  }
  return JSON.parse(s);
}
