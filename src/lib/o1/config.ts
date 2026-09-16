/**
 * o1 Launchpad — Arc mainnet (chain id 5042), `launchpad-v4-minimal` suite.
 *
 * Addresses and quote config are the dated snapshot from o1's official
 * production deployment (docs.o1.exchange/launchpad/reference and the o1Bot
 * config). They are ONLY a starting point: prepareArcLaunch reads the live
 * factory (configVersion, nativeLaunchFee, launchCreationEnabled, quoteConfig,
 * tokenDeployer, hook) at execution time and never trusts these numbers alone.
 */
export const ARC = {
  chainId: 5042,
  explorer: "https://arc-scan.org",
  /** Public RPC o1's own bot uses (no key). Override with NEXT_PUBLIC_RPC_URL. */
  rpcUrl: "https://rpc.arc-scan.org",
  suiteId: "arc-mainnet-launchpad-v4-minimal",
  contracts: {
    factory: "0xeE3E862Efde6DCd6DF5648AF0E2731B9D1dF4605",
    hook: "0x20EEad6db6b3d0a4491E9073119DD0EBFF166AcC",
    feeEscrow: "0x1D8c991A9019df7D72ADCd8deA6f12D600C9d02f",
    launchTokenDeployer: "0xFf70918Ef17A2D74d683a8297813B177BaFaD1f4",
    announcementRegistry: "0xD4942511A1587Ac3F1F0f4097e18D4BCEe73d753",
    launchBuyAdapter: "0xacA9150b1ecAeddEf5cF6a24f12b060049Cec06f",
  },
  /** The only registered paired asset on Arc: native/ERC-20 USDC. */
  usdc: {
    symbol: "USDC",
    /** ERC-20 view of USDC (6 decimals) — the registered quote token. */
    erc20: "0x3600000000000000000000000000000000000000",
    erc20Decimals: 6,
    /** Native USDC (gas + launch fee) uses 18 decimals. */
    nativeDecimals: 18,
  },
  /**
   * Candidate paired/quote assets. A quote is only usable once o1 registers it
   * on the factory on-chain (quoteConfig.registered === true) — /api/o1/quotes
   * checks each one live, so a newly-unlocked pair (e.g. cirBTC) appears
   * automatically with no code change, and an unregistered one stays locked
   * instead of letting a launch revert.
   */
  quoteCandidates: [
    { symbol: "USDC", address: "0x3600000000000000000000000000000000000000", decimals: 6, note: "Circle USDC" },
    { symbol: "cirBTC", address: "0x171A4217b86A807A64eB94757Db6849fb4bDbAA0", decimals: 8, note: "Circle-issued BTC" },
  ] as { symbol: string; address: string; decimals: number; note: string }[],
  /** o1 requires the launched token address to end in this byte. */
  tokenAddressSuffix: 1,
  /**
   * Arc converts a native-USDC buy amount to 6-decimal USDC and reverts on
   * anything finer than 1e12 native (18-dec) units, so a dev-buy amount must be
   * a multiple of this. (config/o1.json → chains.arc.swapX.nativeUsdcScale)
   */
  nativeUsdcScale: 1_000_000_000_000n,
} as const;

export type ArcContracts = typeof ARC.contracts;
