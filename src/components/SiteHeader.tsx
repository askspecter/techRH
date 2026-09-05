"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Logo } from "./Logo";
import { WalletButton } from "./WalletButton";
import { SITE, NAV } from "@/lib/site";

export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const isActive = (href: string) => pathname === href;

  return (
    <header className="sticky top-0 z-40 border-b border-ink-line bg-ink-900/70 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
        {/* Brand */}
        <Link href="/" className="group flex shrink-0 items-center gap-2.5">
          <Logo className="h-8 w-8 transition group-hover:scale-105" />
          <span className="wordmark text-lg text-zinc-900">{SITE.name}</span>
          <span className="hidden rounded-full border border-ink-line px-2 py-0.5 text-[10px] font-medium text-zinc-500 sm:inline">
            on {SITE.poweredBy}
          </span>
        </Link>

        {/* Desktop: one segmented pill with links + Connect */}
        <nav className="hidden items-center gap-1 rounded-full border border-ink-line bg-white/60 p-1 shadow-sm backdrop-blur md:flex">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                isActive(item.href)
                  ? "bg-zinc-900 text-white shadow"
                  : "text-pink hover:text-zinc-900"
              }`}
            >
              {item.label}
            </Link>
          ))}
          <span className="mx-1 h-5 w-px bg-black/10" aria-hidden />
          <WalletButton variant="inline" />
        </nav>

        {/* Mobile: Connect + hamburger */}
        <div className="flex shrink-0 items-center gap-2 md:hidden">
          <WalletButton variant="solid" />
          <button
            onClick={() => setOpen((o) => !o)}
            aria-label="Menu"
            aria-expanded={open}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-ink-line bg-white/60 text-zinc-800 transition hover:bg-white"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile dropdown sheet */}
      {open && (
        <div className="md:hidden">
          <nav className="mx-4 mb-3 grid gap-1 rounded-2xl border border-ink-line bg-white/80 p-2 shadow-card backdrop-blur-xl">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={`rounded-xl px-4 py-3 text-sm font-semibold transition ${
                  isActive(item.href) ? "bg-zinc-900 text-white" : "text-zinc-800 hover:bg-black/[0.05]"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      )}
    </header>
  );
}
