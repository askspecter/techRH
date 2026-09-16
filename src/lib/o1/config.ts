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
  /** o1 requires the launched token address to end in this byte. */
  tokenAddressSuffix: 1,
} as const;

export type ArcContracts = typeof ARC.contracts;
