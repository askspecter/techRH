/** Shared site constants (links, copy). */
export const SITE = {
  name: "CREO",
  tagline: "One line in. A token out.",
  description:
    "Cinematic AI launchpad. Describe a token in one sentence, watch the full launch package render, and deploy to Pons on Robinhood Chain, non-custodial.",
  x: "https://x.com/creodotworks",
  xHandle: "@creodotworks",
  company: "CREO",
  chain: "Robinhood Chain",
  poweredBy: "Pons",
} as const;

export const NAV = [
  { href: "/feed", label: "Explore" },
  { href: "/create", label: "Create" },
  { href: "/analytics", label: "Analytics" },
  { href: "/profile", label: "Profile" },
  { href: "/docs", label: "Docs" },
] as const;
