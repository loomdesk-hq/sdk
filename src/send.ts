// Sending a plan: its transactions in order from the owner's wallet, each after the one before is mined, with the gas
// limit the planner set. Before the first one goes out, every destination is checked against the contracts you
// allow, and a plan the planner saw revert is refused unless you insist.
import { decodeFunctionData, parseAbi, type Hash, type PublicClient, type WalletClient } from "viem";
import type { Address, Plan, Tx } from "./types.js";
import { MULTICALL3, TRUSTED } from "./contracts.js";

export type SendOptions = {
  walletClient: WalletClient;
  publicClient: PublicClient;
  /** the contracts a transaction may go to (lowercase or not); default: LoomDesk's own, USDG and the swap router */
  allow?: Address[];
  /** send even when the planner's simulation failed (destinations and approvals are still checked) */
  sendFailed?: boolean;
  /** skip every check: the simulation, the destinations and the approvals. Prefer `allow` or `sendFailed` */
  force?: boolean;
  /** called before each step */
  onStep?: (i: number, tx: Tx) => void;
  /** seconds to wait for each receipt; default 120 */
  timeout?: number;
};

const approveAbi = parseAbi(["function approve(address spender, uint256 amount)", "function approve(address token, address spender, uint160 amount, uint48 expiration)"]);

/** The spender an approval names (an ERC-20 approve, or Permit2's), or undefined for any other call. */
function spenderOf(data: string): string | undefined {
  try {
    const d = decodeFunctionData({ abi: approveAbi, data: data as `0x${string}` });
    return String(d.args.length === 2 ? d.args[0] : d.args[1]);
  } catch { return undefined; }
}

/** Throws when a plan should not be sent as it is: a failed simulation (unless `sendFailed`), a destination outside
 *  `allow`, or an approval whose spender is outside it. An approval may go to any token: what it approves is read. */
export function assertSendable(plan: Plan, allow: Address[] = TRUSTED, opts: { sendFailed?: boolean } = {}): void {
  if (!plan.transactions?.length) throw new Error("the plan has no transactions");
  if (!opts.sendFailed && plan.check?.simulated && plan.check.ok === false) {
    throw new Error(`the planner saw this plan fail at step ${plan.check.failedStep ?? "?"}: ${plan.check.reason ?? "unknown"}. Plan again right before sending.`);
  }
  const ok = new Set(allow.map((a) => a.toLowerCase()));
  ok.delete(MULTICALL3.toLowerCase());
  for (const t of plan.transactions) {
    const spender = spenderOf(t.data);
    if (spender !== undefined) {
      if (!ok.has(spender.toLowerCase())) throw new Error(`step "${t.step}" approves ${spender}, which is not in the allowed contracts. Check it against https://loomdesk.trade/llms.txt before sending.`);
      if (t.to.toLowerCase() === MULTICALL3.toLowerCase()) throw new Error(`step "${t.step}" goes to Multicall3, which a plan never does.`);
      if (BigInt(t.value || "0") !== 0n) throw new Error(`step "${t.step}" is an approval that sends ETH, which an approval never does.`);
      continue;
    }
    if (!ok.has(t.to.toLowerCase())) throw new Error(`step "${t.step}" goes to ${t.to}, which is not in the allowed contracts. Check it against https://loomdesk.trade/llms.txt before sending.`);
  }
}

/** Send a plan. Returns the transaction hashes in order. Stops at the first one that reverts. */
export async function sendPlan(plan: Plan, opts: SendOptions): Promise<Hash[]> {
  const { walletClient, publicClient } = opts;
  if (!opts.force) assertSendable(plan, opts.allow, { sendFailed: opts.sendFailed });
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
