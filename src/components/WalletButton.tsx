"use client";

import { useEffect, useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";

/**
 * Wallet button - opens RainbowKit's polished connect modal (MetaMask ·
 * Browser Wallet · Rainbow · WalletConnect).
 *
 * IMPORTANT: RainbowKit is rendered client-side only, after mount. Its internal
 * transaction store reads `client.uid` as soon as a RainbowKit component
 * renders; during SSR / first hydration the wagmi client isn't ready, so that
 * read throws "undefined is not an object (evaluating 'e.uid')" and the root
 * error boundary blanks the whole app (this is why it crashed on real mobile
 * Safari). Because our header renders this on every route, we must not let
 * RainbowKit render until the client exists. A plain placeholder holds the
 * layout until then.
 *
 *  - variant "inline": text-style item for the desktop nav pill.
 *  - variant "solid":  compact pink button for mobile.
 */
export function WalletButton({ variant = "solid" }: { variant?: "inline" | "solid" }) {
  const inline = variant === "inline";
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const connectCls = inline
    ? "rounded-full px-4 py-2 text-sm font-semibold text-pink transition hover:text-zinc-900"
    : "btn-brand !px-4 !py-2";

  // Server render + first client render: a static, RainbowKit-free placeholder.
  if (!mounted) {
    return (
      <div aria-hidden style={{ opacity: 0, pointerEvents: "none" }}>
        <button type="button" className={connectCls}>Connect</button>
      </div>
    );
  }

  return (
    <ConnectButton.Custom>
      {({ account, chain, openConnectModal, openAccountModal, openChainModal, mounted: rkMounted }) => {
        const ready = rkMounted;
        const connected = ready && account && chain;
        return (
          <div
            {...(!ready && { "aria-hidden": true, style: { opacity: 0, pointerEvents: "none" } })}
          >
            {!connected ? (
              <button type="button" className={connectCls} onClick={openConnectModal}>
                Connect
              </button>
            ) : chain.unsupported ? (
              <button
                type="button"
                onClick={openChainModal}
                className="rounded-full border border-amber-400/50 bg-amber-400/15 px-3.5 py-2 text-sm font-semibold text-amber-700 transition hover:bg-amber-400/25"
              >
                Switch to Robinhood
              </button>
            ) : (
              <button
                type="button"
                onClick={openAccountModal}
                className="inline-flex items-center gap-2 rounded-full bg-zinc-900 py-2 pl-3 pr-3.5 text-sm font-medium text-white transition hover:bg-zinc-800"
              >
                {account.displayBalance && (
                  <>
                    <span className="hidden font-mono text-pink sm:inline">
                      {account.displayBalance}
                    </span>
                    <span className="hidden h-3 w-px bg-white/20 sm:inline" />
                  </>
                )}
                <span className="inline-flex items-center gap-1.5 font-mono">
                  <span className="h-2 w-2 rounded-full bg-pink shadow-[0_0_8px_#e0532a]" />
                  {account.displayName}
                </span>
              </button>
            )}
          </div>
        );
      }}
    </ConnectButton.Custom>
  );
}
