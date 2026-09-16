import type { Metadata } from "next";
import Link from "next/link";
import { SITE } from "@/lib/site";

export const metadata: Metadata = { title: "Docs" };

export default function DocsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <p className="eyebrow">Docs</p>
      <h1 className="mt-3 font-display text-4xl font-bold text-zinc-900">How {SITE.name} works</h1>
      <p className="mt-4 text-base leading-relaxed text-zinc-600">
        {SITE.name} is a cinematic AI launchpad. You describe a token in one sentence, the AI drafts a
        complete, launch-ready package, and you deploy it to the {SITE.poweredBy} protocol on{" "}
        {SITE.chain} in one click. Every transaction is signed by your own wallet, {SITE.name} never
        holds your funds or keys.
      </p>

      <Toc />

      <Section id="overview" title="Overview">
        <p>
          Launching a token usually means writing a contract, wiring liquidity, drawing a logo, and
          writing all the copy. {SITE.name} collapses that into three steps: <b>describe</b>,{" "}
          <b>review</b>, <b>deploy</b>. The AI handles the creative and configuration work; the chain
          and your wallet handle settlement.
        </p>
      </Section>

      <Section id="how-it-works" title="How it works">
        <Steps
          items={[
            ["Pitch it in a line", "Type one sentence describing your idea. That is the only required input."],
            ["AI drafts the package", "You get a name, ticker, logo, description, lore, a ready-to-post X thread and meme prompts — ready to deploy."],
            ["Review and edit", "Everything is editable, tweak the name, ticker, image (regenerate as an icon or a photo, or upload your own), socials and launch settings."],
            ["Deploy to o1.exchange", "One signed transaction from your wallet launches the token straight onto the o1.exchange protocol. It then shows up in Explore."],
          ]}
        />
      </Section>

      <Section id="models" title="How launches work">
        <p>Every launch on {SITE.chain} goes through o1&apos;s launchpad in one transaction — there is no v1/v2 choice to make.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Card title="One signed transaction" chip="o1 · Arc">
            <ul className="mt-2 space-y-1.5">
              <li>· Deploys a fixed-supply ERC-20 (no mint / pause / blacklist / tax)</li>
              <li>· Creates a Uniswap v4 pool, quoted in USDC</li>
              <li>· Liquidity is permanently locked</li>
              <li>· Tradable straight away</li>
            </ul>
          </Card>
          <Card title="Flat, transparent cost" chip="USDC">
            <ul className="mt-2 space-y-1.5">
              <li>· Flat 2 USDC creation fee, read live from the factory</li>
              <li>· USDC is the settlement asset (Arc&apos;s stable focus)</li>
              <li>· Gas is paid in USDC (Arc&apos;s native currency)</li>
              <li>· Non-custodial: your wallet signs everything</li>
            </ul>
          </Card>
        </div>
      </Section>

      <Section id="rwa" title="Quote pairs">
        <p>
          {SITE.chain} focuses on stable settlement, so v2 pairs your token against USDC, alongside
          native ETH. Only assets the factory has approved on-chain are offered, and native ETH is
          always available.
        </p>
      </Section>

      <Section id="ai-images" title="AI images: icon or photo">
        <p>
          Alongside the text package, {SITE.name} generates token art in two styles: <b>Icon</b> (a
          clean logo mark) and <b>Photo</b> (a photorealistic, cinematic image). Regenerate either on
          demand in the studio, or upload your own image. When no image provider is configured the icon
          falls back to a deterministic mark so the studio always works end to end.
        </p>
      </Section>

      <Section id="fees" title="Fees">
        <p>
          Launching costs a flat <b>2 USDC</b> creation fee, read live from the o1 factory at deploy
          time. {SITE.name} itself does not add a surcharge — you only pay that protocol fee and
          network gas (also paid in USDC on {SITE.chain}).
        </p>
      </Section>

      <Section id="wallet" title="Connecting a wallet">
        <p>
          Click <b>Connect</b> and pick your wallet. A browser wallet (MetaMask or any injected wallet)
          works out of the box. For mobile wallets and the WalletConnect QR, the site operator sets a
          WalletConnect project id. {SITE.name} is non-custodial: connecting only shares your public
          address so transactions can be built for you to sign.
        </p>
      </Section>

      <Section id="safety" title="Safety & non-custodial">
        <p>
          {SITE.name} is a third-party interface to {SITE.poweredBy}, not an official {SITE.poweredBy}{" "}
          product. It never takes custody of assets, and never sees your private keys or seed phrase.
          Transactions are irreversible once signed, and tokens can be highly volatile or lose all
          value. Nothing here is financial advice, do your own research.
        </p>
      </Section>

      <Section id="faq" title="FAQ">
        <Faq q="Do I need to code?" a="No. One sentence is enough; the AI drafts everything and you deploy with one signed transaction." />
        <Faq q="Does CREO hold my tokens or funds?" a="No. It is fully non-custodial. Your wallet signs and submits every transaction directly to the chain." />
        <Faq q="Which chain is this?" a={`${SITE.chain} (Circle). Add it to your wallet and keep some USDC for the launch fee and gas — USDC is Arc's native currency.`} />
        <Faq q="Can I edit what the AI generates?" a="Yes, name, ticker, description, image and socials are all editable before you deploy." />
      </Section>

      <div className="mt-12 flex flex-wrap gap-3">
        <Link href="/create" className="btn-brand">Open the studio →</Link>
        <Link href="/feed" className="btn-ghost">Explore launches</Link>
        <Link href="/analytics" className="btn-ghost">View analytics</Link>
      </div>
    </div>
  );
}

const TOC = [
  ["overview", "Overview"],
  ["how-it-works", "How it works"],
  ["models", "How launches work"],
  ["rwa", "RWA pairs"],
  ["ai-images", "AI images"],
  ["fees", "Fees"],
  ["wallet", "Wallet"],
  ["safety", "Safety"],
  ["faq", "FAQ"],
] as const;

function Toc() {
  return (
    <div className="card mt-8 p-5">
      <p className="eyebrow">On this page</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {TOC.map(([id, label]) => (
          <a key={id} href={`#${id}`} className="chip transition hover:border-black/20 hover:text-zinc-900">
            {label}
          </a>
        ))}
      </div>
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mt-12 scroll-mt-24">
      <h2 className="font-display text-2xl font-bold text-zinc-900">{title}</h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-zinc-600">{children}</div>
    </section>
  );
}

function Steps({ items }: { items: [string, string][] }) {
  return (
    <ol className="mt-4 space-y-3">
      {items.map(([t, d], i) => (
        <li key={t} className="flex gap-3">
          <span className="step-badge">{String(i + 1).padStart(2, "0")}</span>
          <div>
            <p className="font-semibold text-zinc-900">{t}</p>
            <p className="text-sm text-zinc-600">{d}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

function Card({ title, chip, children }: { title: string; chip: string; children: React.ReactNode }) {
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-lg font-bold text-zinc-900">{title}</h3>
        <span className="chip">{chip}</span>
      </div>
      <div className="text-sm text-zinc-600">{children}</div>
    </div>
  );
}

function Faq({ q, a }: { q: string; a: string }) {
  return (
    <details className="card group mt-3 p-4">
      <summary className="cursor-pointer list-none font-semibold text-zinc-900">
        <span className="mr-2 text-pink">+</span>
        {q}
      </summary>
      <p className="mt-2 text-sm text-zinc-600">{a}</p>
    </details>
  );
}
