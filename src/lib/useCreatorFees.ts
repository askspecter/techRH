"use client";

import { useCallback, useEffect, useState } from "react";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import type { Address } from "viem";
import { v2FeeEscrowAbi } from "@/lib/pons/abisV2";
import { PONS_V2 } from "@/lib/pons";
import { robinhoodChain } from "@/lib/chain";

/**
 * Creator fees the connected wallet can claim from the Pons v2 fee escrow
 * (native ETH), Pons-style. Shared by the wallet dropdown and the profile page.
 */
export function useCreatorFees() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();

  const [eth, setEth] = useState<bigint>(0n);
  const [busy, setBusy] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!publicClient || !address) {
      setEth(0n);
      return;
    }
    try {
      const bal = (await publicClient.readContract({
        address: PONS_V2.feeEscrow,
        abi: v2FeeEscrowAbi,
        functionName: "balanceOf",
        args: [address as Address],
      })) as bigint;
      setEth(bal);
    } catch {
      /* ignore read errors (unreachable RPC, etc.) */
    }
  }, [publicClient, address]);

  useEffect(() => {
    reload();
  }, [reload]);

  const claim = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      const hash = await writeContractAsync({
        address: PONS_V2.feeEscrow,
        abi: v2FeeEscrowAbi,
        functionName: "claim",
        chainId: robinhoodChain.id,
      });
      setTxHash(hash);
      setTimeout(reload, 3000);
      return hash;
    } catch (err) {
      setError(err instanceof Error ? err.message.split("\n")[0] : "Claim failed.");
      return null;
    } finally {
      setBusy(false);
    }
  }, [writeContractAsync, reload]);

  return { address, isConnected, eth, claim, busy, txHash, error, reload };
}
