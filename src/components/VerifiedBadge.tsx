/**
 * Official token check badge - gold/yellow, like a verified org mark. Scales
 * with the surrounding text (≈1em) so it sits inline next to a token name.
 */
export function VerifiedBadge({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      role="img"
      aria-label="Official token"
      className={`inline-block h-[1em] w-[1em] shrink-0 align-middle ${className ?? ""}`}
    >
      <title>Official</title>
      <defs>
        <linearGradient id="creo-verified-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffe37a" />
          <stop offset="0.5" stopColor="#f5c518" />
          <stop offset="1" stopColor="#e0a800" />
        </linearGradient>
      </defs>
      <circle cx="12" cy="12" r="11" fill="url(#creo-verified-gold)" />
      <path
        d="M6.8 12.4 l3.4 3.4 L17.2 8.4"
        fill="none"
        stroke="#fff"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
