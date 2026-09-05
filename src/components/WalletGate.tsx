"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAccount, useDisconnect } from "wagmi";
import { SITE } from "@/lib/site";

// Acceptance is stored per wallet address (like Pons — "using pons with this
// wallet"), so the gate reappears for each new wallet. v2 key: it intentionally
// supersedes the old browser-wide v1 flag, so the gate shows again for everyone.
const keyFor = (address: string) => `creo:accepted:v2:${address.toLowerCase()}`;

/**
 * First-time connect gate (like Pons): the first time a given wallet connects,
 * the user must accept the Terms of Use and Privacy Policy before using the app.
 * Remembered per wallet address, so it only appears once per wallet.
 */
export function WalletGate() {
  const { isConnected, address } = useAccount();
  const { disconnect } = useDisconnect();
  const [mounted, setMounted] = useState(false);
  const [accepted, setAccepted] = useState(true);
  const [terms, setTerms] = useState(false);
  const [privacy, setPrivacy] = useState(false);

  useEffect(() => setMounted(true), []);

  // Re-check acceptance whenever the connected wallet changes, and reset the
  // checkboxes so a newly connected wallet starts unticked.
  useEffect(() => {
    if (!address) {
      setAccepted(true);
      return;
    }
    try {
      setAccepted(localStorage.getItem(keyFor(address)) === "1");
    } catch {
      setAccepted(false);
    }
    setTerms(false);
    setPrivacy(false);
  }, [address]);

  if (!mounted || !isConnected || !address || accepted) return null;

  function accept() {
    try {
      if (address) localStorage.setItem(keyFor(address), "1");
    } catch {}
    setAccepted(true);
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 p-4 backdrop-blur-sm sm:items-center">
      <div className="card w-full max-w-md overflow-hidden p-6 sm:p-7">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-glow">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/creo-logo.jpg" alt="CREO" className="h-9 w-9 object-contain" />
        </div>

        <div className="flex items-center gap-2">
          <h2 className="font-display text-2xl font-bold text-zinc-900">Review and accept</h2>
          <span className="chip chip-accent">Required</span>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-zinc-600">
          Before using {SITE.name} with this wallet, you must review and accept the current Terms of
          Use and Privacy Policy. You also confirm that you are not located in a restricted
          jurisdiction.
        </p>

        <label className="mt-5 flex cursor-pointer items-center gap-3 rounded-xl border border-ink-line bg-white/60 p-3 text-sm text-zinc-700">
          <input
            type="checkbox"
            checked={terms}
            onChange={(e) => setTerms(e.target.checked)}
            className="h-5 w-5 accent-pink"
          />
          <span>
            I have read and accept the{" "}
            <Link href="/terms" target="_blank" className="font-semibold text-pink underline underline-offset-2">
              Terms of Use
            </Link>
            .
          </span>
        </label>
        <label className="mt-3 flex cursor-pointer items-center gap-3 rounded-xl border border-ink-line bg-white/60 p-3 text-sm text-zinc-700">
          <input
            type="checkbox"
            checked={privacy}
            onChange={(e) => setPrivacy(e.target.checked)}
            className="h-5 w-5 accent-pink"
          />
          <span>
            I have read and accept the{" "}
            <Link href="/privacy" target="_blank" className="font-semibold text-pink underline underline-offset-2">
              Privacy Policy
            </Link>
            .
          </span>
        </label>

        <div className="mt-6 flex items-center gap-3">
          <button className="btn-brand flex-1 disabled:opacity-40" disabled={!terms || !privacy} onClick={accept}>
            Accept and continue
          </button>
          <button className="btn-ghost" onClick={() => disconnect()}>
            Disconnect wallet
          </button>
        </div>
      </div>
    </div>
  );
}
