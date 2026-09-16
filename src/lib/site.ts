/** Shared site constants (links, copy). */
export const SITE = {
  name: "CREO",
  tagline: "One line in. A token out.",
  description:
    "Cinematic AI launchpad. Describe a token in one sentence, watch the full launch package render, and deploy to o1.exchange on Arc, non-custodial.",
  x: "https://x.com/creodotfamily",
  xHandle: "@creodotfamily",
  company: "CREO",
  chain: "Arc",
  poweredBy: "o1.exchange",
} as const;

/**
 * The project's own official token. Pinned to the top of Explore / the feed so
 * the flagship is always visible even before anyone launches through the app.
 * (The feed itself only indexes app-launches from KV; this token was minted
 * outside the app, so it is surfaced explicitly.)
 */
export const OFFICIAL_TOKEN: {
  address: string;
  name: string;
  symbol: string;
  logo: string;
  version: "v1" | "v2";
} = {
  address: "0x1c98d896328c35a751ce18323f47139a44188001",
  name: "CREO",
  symbol: "CREO",
  logo: "/creo-logo.jpg",
  version: "v2",
};

export const NAV = [
  { href: "/feed", label: "Explore" },
  { href: "/create", label: "Create" },
  { href: "/burn", label: "Burn" },
  { href: "/analytics", label: "Analytics" },
  { href: "/profile", label: "Profile" },
  { href: "/docs", label: "Docs" },
] as const;
