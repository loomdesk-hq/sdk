// Recipes on top of the planner: a token's first market on LoomDesk's hook with liquidity in it, in one transaction;
// a delegate's permissions read back; the shape of a band as the site would show it.
import type { Address, BuildAsk, HookChosen, HookOptions, Plan, Shape } from "./types.js";
import type { LoomDesk } from "./client.js";
import { DELEGATE } from "./contracts.js";

export type LaunchAsk = {
  /** the token to give a market */
  token: Address;
  /** what it trades against: ETH, USDG, or any token with a real exit (2,000 USDG of liquidity and a route to USDG) */
  quote: "ETH" | "USDG" | Address;
  /** the pool's swap fee in percent: 0.1 (rungs from 0.01% wide), 0.5 (from 0.1%), or 1 to 5 (from 2%); a full-range
   *  pool takes 1 to 5. Nine tenths of it to the liquidity, a tenth to LoomDesk. Ignored when the pair already has a
   *  pool on the hook. Left out with a preset: the preset's. */
  feePct?: number;
  /** which hook and with what: a preset (steady, volatile, launch, full) or the fields themselves. Left out: the plain
   *  ranges pool at feePct. Set when the pool opens, fixed after. */
  hook?: HookOptions;
  /** what the wallet pays with */
  payIn: "ETH" | "USDG";
  /** how much, as a decimal string: it buys the token side inside the transaction and fills both sides of the band */
  amount: string;
  owner: Address;
  /** the band around the opening price, percent; default -50 to +100 */
  lowPct?: number;
  highPct?: number;
  rungs?: number;
  shape?: Shape;
  weights?: number[];
  /** one position across every price instead of a band */
  fullRange?: boolean;
  slippagePct?: number;
  referrer?: Address;
};

/** What a launch plan came back with, beside the plan itself. */
export type LaunchPlan = Plan & {
  /** the pool is opened by this plan (the pair had none on the hook): inside the build's transaction for a plain
   *  ranges pool, in a transaction of its own before it for a full-range pool, a launch fee or the volatility fee */
  opensPool: boolean;
  /** the hook the pool is opened on and its fee rule, when the plan opens one */
  hook?: HookChosen;
  /** what the server did with the hook choice (an existing pool used, fullRange set for a full-range pool) */
  hookNotes?: string[];
};

/**
 * A token's market on LoomDesk's hook, with your liquidity in it, in one transaction: the pool opened on
 * LoomOpenHookV2 if the pair has none (about a dollar), priced from the token's existing market, the token side bought
 * from what you pay, and the ladder built for you. The plan is simulated before it comes back; send it soon, since its
 * swaps are priced at that block. Costs what every ladder costs: 0.25% of what goes in, then 5% of the fees it earns.
 */
export async function planLaunch(client: LoomDesk, ask: LaunchAsk): Promise<LaunchPlan> {
  const body: BuildAsk = {
    token: ask.token, quote: ask.quote, payIn: ask.payIn, amount: ask.amount, owner: ask.owner, feePct: ask.feePct, hook: ask.hook,
    // a full-range hook takes one full-range position and nothing narrower
    fullRange: ask.fullRange || ask.hook?.kind === "full" || ask.hook?.preset === "full" || undefined,
    lowPct: ask.fullRange ? undefined : ask.lowPct ?? -50, highPct: ask.fullRange ? undefined : ask.highPct ?? 100,
    rungs: ask.rungs, shape: ask.shape, weights: ask.weights, slippagePct: ask.slippagePct, referrer: ask.referrer,
  };
  const plan = await client.planBuild(body) as Plan & { hook?: HookChosen; hookNotes?: string[] };
  const pool = typeof plan.pool === "string" ? plan.pool : "";
  const opens = /opened/i.test(pool) || Boolean(plan.hook);
  return { ...plan, opensPool: opens, ...(plan.hook ? { hook: plan.hook } : {}), ...(plan.hookNotes ? { hookNotes: plan.hookNotes } : {}) };
}

/** A delegate word from `delegateOf(ladderId)`, read back: who, and what they may do. Zero: no delegate. */
export function readDelegate(word: bigint): { who: Address; perms: number; may: { add: boolean; remove: boolean; collect: boolean; rules: boolean } } | null {
  if (word === 0n) return null;
  const who = (`0x${(word & ((1n << 160n) - 1n)).toString(16).padStart(40, "0")}`) as Address;
  const perms = Number(word >> 160n);
  return { who, perms, may: { add: Boolean(perms & DELEGATE.add), remove: Boolean(perms & DELEGATE.remove), collect: Boolean(perms & DELEGATE.collect), rules: Boolean(perms & DELEGATE.rules) } };
}

/** Permissions by name to the number the contract takes. */
export function perms(...names: Array<keyof typeof DELEGATE>): number {
  return names.reduce((n, k) => n | DELEGATE[k], 0);
}
