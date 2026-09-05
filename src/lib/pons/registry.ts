import type { PonsVersion } from "./types";

/**
 * ─────────────────────────────────────────────────────────────────────────
 *  Pons contract registry
 * ─────────────────────────────────────────────────────────────────────────
 *  v1 addresses below are the OFFICIAL, verified deployments on Robinhood
 *  Chain (from docs.ponsfamily.com). v2 stays as env-config until its own
 *  official addresses/ABI are wired in.
 *
 *  DEPLOY SAFETY: having a factory address is NOT enough to deploy. The
 *  token-creating write function `launch()` is not in the public read docs,
 *  so `launchAbiVerified` stays false until the real ABI is added to
 *  ponsV1LaunchAbi. buildLaunchTx() refuses to run until then - we never
 *  fabricate calldata.
 * ─────────────────────────────────────────────────────────────────────────
 */

/** Verified v1 deployment on Robinhood Chain (docs.ponsfamily.com). */
export const PONS_V1 = {
  // Correct, verified v1 factory on Robinhood Chain (provided by the project owner).
  activeFactory: "0xf4fc0cd27fc8ecf17e55ee4c3f7201897df3eb75" as `0x${string}`,
  activeFactoryStartBlock: 8991118n,
  activeLocker: "0x736D76699C26D0d966744cAe304C000d471f7F35" as `0x${string}`,
  legacyFactory: "0x0c37a24F5D23A486FA692d1500881d698B1F77a4" as `0x${string}`,
  legacyFactoryStartBlock: 8600612n,
  legacyLocker: "0x31ca5E101941A93A7DD6d0497928700625CF54B5" as `0x${string}`,
  v3Factory: "0x1f7d7550B1b028f7571E69A784071F0205FD2EfA" as `0x${string}`,
  positionManager: "0x73991a25C818Bf1f1128dEAaB1492D45638DE0D3" as `0x${string}`,
  swapRouter: "0xCaf681a66D020601342297493863E78C959E5cb2" as `0x${string}`,
  quoterV2: "0x33e885eD0Ec9bF04EcfB19341582aADCb4c8A9E7" as `0x${string}`,
  weth: "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73" as `0x${string}`,
  poolFee: 10000, // 1%
  launchFeeWei: 500_000_000_000_000n, // 0.0005 ETH
  supply: 1_000_000_000n * 10n ** 18n, // 1e9 * 1e18
  topics: {
    tokenLaunched: "0xdb51ea9ad51ab453a65a4cb7e60c3cb378c9501bb002609f8f97778fb6c4235a",
    swap: "0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67",
  },
} as const;

/**
 * Verified v2 deployment on Robinhood Chain (docs.ponsfamily.com/v2).
 * Resolve each launch's own curve/token from the factory (created per launch).
 * NOTE: v2 is deployed but UNAUDITED, and public launches are closed
 * (whitelist only) - always check canLaunch(address) before deploy.
 */
export const PONS_V2 = {
  factory: "0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e" as `0x${string}`,
  memeHook: "0xE5e702641Ea86F4ae6cC3cDaeD2B886f976Be044" as `0x${string}`,
  feeEscrow: "0xd3AFEB2a57f70eF218Aa82451c51B2fb0416Ac9e" as `0x${string}`,
  buybackVault: "0x42df2a798f82289E177311362e8f5ccC45c1219c" as `0x${string}`,
  launchLocker: "0x267444D099b10fB5Ed7c3Cc7B7c767AdcA574952" as `0x${string}`,
  launchAndBuy: "0xe33E9E479dF8802cb0866d5d05258bEc4cF62948" as `0x${string}`,
  launchDeployer: "0x3711ceA4feaDE896C913C68F01Eda97Cb06D1A42" as `0x${string}`,
  graduationExecutor: "0xC7819B64A1dAECD7eC19856d026cb14EfBd89046" as `0x${string}`,
  graduationGuard: "0xf5695117b99B6f6401e67d4195BD653628176C6C" as `0x${string}`,
} as const;

/** Known reference token for validating an indexer/integration. */
export const PONS_V1_REFERENCE = {
  token: "0x39dBED3a2bd333467115dE45665cC57F813C4571" as `0x${string}`,
  pool: "0x10CC6BD38112cAc182db90B6a71d8Bb5939526bA" as `0x${string}`,
  launchTx: "0x1f54f25fec2d963dcb338ecb8b46a6eb123198a5c7a746d34cb2dbe78d074af8" as `0x${string}`,
} as const;

