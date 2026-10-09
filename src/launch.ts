// Recipes on top of the planner: a token's first market on LoomDesk's hook with liquidity in it, in one transaction;
// a delegate's permissions read back; the shape of a band as the site would show it.
import type { Address, BuildAsk, HookChosen, HookOptions, LadderAsk, Plan, Shape } from "./types.js";
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
  /** A token that has never traded (a token you just deployed): the market cap it opens at, in dollars. The plan then
   *  opens the pool at that price and builds the ladder from what the wallet holds: `amountToken` of the token (its
   *  supply, or a share of it) on the sell side over the price, and `amount` of ETH or USDG under it. Nothing is
   *  bought on the way in, since there is no market yet. */
  startMarketCapUsd?: number;
  /** with startMarketCapUsd: how much of the token the wallet lays over the price, a decimal string in whole tokens */
  amountToken?: string;
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
  if (ask.startMarketCapUsd) return planFirstMarket(client, ask);
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

/** A token's first market, when it has never traded: the pool opened at the market cap named (the hook and its
 *  blocks as asked), then the ladder laid in it from what the wallet holds. Two plans joined: the opening's
 *  transactions first, the ladder's after; the ladder cannot be simulated until the pool exists, so the check is
 *  the opening's and the ladder's note says so. Send them in order. */
async function planFirstMarket(client: LoomDesk, ask: LaunchAsk): Promise<LaunchPlan> {
  if (!ask.amountToken) throw new Error("planLaunch with startMarketCapUsd needs amountToken: the tokens the wallet lays over the price");
  const open = await client.planOpenPool({ token: ask.token, quote: ask.quote, feePct: ask.feePct, owner: ask.owner, hook: ask.hook, startMarketCapUsd: ask.startMarketCapUsd }) as Plan & { then?: { pool: string; newPool: { key: { currency0: Address; currency1: Address; fee: number; tickSpacing: number; hooks: Address }; sqrtPriceX96: string } }; hook?: HookChosen; alreadyOpen?: boolean; pool?: string };
  if (open.alreadyOpen || !open.then) throw new Error("that pair already has a pool on the hook: use planLaunch without startMarketCapUsd");
  const ladder = await client.planLadder({
    token: ask.token, pool: open.then.pool, newPool: open.then.newPool, owner: ask.owner,
    lowPct: ask.lowPct ?? -30, highPct: ask.highPct ?? 300, rungs: ask.rungs ?? 20, shape: ask.shape ?? "bidask", weights: ask.weights,
    amountToken: ask.amountToken, amountQuote: ask.amount, payWithEth: ask.payIn === "ETH", slippagePct: ask.slippagePct, referrer: ask.referrer,
    startMarketCapUsd: ask.startMarketCapUsd,
  } as LadderAsk);
  return {
    ...ladder,
    transactions: [...open.transactions, ...ladder.transactions],
    check: open.check,
    pool: open.pool,
    opensPool: true,
    ...(open.hook ? { hook: open.hook } : {}),
    hookNotes: ["the pool is opened first at the market cap named; the ladder goes in it next and could not be simulated before the pool exists: send the transactions in order"],
  } as LaunchPlan;
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
