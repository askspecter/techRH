/** Shared site constants (links, copy). */
export const SITE = {
  name: "CREO",
  tagline: "One line in. A token out.",
  description:
    "Cinematic AI launchpad. Describe a token in one sentence, watch the full launch package render, and deploy to Pons on Robinhood Chain, non-custodial.",
  x: "https://x.com/creodotfamily",
  xHandle: "@creodotfamily",
  company: "CREO",
  chain: "Robinhood Chain",
  poweredBy: "Pons",
} as const;

/**
 * The project's own official token. Pinned to the top of Explore / the feed so
 * the flagship is always visible even before anyone launches through the app.
 * (The feed itself only indexes app-launches from KV; this token was minted
 * outside the app, so it is surfaced explicitly.)
 */
export const OFFICIAL_TOKEN = {
  address: "0xe612c939d82981F8e17CCAC3b59c1084c2Aa02Bb",
  name: "CREO",
  symbol: "CREO",
  logo: "/creo-logo.jpg",
  version: "v2" as const,
} as const;

export const NAV = [
  { href: "/feed", label: "Explore" },
  { href: "/create", label: "Create" },
  { href: "/analytics", label: "Analytics" },
  { href: "/profile", label: "Profile" },
  { href: "/docs", label: "Docs" },
] as const;