export interface PonsVersionConfig {
  /** Launch factory address (env override wins). */
  factory: `0x${string}` | "";
  /** Name of the launch write function (verify against real ABI). */
  launchFn: string;
  /** Flat fee charged at launch, in wei. */
  launchFeeWei: bigint;
  /** true only once the real launch() ABI is wired → enables deploy. */
  launchAbiVerified: boolean;
}

export const REGISTRY: Record<PonsVersion, PonsVersionConfig> = {
  v1: {
    factory: (process.env.NEXT_PUBLIC_PONS_V1_FACTORY as `0x${string}`) || PONS_V1.activeFactory,
    launchFn: "launchToken",
    launchFeeWei: PONS_V1.launchFeeWei,
    // launchToken() write ABI is verified (see abis.ts v1LaunchAbi) → deploy on.
    launchAbiVerified: true,
  },
  v2: {
    factory: (process.env.NEXT_PUBLIC_PONS_V2_FACTORY as `0x${string}`) || PONS_V2.factory,
    launchFn: "launchToken",
    // launchFee is read live from the factory (launchFee()); not a constant.
    launchFeeWei: 0n,
    // v2 launchToken() ABI is verified from official docs → deploy enabled.
    launchAbiVerified: true,
  },
};

/**
 * ERC-20 quote-token addresses on Robinhood Chain (provided by the project
 * owner). These are offered as v2 quote assets ONLY after being validated live
 * against the factory (approvedPairTokens + pairTokenEconomics) - an asset the
 * factory hasn't approved is never shown, so a launch can't settle on it.
 * Extra addresses can still be appended via NEXT_PUBLIC_V2_PAIR_TOKENS.
 */
export const V2_QUOTE_TOKENS: { symbol: string; name: string; address: `0x${string}` }[] = [
  { symbol: "USDG", name: "Global Dollar", address: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168" },
  { symbol: "NVDA", name: "NVIDIA", address: "0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC" },
  { symbol: "SPCX", name: "SpaceX Class A", address: "0x4a0E65A3EcceC6dBe60AE065F2e7bb85Fae35eEa" },
  { symbol: "GOOGL", name: "Alphabet Class A", address: "0x2e0847E8910a9732eB3fb1bb4b70a580ADAD4FE3" },
  { symbol: "TSLA", name: "Tesla", address: "0x322F0929c4625eD5bAd873c95208D54E1c003b2d" },
  { symbol: "GME", name: "GameStop", address: "0x1b0E319c6A659F002271B69dB8A7df2F911c153E" },
  { symbol: "AAPL", name: "Apple", address: "0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9" },
  { symbol: "SPY", name: "S&P 500 ETF", address: "0x117cc2133c37B721F49dE2A7a74833232B3B4C0C" },
  { symbol: "SNDK", name: "SanDisk", address: "0xB90A19fF0Af67f7779afF50A882A9CfF42446400" },
  { symbol: "AMD", name: "Advanced Micro Devices", address: "0x86923f96303D656E4aa86D9d42D1e57ad2023fdC" },
  { symbol: "AMZN", name: "Amazon", address: "0x12f190a9F9d7D37a250758b26824B97CE941bF54" },
  { symbol: "MSFT", name: "Microsoft", address: "0xe93237C50D904957Cf27E7B1133b510C669c2e74" },
  { symbol: "META", name: "Meta Platforms", address: "0xc0D6457C16Cc70d6790Dd43521C899C87ce02f35" },
  { symbol: "CRCL", name: "Circle", address: "0xdF0992E440dD0be65BD8439b609d6D4366bf1CB5" },
  { symbol: "COIN", name: "Coinbase", address: "0x6330D8C3178a418788dF01a47479c0ce7CCF450b" },
  { symbol: "MU", name: "Micron", address: "0xfF080c8ce2E5feadaCa0Da81314Ae59D232d4afD" },
  { symbol: "PLTR", name: "Palantir", address: "0x894e1ec2d74ffe5aef8dc8a9e84686accb964f2a" },
];

/** v2 graduation threshold in ETH (from Pons v2 docs). */
export const V2_GRADUATION_THRESHOLD_ETH = 4.2;

/** A version is deployable only when its factory AND its launch ABI are set. */
export function isVersionDeployable(version: PonsVersion): boolean {
  const cfg = REGISTRY[version];
  return cfg.factory !== "" && cfg.launchAbiVerified;
}

/** Kept for older imports: does the registry know a factory for this version? */
export function isVersionWired(version: PonsVersion): boolean {
  return REGISTRY[version].factory !== "";
}
