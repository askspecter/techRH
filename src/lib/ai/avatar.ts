/**
 * Deterministic fallback logo generator.
 *
 * When no image-gen provider is configured (or it fails), we still return a
 * real, designed token mark so the studio works end-to-end — not just initials
 * on a flat disc. Each ticker deterministically maps to a glossy coin with a
 * unique gradient and one of several vector emblems (orbit, gem, spark, or a
 * beveled monogram). Same ticker → same logo, every time.
 */
export function generateFallbackLogo(ticker: string): string {
  const t = (ticker || "CREO").toUpperCase();
  const seed = hash(t);
  // Two hues pulled from the seed, biased toward vivid, saturated tones. The
  // brand magenta (330°) is blended in as a rim light so marks feel on-brand.
  const h1 = seed % 360;
  const h2 = (h1 + 40 + ((seed >> 3) % 80)) % 360;
  const archetype = seed % 4;
  const initial = t.slice(0, 1);
  const initials = t.slice(0, t.length > 3 ? 3 : 2);

  const c1 = `hsl(${h1} 90% 62%)`;
  const c2 = `hsl(${h2} 85% 42%)`;
  const c1d = `hsl(${h1} 80% 34%)`;

  const emblem = (() => {
    switch (archetype) {
      case 0: // orbit — rings + glowing core
        return `
          <g fill="none" stroke="#fff" stroke-opacity="0.9">
            <circle cx="128" cy="128" r="66" stroke-width="7"/>
            <ellipse cx="128" cy="128" rx="92" ry="34" stroke-width="6" stroke-opacity="0.5" transform="rotate(-28 128 128)"/>
          </g>
          <circle cx="128" cy="128" r="26" fill="#fff"/>
          <circle cx="118" cy="118" r="8" fill="#fff" fill-opacity="0.6"/>`;
      case 1: // gem — faceted diamond
        return `
          <g fill="#fff">
            <path d="M128 58 L196 118 L128 208 L60 118 Z" fill-opacity="0.96"/>
            <path d="M128 58 L196 118 L128 118 Z" fill-opacity="0.7"/>
            <path d="M128 58 L60 118 L128 118 Z" fill-opacity="0.85"/>
            <path d="M60 118 L128 118 L128 208 Z" fill-opacity="0.6"/>
          </g>`;
      case 2: // spark — bold four-point star
        return `
          <path d="M128 48 C138 104 152 118 208 128 C152 138 138 152 128 208
                   C118 152 104 138 48 128 C104 118 118 104 128 48 Z"
                fill="#fff"/>
          <circle cx="128" cy="128" r="14" fill="${c1}"/>`;
      default: {
        // beveled monogram — a designed glyph, not plain text
        const label = initials.length > 2 ? initials : initial;
        const fontSize = label.length >= 3 ? 82 : label.length === 2 ? 116 : 148;
        return `
          <text x="128" y="142" font-family="'Space Grotesk', ui-sans-serif, system-ui, sans-serif"
                font-size="${fontSize}" font-weight="800"
                fill="url(#mono)" text-anchor="middle" dominant-baseline="central"
                letter-spacing="-3">${escapeXml(label)}</text>`;
      }
    }
  })();

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
  <defs>
    <radialGradient id="bg" cx="0.35" cy="0.28" r="0.95">
      <stop offset="0" stop-color="${c1}"/>
      <stop offset="0.6" stop-color="${c2}"/>
      <stop offset="1" stop-color="${c1d}"/>
    </radialGradient>
    <linearGradient id="mono" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0.75"/>
    </linearGradient>
    <radialGradient id="sheen" cx="0.5" cy="0.16" r="0.7">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.55"/>
      <stop offset="0.5" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <circle cx="128" cy="128" r="124" fill="url(#bg)"/>
  <circle cx="128" cy="128" r="124" fill="url(#sheen)"/>
  ${emblem}
  <circle cx="128" cy="128" r="120" fill="none" stroke="#ffffff" stroke-opacity="0.35" stroke-width="4"/>
  <circle cx="128" cy="128" r="124" fill="none" stroke="hsl(330 90% 55%)" stroke-opacity="0.45" stroke-width="3"/>
</svg>`;

  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c] as string)
  );
}
