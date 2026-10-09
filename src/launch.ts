// Recipes on top of the planner: a token's first market on LoomDesk's hook with liquidity in it, in one transaction;
// a delegate's permissions read back; the shape of a band as the site would show it.
import { encodeFunctionData, parseUnits } from "viem";
import type { Address, BuildAsk, HookChosen, HookOptions, LadderAsk, Plan, Shape } from "./types.js";
import type { LoomDesk } from "./client.js";
import { ADDRESSES, DELEGATE } from "./contracts.js";
import { erc20Abi, loomLadderAbi } from "./abis.js";

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

export type CurveAsk = {
  /** the token, never traded: its whole supply (or the share you want on the market) is in your wallet */
  token: Address;
  /** the token's decimals; 18 when left out */
  decimals?: number;
  /** the pool's swap fee in percent, flat: 1 to 5. Left out: 2 */
  feePct?: number;
  /** the hook's options (a volatility fee, blocks); a launch fee is allowed but a curve wants none */
  hook?: HookOptions;
  owner: Address;
  /** the market cap the token opens at, in dollars: the price the curve starts from */
  startMarketCapUsd: number;
  /** how much of the token goes on the curve, a decimal string in whole tokens (its supply, usually) */
  amountToken: string;
  /** the ETH that sits under the price, a decimal string: what the first sellers are paid from */
  amountEth: string;
  /** how far under the price the ETH reaches, percent; 30 when left out */
  underPct?: number;
  referrer?: Address;
};

/** The tick a sqrtPriceX96 stands at (to within one), for laying positions beside it. */
function tickAt(sqrtPriceX96: bigint): number {
  const ratio = Number(sqrtPriceX96) / 2 ** 96;
  return Math.floor((2 * Math.log(ratio)) / Math.log(1.0001));
}

/**
 * A token's first market as a curve: two positions and nothing else. The whole amount of the token sits in one
 * position from the opening price to the top of the price range (x*y=k above the price, the shape of a launchpad
 * curve: every buy lifts the price, the position never runs dry, and nothing has to be laid in rungs), and the ETH
 * sits in one band under the price, so a sell has money to meet it from the first block. Three transactions: the
 * pool opened on the hook at the market cap named (with the hook's options), the token approved for LoomLadder, the
 * two positions opened as one ladder (lock it for good with planAction "lock" if that is the promise). The ladder
 * cannot be simulated before the pool exists, so the check is the opening's. ETH pairs only.
 */
export async function planCurve(client: LoomDesk, ask: CurveAsk): Promise<LaunchPlan> {
  const feePct = ask.feePct ?? 2;
  if (![1, 2, 3, 4, 5].includes(feePct)) throw new Error("planCurve: feePct is 1 to 5 (whole percent): the tiers that share one tick spacing");
  const decimals = ask.decimals ?? 18;
  const open = await client.planOpenPool({ token: ask.token, quote: "ETH", feePct, owner: ask.owner, hook: ask.hook, startMarketCapUsd: ask.startMarketCapUsd }) as Plan & { then?: { pool: string; newPool: { key: { currency0: Address; currency1: Address; fee: number; tickSpacing: number; hooks: Address }; sqrtPriceX96: string } }; hook?: HookChosen; alreadyOpen?: boolean; pool?: string };
  if (open.alreadyOpen || !open.then) throw new Error("that pair already has a pool on the hook: a curve is laid when the pool opens");
  const { key, sqrtPriceX96 } = open.then.newPool;
  const sp = key.tickSpacing;
  const tick = tickAt(BigInt(sqrtPriceX96));
  const TOP = Math.floor(887272 / sp) * sp, BOTTOM = -TOP;
  // the price sits between `below` and `above`, with a tick's margin either way for the rounding of tickAt
  const below = Math.floor((tick - 2) / sp) * sp, above = Math.floor((tick + 2) / sp) * sp + sp;
  const wide = Math.max(sp, Math.round((Math.log(1 / (1 - (ask.underPct ?? 30) / 100)) / Math.log(1.0001)) / sp) * sp);
  const tokenRaw = parseUnits(ask.amountToken, decimals), ethRaw = parseUnits(ask.amountEth, 18);
  const tokenIs0 = key.currency0.toLowerCase() === ask.token.toLowerCase();
  // ticks price currency1 in currency0: the token's position lies on the side that holds it, the ETH's on the other
  const rungs = tokenIs0
    ? [{ tickLower: above, tickUpper: TOP, amount0: tokenRaw, amount1: 0n }, { tickLower: below - wide, tickUpper: below, amount0: 0n, amount1: ethRaw }]
    : [{ tickLower: BOTTOM, tickUpper: below, amount0: 0n, amount1: tokenRaw }, { tickLower: above, tickUpper: above + wide, amount0: ethRaw, amount1: 0n }];
  const sqrtP = BigInt(sqrtPriceX96);
  const z = "0x0000000000000000000000000000000000000000" as Address;
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 1800);
  const approve = { step: `approve ${ask.amountToken} of the token for LoomLadder`, to: ask.token, data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [ADDRESSES.loomLadder, tokenRaw] }), value: "0" };
  const openCurve = {
    step: `open the curve: ${ask.amountToken} of the token from the price to the top, ${ask.amountEth} ETH under it`,
    to: ADDRESSES.loomLadder,
    data: encodeFunctionData({ abi: loomLadderAbi, functionName: "openV4For", args: [ask.owner, key, rungs, (sqrtP * 90n) / 100n, (sqrtP * 110n) / 100n, deadline, "0x", { referrer: ask.referrer ?? z, copyOf: 0n }] }),
    value: ethRaw.toString(),
  };
  return {
    ...open,
    transactions: [...open.transactions, approve, openCurve],
    check: open.check,
    pool: open.then.pool,
    opensPool: true,
    ...(open.hook ? { hook: open.hook } : {}),
    hookNotes: ["the pool is opened first at the market cap named; the curve goes in it next and could not be simulated before the pool exists: send the transactions in order, within thirty minutes"],
  } as LaunchPlan;
}
