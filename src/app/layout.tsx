import type { Metadata, Viewport } from "next";
import "@rainbow-me/rainbowkit/styles.css"; // REQUIRED, before globals - styles the connect modal
import "./globals.css";
import { Providers } from "./providers";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { WalletGate } from "@/components/WalletGate";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: {
    default: `${SITE.name} - cinematic AI launchpad`,
    template: `%s · ${SITE.name}`,
  },
  description: SITE.description,
  applicationName: SITE.name,
  openGraph: {
    title: `${SITE.name} - cinematic AI launchpad`,
    description: SITE.description,
    type: "website",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#fff7ee",
};

// Render at request time, not static export. RainbowKit's config throws
// "reading 'uid'" during Next's static prerender step - and Vercel restores a
// build cache that can reintroduce old chunks - so skip prerender entirely.
// This is a build/server-render concern only; the mobile crash was stale client
// storage, handled by the reset script below.
export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/*
          One-time cleanup of stale wallet state. Earlier broken deploys wrote
          wagmi / WalletConnect / RainbowKit data to localStorage in shapes that
          the current setup can't rehydrate - on real mobile Safari that threw in
          the providers and white-screened the whole app. This runs before React
          hydrates and, once per version, drops any old wallet keys so RainbowKit
          always starts clean. (A fresh browser was never affected, which is why
          it only reproduced on phones that had visited before.)
        */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var V='creo-wallet-reset-1';if(localStorage.getItem('creo.walletReset')===V)return;var kill=/^(wagmi|wc@2|walletconnect|WALLETCONNECT|rk-|@rainbow|creo\\.wagmi|W3M|WCM|@w3m|@appkit|reown|@reown|CBWSDK|-walletlink)/i;Object.keys(localStorage).forEach(function(k){if(kill.test(k))localStorage.removeItem(k)});localStorage.setItem('creo.walletReset',V)}catch(e){}})();",
          }}
        />
        {/*
          Fonts are loaded at runtime by the browser (not fetched at build),
          so a build never depends on reaching Google Fonts. The CSS variables
          in globals.css list a full system fallback stack, so the site looks
          right even if these never load.
        */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Orbitron:wght@700;800;900&family=Space+Grotesk:wght@500;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <div className="cinema-bg" aria-hidden />
        <div className="grain" aria-hidden />
        <Providers>
          <div className="flex min-h-dvh flex-col overflow-x-hidden">
            <SiteHeader />
            <main className="flex-1">{children}</main>
            <SiteFooter />
          </div>
          <WalletGate />
        </Providers>
      </body>
    </html>
  );
}
