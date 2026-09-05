import type { Metadata } from "next";
import { SITE } from "@/lib/site";

export const metadata: Metadata = { title: "Terms of Use" };

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <p className="eyebrow">Legal</p>
      <h1 className="mt-3 font-display text-4xl font-bold text-zinc-900">Terms of Use</h1>

      <div className="mt-8 space-y-6 text-sm leading-relaxed text-zinc-600">
        <p>
          {SITE.name} is a non-custodial, third-party interface to the {SITE.poweredBy} protocol on{" "}
          {SITE.chain}. By using it you agree to these terms. If you do not agree, do not use the site.
        </p>
        <section>
          <h2 className="font-display text-lg font-semibold text-zinc-900">No custody, no advice</h2>
          <p className="mt-2">
            You interact with the blockchain directly through your own wallet. {SITE.name} does not hold
            your assets and does not provide financial, investment, legal, or tax advice. Nothing here is
            an offer or solicitation.
          </p>
        </section>
        <section>
          <h2 className="font-display text-lg font-semibold text-zinc-900">Assumption of risk</h2>
          <p className="mt-2">
            Transactions are submitted through your wallet and may be irreversible. Tokens can be highly
            volatile and may lose all value. Smart contracts may contain bugs. You are solely responsible
            for your decisions and for complying with the laws that apply to you.
          </p>
        </section>
        <section>
          <h2 className="font-display text-lg font-semibold text-zinc-900">No warranty</h2>
          <p className="mt-2">
            The interface is provided &quot;as is&quot;, without warranties of any kind. To the maximum
            extent permitted by law, {SITE.company} is not liable for any losses arising from your use
            of {SITE.name} or the underlying protocol.
          </p>
        </section>
        <p className="text-zinc-500">
          This page is provided for transparency and is not legal advice.
        </p>
      </div>
    </div>
  );
}
