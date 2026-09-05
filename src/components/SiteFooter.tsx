import Link from "next/link";
import { Logo } from "./Logo";
import { SITE } from "@/lib/site";

const PRODUCT = [
  { href: "/feed", label: "Explore" },
  { href: "/analytics", label: "Analytics" },
  { href: "/create", label: "Create" },
  { href: "/docs", label: "Docs" },
] as const;

const LEGAL = [
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/terms", label: "Terms of Use" },
] as const;

export function SiteFooter() {
  const year = new Date().getFullYear();

  const links = [...PRODUCT, ...LEGAL];

  return (
    <footer className="mt-16 px-4 pb-8">
      <div className="mx-auto max-w-6xl card p-6 sm:p-8">
        {/* Brand + blurb */}
        <div className="flex items-center gap-2">
          <Logo className="h-7 w-7" />
          <span className="wordmark text-xl text-zinc-900">{SITE.name}</span>
        </div>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-zinc-500">
          Launch and explore AI-generated tokens on {SITE.chain}. Your wallet submits every
          transaction. {SITE.name} does not custody assets.
        </p>

        {/* Links — one compact row */}
        <nav className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="text-zinc-600 transition hover:text-zinc-900">
              {l.label}
            </Link>
          ))}
        </nav>

        {/* Risk notice */}
        <p className="mt-5 max-w-3xl text-xs leading-relaxed text-zinc-400">
          {SITE.name} is a non-custodial, third-party interface to the {SITE.poweredBy} protocol.
          Transactions may be irreversible and tokens can lose all value. {SITE.name} provides no
          custody, warranties, or financial advice, and is not an official {SITE.poweredBy} product.
        </p>

        {/* Bottom row */}
        <div className="mt-6 flex items-center justify-between gap-4 border-t border-ink-line pt-5">
          <p className="text-xs text-zinc-500">© {year} {SITE.company}</p>
          <div className="flex items-center gap-3">
            <a
              href={SITE.x}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-zinc-600 underline-offset-4 transition hover:text-zinc-900 hover:underline"
            >
              {SITE.xHandle}
            </a>
            <a
              href={SITE.x}
              target="_blank"
              rel="noreferrer"
              aria-label={`${SITE.name} on X`}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-ink-line text-zinc-700 transition hover:border-black/15 hover:bg-black/[0.05] hover:text-zinc-900"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
