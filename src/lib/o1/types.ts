import type { Address, Hex } from "viem";

/** The `LaunchParams` tuple the o1 factory's createLaunch / launchTokenBytecodeHash take. */
export type O1LaunchParams = {
  tokenName: string;
  tokenSymbol: string;
  tokenContractURI: string;
  creatorSalt: Hex;
  quoteToken: Address;
  expectedConfigVersion: bigint;
  deadline: bigint;
  metadataEditable: boolean;
  metadataKeys: readonly string[];
  metadataValues: readonly string[];
};

/** Live, mutually-consistent factory config read at one block. */
export type FactoryState = {
  configVersion: bigint;
  launchSupply: bigint;
  tickSpacing: number;
  nativeLaunchFee: bigint;
  launchCreationEnabled: boolean;
  tokenAddressSuffix: number;
  tokenDeployer: Address;
  hook: Address;
};

export type QuoteState = {
  registered: boolean;
  quoteDecimals: number;
  startTickToken0Frame: number;
  revision: bigint;
};
