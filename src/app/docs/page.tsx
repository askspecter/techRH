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
            ["AI drafts the package", "You get a name, ticker, logo, description, lore, a ready-to-post X thread and meme prompts, plus a recommended launch model."],
            ["Review and edit", "Everything is editable, tweak the name, ticker, image (regenerate as an icon or a photo, or upload your own), socials and launch settings."],
            ["Deploy to Pons", "One signed transaction from your wallet launches the token straight onto the Pons protocol. It then shows up in Explore."],
          ]}
        />
      </Section>

      <Section id="models" title="Launch models: v1 vs v2">
        <p>Pons offers two launch models. The AI recommends one, but you always choose.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Card title="v1 · Instant Pool" chip="open">
            <ul className="mt-2 space-y-1.5">
              <li>· One tx deploys the token + a Uniswap V3 pool</li>
              <li>· Pool is locked immediately, quoted in WETH</li>
              <li>· Tradable from block one</li>
              <li>· Fixed supply, 1% pool fee</li>
              <li>· Flat 0.0005 ETH launch fee</li>
              <li>· Open to everyone, no whitelist</li>
            </ul>
          </Card>
          <Card title="v2 · Bonding Curve" chip="RWA pairs">
            <ul className="mt-2 space-y-1.5">
              <li>· Fair launch on a bonding curve</li>
              <li>· Graduates into a locked Uniswap V4 pool</li>
              <li>· Pair vs ETH or tokenized stocks</li>
              <li>· Creators are paid in ETH</li>
              <li>· Optional protocol buyback</li>
              <li>· May be whitelist-gated while in audit</li>
            </ul>
          </Card>
        </div>
        <p className="mt-4">
          <b>Which should I pick?</b> Choose v1 when immediate tradability matters. Choose v2 for a
          fair launch, or when your theme maps to a real-world asset (a markets or stocks angle pairs
          nicely with an RWA quote asset).
        </p>
      </Section>

      <Section id="rwa" title="RWA quote pairs">
        <p>
          v2 can pair your token against tokenized real-world assets on {SITE.chain}, alongside ETH and
          USDG, so a launch can settle against names like NVDA, AAPL, TSLA, HOOD, COIN, META, AMZN,
          MSFT, GOOGL and SPY. Only assets the factory has approved on-chain are offered, and native
          ETH is always available.
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
          v1 charges a flat <b>0.0005 ETH</b> launch fee plus a 1% pool fee on trades. v2 reads its
          launch fee live from the factory at deploy time and shows it before you sign. {SITE.name}{" "}
          itself does not add a surcharge, you only pay the protocol fee and network gas.
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
        <Faq q="Which chain is this?" a={`${SITE.chain}. Add it to your wallet and make sure you have ETH for gas and fees.`} />
        <Faq q="Can I edit what the AI generates?" a="Yes, name, ticker, description, image, socials and launch settings are all editable before you deploy." />
        <Faq q="Why is v2 sometimes restricted?" a="v2 public launches can be whitelist-gated while audits are in progress. The studio surfaces this before you sign." />
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
  ["models", "v1 vs v2"],
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
