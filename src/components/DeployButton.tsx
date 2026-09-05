"use client";

import { useState } from "react";
import { useAccount, usePublicClient, useSwitchChain, useWriteContract } from "wagmi";
import { BaseError, ContractFunctionRevertedError, parseEventLogs, type Abi } from "viem";
import { getStrategy, type LaunchInput } from "@/lib/pons";
import { toOnchainLogo } from "@/lib/upload";
import { v2TokenLaunchedEvent } from "@/lib/pons/abisV2";
import { tokenLaunchedEvent } from "@/lib/pons/abis";
import { robinhoodChain, explorerTx } from "@/lib/chain";

/**
 * Deploy path is engine logic (unchanged from the reference): the active
 * Pons strategy prepares a plan, the user's wallet signs writeContract, then
 * we parse the receipt for the new token address and record it to the feed.
 * Only the presentation here is CREO's.
 */
export function DeployButton({ input, disabled }: { input: LaunchInput; disabled?: boolean }) {
  const { address, isConnected, chainId } = useAccount();
  const publicClient = usePublicClient();
  const { switchChainAsync, isPending: switching } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const [status, setStatus] = useState<"idle" | "preparing" | "signing" | "sent" | "error">("idle");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  const strategy = getStrategy(input.version);
  const ready = strategy.info().ready;

  async function recordLaunch(hash: `0x${string}`) {
    try {
      if (!publicClient || !address) return;
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      const logs = [
        ...parseEventLogs({ abi: [v2TokenLaunchedEvent], logs: receipt.logs }),
        ...parseEventLogs({ abi: [tokenLaunchedEvent], logs: receipt.logs }),
      ];
      const ev = logs.find((l) => (l.args as { token?: string })?.token);
      const args = ev?.args as { token?: string; curve?: string } | undefined;
      if (!args?.token) return;
      await fetch("/api/launches", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          token: args.token,
          curve: args.curve,
          version: input.version,
          name: input.name,
          symbol: input.ticker,
          logo: input.imageUri,
          twitter: input.twitter,
          telegram: input.telegram,
          website: input.website,
          deployer: address,
          txHash: hash,
        }),
      });
    } catch {
      // best-effort: the feed record is non-critical
    }
  }

  // Pull the most specific revert reason out of a viem error (custom error
  // name, revert string, or short message) so the user sees the real cause.
  function revertReason(err: unknown): string {
    if (err instanceof BaseError) {
      const revert = err.walk((e) => e instanceof ContractFunctionRevertedError);
      if (revert instanceof ContractFunctionRevertedError) {
        const name = revert.data?.errorName;
        if (name) return `${name}${revert.reason ? ` - ${revert.reason}` : ""}`;
        if (revert.reason) return revert.reason;
      }
      return err.shortMessage || err.message;
    }
    return err instanceof Error ? err.message.split("\n")[0] : "unknown error";
  }

  async function deploy() {
    setError(null);
    setWarnings([]);
    if (!address) return;
    try {
      if (chainId !== robinhoodChain.id) {
        try {
          await switchChainAsync({ chainId: robinhoodChain.id });
        } catch {
          throw new Error(
            `Your wallet must be on ${robinhoodChain.name} (chain ${robinhoodChain.id}). ` +
              `Switch networks in your wallet - this is an EVM chain, not Solana - then try again.`
          );
        }
      }
      setStatus("preparing");
      // On-chain metadata must be short - a data-URI logo (e.g. AI-generated)
      // makes the factory revert with MetadataTooLong(). Replace it with a short
      // stored URL, and keep the description within a safe length.
      const onchainLogo = await toOnchainLogo(input.imageUri);
      const safeInput: LaunchInput = {
        ...input,
        imageUri: onchainLogo,
        description: (input.description ?? "").slice(0, 500),
      };
      const plan = await strategy.prepareLaunch(safeInput, address);
      setWarnings(plan.warnings);

      // Pre-flight: simulate against the chain to surface the EXACT revert
      // reason (no gas spent) instead of a mystery failure. This only BLOCKS on
      // a genuine on-chain revert; a network/RPC error (e.g. the public RPC
      // rejecting a browser call - "Load failed") is not a revert, so we skip
      // the pre-flight and let the wallet submit and do its own checks.
      if (publicClient) {
        try {
          await publicClient.simulateContract({
            account: address,
            address: plan.address,
            abi: plan.abi as Abi,
            functionName: plan.functionName,
            args: plan.args as unknown[],
            value: plan.value,
          });
        } catch (simErr) {
          const isRevert =
            simErr instanceof BaseError &&
            !!simErr.walk((e) => e instanceof ContractFunctionRevertedError);
          if (isRevert) {
            throw new Error("This launch would revert on-chain. Reason: " + revertReason(simErr));
          }
          // Network / RPC error: skip pre-flight and continue to the wallet.
        }
      }

      setStatus("signing");
      const hash = await writeContractAsync({
        address: plan.address,
        abi: plan.abi as Abi,
        functionName: plan.functionName,
        args: plan.args as unknown[],
        value: plan.value,
        // Enforce the network on the tx itself, so a wallet still on another
        // chain (e.g. Solana) gets a clear chain-mismatch error instead of
        // silently sending - and never lands on the wrong network.
        chainId: robinhoodChain.id,
      });
      setTxHash(hash);
      setStatus("sent");
      void recordLaunch(hash);
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Transaction failed.");
    }
  }

  if (status === "sent" && txHash) {
    return (
      <div className="space-y-2">
        <a className="btn-brand w-full" href={explorerTx(txHash)} target="_blank" rel="noreferrer">
          ✓ Launched - view on explorer
        </a>
        <a href="/feed" className="btn-ghost w-full">See it in the feed →</a>
      </div>
    );
  }

  // Connected but on the wrong network → a prominent "Switch to Robinhood"
  // button (like Pons) instead of Deploy, so the network fix is one tap.
  if (isConnected && chainId !== robinhoodChain.id) {
    return (
      <div className="space-y-2">
        <button
          className="btn-brand w-full"
          disabled={switching}
          onClick={async () => {
            try {
              await switchChainAsync({ chainId: robinhoodChain.id });
            } catch {
              /* user rejected or wallet still on another network */
            }
          }}
        >
          {switching ? "Switching…" : "Switch to Robinhood"}
        </button>
        <p className="text-xs text-zinc-500">
          This app runs on {robinhoodChain.name} (an EVM chain, not Solana). Switch to deploy.
        </p>
      </div>
    );
  }

  const blocked = disabled || !ready || !isConnected;
  const busy = status === "preparing" || status === "signing";
  const label =
    status === "preparing"
      ? "Reading on-chain…"
      : status === "signing"
        ? "Sign in your wallet…"
        : `Deploy · ${input.version.toUpperCase()}`;

  return (
    <div className="space-y-2">
      {warnings.length > 0 && (
        <ul className="space-y-1 rounded-xl border border-ember/30 bg-ember/[0.06] p-3 text-xs text-ember-soft">
          {warnings.map((w, i) => (
            <li key={i}>⚠ {w}</li>
          ))}
        </ul>
      )}
      <button className="btn-brand w-full" disabled={blocked || busy} onClick={deploy}>
        {busy && (
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
        )}
        {label}
      </button>
      {!ready && <p className="text-xs text-zinc-500">Deploy for {input.version} is currently unavailable.</p>}
      {!isConnected && ready && <p className="text-xs text-zinc-500">Connect your wallet to deploy.</p>}
      {error && <p className="whitespace-pre-wrap text-xs text-red-600">{error}</p>}
    </div>
  );
}
