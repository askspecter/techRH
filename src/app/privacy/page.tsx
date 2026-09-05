import type { Metadata } from "next";
import { SITE } from "@/lib/site";

export const metadata: Metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <p className="eyebrow">Legal</p>
      <h1 className="mt-3 font-display text-4xl font-bold text-zinc-900">Privacy Policy</h1>

      <div className="mt-8 space-y-6 text-sm leading-relaxed text-zinc-600">
        <p>
          {SITE.name} is a non-custodial interface. We do not collect personal information, create
          accounts, or take custody of any funds. Connecting a wallet exposes only your public address,
          which is used to build transactions your wallet signs.
        </p>
        <section>
          <h2 className="font-display text-lg font-semibold text-zinc-900">What we process</h2>
          <p className="mt-2">
            Public on-chain data (wallet address, transactions) needed to build launches, and the text
            prompt you submit, which is sent to an AI provider to generate your launch package. Optional
            token images you upload are stored to display them in the feed.
          </p>
        </section>
        <section>
          <h2 className="font-display text-lg font-semibold text-zinc-900">What we do not do</h2>
          <p className="mt-2">
            We do not sell data, run advertising trackers, or store private keys or seed phrases,{" "}
            {SITE.name} never has access to them.
          </p>
        </section>
        <section>
          <h2 className="font-display text-lg font-semibold text-zinc-900">Third parties</h2>
          <p className="mt-2">
            Wallet connectors, RPC endpoints, the {SITE.poweredBy} protocol, and AI providers each
            handle data under their own terms. On-chain activity is public and permanent.
          </p>
        </section>
        <p className="text-zinc-500">
          This page is provided for transparency and is not legal advice.
        </p>
      </div>
    </div>
  );
}
