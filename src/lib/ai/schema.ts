import { z } from "zod";

/** RWA/quote assets the AI is allowed to recommend for a v2 launch. */
export const quoteAssetSchema = z.enum(["ETH", "USDG", "NVDA", "AAPL", "HOOD"]);

/** The structured launch package the model must return. */
export const launchPackageSchema = z.object({
  name: z.string().min(1).max(40),
  ticker: z
    .string()
    .min(2)
    .max(10)
    .transform((s) => s.toUpperCase().replace(/[^A-Z0-9]/g, "")),
  description: z.string().min(1).max(280),
  lore: z.string().min(1).max(1200),
  memePrompts: z.array(z.string().min(1)).min(2).max(4),
  xThread: z.array(z.string().min(1)).min(3).max(6),
  recommendation: z.object({
    version: z.enum(["v1", "v2"]),
    quoteAsset: quoteAssetSchema,
    rationale: z.string().min(1).max(400),
  }),
});

export type LaunchPackage = z.infer<typeof launchPackageSchema>;

/** The JSON Schema handed to Claude as a tool so output is well-formed. */
export const launchPackageJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["name", "ticker", "description", "lore", "memePrompts", "xThread", "recommendation"],
  properties: {
    name: { type: "string", description: "Token name, catchy, max 40 chars" },
    ticker: { type: "string", description: "2-10 chars, UPPERCASE letters/numbers" },
    description: { type: "string", description: "One-line hook, max 280 chars" },
    lore: { type: "string", description: "The narrative/backstory, 2-4 short paragraphs" },
    memePrompts: {
      type: "array",
      minItems: 2,
      maxItems: 4,
      items: { type: "string" },
      description: "Image-gen prompts for shareable memes",
    },
    xThread: {
      type: "array",
      minItems: 3,
      maxItems: 6,
      items: { type: "string" },
      description: "Ready-to-post X/Twitter thread, one string per tweet, <=280 chars each",
    },
    recommendation: {
      type: "object",
      additionalProperties: false,
      required: ["version", "quoteAsset", "rationale"],
      properties: {
        version: { type: "string", enum: ["v1", "v2"] },
        quoteAsset: { type: "string", enum: ["ETH", "USDG", "NVDA", "AAPL", "HOOD"] },
        rationale: { type: "string", description: "Why this version + quote asset fits, max 400 chars" },
      },
    },
  },
} as const;
