// Sending a plan: its transactions in order from the owner's wallet, each after the one before is mined, with the gas
// limit the planner set. Before the first one goes out, every destination is checked against the contracts you
// allow, and a plan the planner saw revert is refused unless you insist.
import type { Hash, PublicClient, WalletClient } from "viem";
import type { Address, Plan, Tx } from "./types.js";
import { TRUSTED } from "./contracts.js";

export type SendOptions = {
  walletClient: WalletClient;
  publicClient: PublicClient;
  /** the contracts a transaction may go to (lowercase or not); default: LoomDesk's own, USDG and the swap router */
  allow?: Address[];
  /** send even when the planner's simulation failed */
  force?: boolean;
  /** called before each step */
  onStep?: (i: number, tx: Tx) => void;
  /** seconds to wait for each receipt; default 120 */
  timeout?: number;
};

/** Throws when a plan should not be sent as it is: a failed simulation, or a destination outside `allow`. */
export function assertSendable(plan: Plan, allow: Address[] = TRUSTED): void {
  if (!plan.transactions?.length) throw new Error("the plan has no transactions");
  if (plan.check?.simulated && plan.check.ok === false) {
    throw new Error(`the planner saw this plan fail at step ${plan.check.failedStep ?? "?"}: ${plan.check.reason ?? "unknown"}. Plan again right before sending.`);
  }
  const ok = new Set(allow.map((a) => a.toLowerCase()));
  for (const t of plan.transactions) {
    if (!ok.has(t.to.toLowerCase())) throw new Error(`step "${t.step}" goes to ${t.to}, which is not in the allowed contracts. Check it against https://loomdesk.trade/llms.txt before sending.`);
  }
}

/** Send a plan. Returns the transaction hashes in order. Stops at the first one that reverts. */
export async function sendPlan(plan: Plan, opts: SendOptions): Promise<Hash[]> {
  const { walletClient, publicClient } = opts;
  if (!opts.force) assertSendable(plan, opts.allow);
  const account = walletClient.account;
  if (!account) throw new Error("the wallet client has no account");
  const hashes: Hash[] = [];
  for (let i = 0; i < plan.transactions.length; i++) {
    const t = plan.transactions[i];
    opts.onStep?.(i, t);
    const hash = await walletClient.sendTransaction({
      account,
      chain: walletClient.chain,
      to: t.to,
      data: t.data,
      value: BigInt(t.value || "0"),
      ...(t.gas ? { gas: BigInt(t.gas) } : {}),
    });
    hashes.push(hash);
    const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: (opts.timeout ?? 120) * 1000 });
    if (receipt.status !== "success") throw new Error(`step ${i + 1} ("${t.step}") reverted on chain in ${hash}. Only gas was spent.`);
  }
  return hashes;
}
