// The hooks, read and reckoned without the planner: a pool's key and id on either hook, its record and what a swap
// in it pays right now (viem reads), and the fee rule worked out ahead of time as the hooks work it out
// (LoomOpenHookV2._fee and LoomFullHook._fee), so a creator can see what a launch costs traders at minute five before
// opening it. Pips throughout where the contracts use them: a million is 100%.
import { encodeAbiParameters, keccak256, zeroAddress, type PublicClient } from "viem";
import { loomFullHookAbi, loomOpenHookV2Abi } from "./abis.js";
import { ADDRESSES } from "./contracts.js";
import { HOOK_PRESETS, type Address, type HookOptions } from "./types.js";

/** No swap pays more than half, whatever is added. */
export const FEE_CAP = 500_000;
/** A gap under 3% is never arbitrage to the full-range hook. */
export const BAND_FLOOR = 30_000;
/** The volatility fee's settings (LoomOpenHookV2.vol): pips added per tick of counted move past `free`, the count's ceiling in ticks, the ticks it falls each second. */
export type VolSettings = { slope: number; free: number; max: number; fall: number };
/** What arbitrage pays on the full-range hook (LoomFullHook.gap): `plus` and `slope` of the gap, up to `cap`. */
export type GapSettings = { slope: number; plus: number; cap: number };
/** The hooks' settings as deployed; `hookSettings` reads the live ones. */
export const VOL_DEFAULT: VolSettings = { slope: 500_000, free: 300, max: 6_000, fall: 5 };
export const GAP_DEFAULT: GapSettings = { slope: 600_000, plus: 10_000, cap: 400_000 };
/** The contracts' limits on a creator's choices. */
export const HOOK_LIMITS = { launchFeePctMax: 50, launchMinutesMin: 1, launchMinutesMax: 1440, rangesTiersPct: [0.1, 0.5, 1, 2, 3, 4, 5], fullTiersPct: [1, 2, 3, 4, 5] } as const;
/** Tick spacing by tier, as the hooks are set (the hook's `spacingOf` is the word on the chain). */
export const SPACING_OF: Record<string, number> = { "0.1": 1, "0.5": 10, "1": 200, "2": 200, "3": 200, "4": 200, "5": 200 };
export const DYNAMIC_FEE_FLAG = 0x800000;

/** A move of `pct` percent in ticks (a tick is 0.01% of price). */
export const ticksOf = (pct: number) => (pct > 0 ? Math.floor(Math.log(1 + pct / 100) / Math.log(1.0001)) : 0);
/** Pips as a percent for the eye. */
export const pipsPct = (pips: number) => { const p = pips / 10_000; return `${p >= 10 ? Number(p.toFixed(1)) : Number(p.toFixed(2))}%`; };

/** What the launch fee adds `age` seconds after opening: a straight line from the launch fee down to the base fee at `launchSecs`. */
export function launchAdds(base: number, launchFee: number, launchSecs: number, age: number): number {
  if (!launchFee || launchFee <= base || age >= launchSecs) return 0;
  return Math.floor(((launchFee - base) * (launchSecs - Math.max(0, age))) / launchSecs);
}
/** What the volatility fee adds for a move of `pct` percent since the last swap, counted as the hook counts it. */
export function volAdds(pct: number, v: VolSettings = VOL_DEFAULT): number {
  const t = ticksOf(pct);
  const acc = Math.min(t > 1 ? t - 1 : 0, v.max);
  if (acc <= v.free || !v.slope) return 0;
  return Math.min(FEE_CAP, Math.floor(((acc - v.free) * 100 * v.slope) / 1_000_000));
}
/** What a swap that closes a gap of `pct` percent to the token's Uniswap v3 market pays on the full-range hook. */
export function captureOf(pct: number, base: number, g: GapSettings = GAP_DEFAULT): number {
  const gap = ticksOf(pct) * 100;
  const band = Math.max(base * 2, BAND_FLOOR);
  if (gap <= band) return 0;
  return Math.min(g.cap, g.plus + Math.floor((gap * g.slope) / 1_000_000));
}
/** A ranges pool's fee and its parts; over the cap the volatility fee gives way first, then the launch fee. */
export function rangedFee(base: number, launch: number, vol: number): { fee: number; launch: number; vol: number } {
  const f = base + launch + vol;
  if (f <= FEE_CAP) return { fee: f, launch, vol };
  const over = f - FEE_CAP;
  const offVol = Math.min(over, vol);
  return { fee: FEE_CAP, launch: launch - (over - offVol), vol: vol - offVol };
}
/** A full-range pool's fee: the base and the launch fee, or the capture when that is more. */
export function fullFee(base: number, launch: number, capture: number): { fee: number; capture: boolean } {
  const plain = base + launch;
  return { fee: Math.min(FEE_CAP, Math.max(plain, capture)), capture: capture > plain };
}

/** A creator's choice, resolved: the preset filled in, the fields given on top, the fee as a percent. */
export type HookRule = { kind: "ranges" | "full"; feePct: number; launchFeePct: number; launchMinutes: number; volatility: boolean; blocks?: HookOptions["blocks"] };
/** The blocks' limits (LoomBlocksHook): ROYALTY_CEILING, BURN_CEILING, WINDOW_FLOOR and CEILING. */
export const BLOCK_LIMITS = { royaltyPctMax: 30, burnPctMax: 20, windowMinutesMin: 1, windowMinutesMax: 1440 } as const;
/** The blocks checked as the contract checks them; throws HookChoiceError with the reason. */
export function checkBlocks(b: HookOptions["blocks"], feePct: number): void {
  if (!b) return;
  const spacing = (pct: number) => SPACING_OF[String(pct)] ?? 0;
  const minutes = (m: number | undefined, what: string) => { if (m === undefined || !Number.isInteger(m) || m < BLOCK_LIMITS.windowMinutesMin || m > BLOCK_LIMITS.windowMinutesMax) throw new HookChoiceError(`${what} is a whole number of minutes from ${BLOCK_LIMITS.windowMinutesMin} to ${BLOCK_LIMITS.windowMinutesMax}.`); };
  if (b.antiSnipeMaxQuote !== undefined || b.antiSnipeMinutes !== undefined) { if (!(Number(b.antiSnipeMaxQuote) > 0)) throw new HookChoiceError("blocks.antiSnipeMaxQuote is the most one buy may spend of the quote, above zero."); minutes(b.antiSnipeMinutes, "blocks.antiSnipeMinutes"); }
  if (b.royaltyPct !== undefined && (!(b.royaltyPct > 0) || b.royaltyPct > BLOCK_LIMITS.royaltyPctMax)) throw new HookChoiceError(`blocks.royaltyPct is above zero and at most ${BLOCK_LIMITS.royaltyPctMax}.`);
  if (b.burnPct !== undefined && (!(b.burnPct > 0) || b.burnPct > BLOCK_LIMITS.burnPctMax)) throw new HookChoiceError(`blocks.burnPct is above zero and at most ${BLOCK_LIMITS.burnPctMax}.`);
  if (b.sellLockMinutes !== undefined) minutes(b.sellLockMinutes, "blocks.sellLockMinutes");
  if (b.managedFee) { const { floorPct, ceilPct } = b.managedFee; if (!spacing(floorPct) || !spacing(ceilPct) || spacing(floorPct) !== spacing(feePct) || spacing(ceilPct) !== spacing(feePct) || floorPct > feePct || ceilPct < feePct) throw new HookChoiceError(`blocks.managedFee needs floorPct <= ${feePct} <= ceilPct, tiers of the fee's own spacing.`); }
  if (b.offHoursFeePct !== undefined && (!spacing(b.offHoursFeePct) || spacing(b.offHoursFeePct) !== spacing(feePct))) throw new HookChoiceError("blocks.offHoursFeePct is a tier of the fee's own spacing.");
}
export class HookChoiceError extends Error {}
/** The choice checked as the planner and the contracts check it; throws HookChoiceError with the reason. `feePct` left out: the preset's, else 1. */
export function checkHook(hook: HookOptions | undefined, feePct?: number): HookRule {
  const preset = hook?.preset ? HOOK_PRESETS[hook.preset] : undefined;
  if (hook?.preset && !preset) throw new HookChoiceError(`hook.preset is one of ${Object.keys(HOOK_PRESETS).join(", ")}.`);
  const kind = hook?.kind ?? preset?.kind ?? "ranges";
  if (kind !== "ranges" && kind !== "full") throw new HookChoiceError('hook.kind is "ranges" or "full".');
  const pct = feePct ?? preset?.feePct ?? 1;
  const tiers: readonly number[] = kind === "full" ? HOOK_LIMITS.fullTiersPct : HOOK_LIMITS.rangesTiersPct;
  if (!tiers.some((t) => Math.abs(t - pct) < 1e-9)) throw new HookChoiceError(kind === "full" ? "A full-range pool's fee is 1, 2, 3, 4 or 5 (percent)." : "feePct is 0.1, 0.5, 1, 2, 3, 4 or 5 (percent).");
  const launchFeePct = hook?.launchFeePct ?? preset?.launchFeePct ?? 0;
  const launchMinutes = hook?.launchMinutes ?? preset?.launchMinutes ?? 0;
  if ((launchFeePct > 0) !== (launchMinutes > 0)) throw new HookChoiceError("A launch fee needs both hook.launchFeePct and hook.launchMinutes (or neither).");
  if (launchFeePct > 0 && (launchFeePct <= pct || launchFeePct > HOOK_LIMITS.launchFeePctMax)) throw new HookChoiceError(`hook.launchFeePct is above the swap fee (${pct}%) and at most ${HOOK_LIMITS.launchFeePctMax}.`);
  if (launchMinutes > 0 && (launchMinutes < HOOK_LIMITS.launchMinutesMin || launchMinutes > HOOK_LIMITS.launchMinutesMax || !Number.isInteger(launchMinutes))) throw new HookChoiceError(`hook.launchMinutes is a whole number from ${HOOK_LIMITS.launchMinutesMin} to ${HOOK_LIMITS.launchMinutesMax}.`);
  const volatility = hook?.volatility ?? preset?.volatility ?? false;
  if (volatility && kind === "full") throw new HookChoiceError("The volatility fee is a ranges pool's; a full-range pool charges arbitrage by the gap instead.");
  const hasBlocks = Boolean(hook?.blocks && Object.values(hook.blocks).some((v) => v !== undefined));
  if (hasBlocks && kind === "full") throw new HookChoiceError("Blocks are a ranges pool's; a full-range pool takes none.");
  if (hasBlocks) checkBlocks(hook!.blocks, pct);
  return { kind, feePct: pct, launchFeePct, launchMinutes, volatility, ...(hasBlocks ? { blocks: hook!.blocks } : {}) };
}

/** What a swap pays under a rule at a moment: `minutesAfterOpen` into the launch, after a `movePct` move since the last
 *  swap (ranges, with the volatility fee on), or closing a `gapPct` gap to the token's Uniswap v3 market (full). Percent
 *  and pips, with the parts. Pass the live `vol`/`gap` settings from `hookSettings` for the exact figure. */
export function feeAt(rule: HookRule, at: { minutesAfterOpen?: number; movePct?: number; gapPct?: number } = {}, settings: { vol?: VolSettings; gap?: GapSettings } = {}) {
  const base = Math.round(rule.feePct * 10_000);
  const launch = launchAdds(base, Math.round(rule.launchFeePct * 10_000), rule.launchMinutes * 60, (at.minutesAfterOpen ?? 0) * 60);
  if (rule.kind === "full") {
    const capture = captureOf(at.gapPct ?? 0, base, settings.gap ?? GAP_DEFAULT);
    const f = fullFee(base, launch, capture);
    return { feePct: f.fee / 10_000, fee: f.fee, text: pipsPct(f.fee), parts: { base, launch: f.capture ? 0 : launch, volatility: 0, capture: f.capture ? f.fee : 0, royalty: 0, burnOnSells: 0 } };
  }
  const vol = rule.volatility ? volAdds(at.movePct ?? 0, settings.vol ?? VOL_DEFAULT) : 0;
  const f = rangedFee(base, launch, vol);
  // of the base fee, what the royalty and the burn take (the liquidity gets the rest, and all of the adds)
  const royalty = rule.blocks?.royaltyPct ? Math.floor((base * Math.round(rule.blocks.royaltyPct * 10_000)) / 1_000_000) : 0;
  const burn = rule.blocks?.burnPct ? Math.floor((base * Math.round(rule.blocks.burnPct * 10_000)) / 1_000_000) : 0;
  return { feePct: f.fee / 10_000, fee: f.fee, text: pipsPct(f.fee), parts: { base, launch: f.launch, volatility: f.vol, capture: 0, royalty, burnOnSells: burn } };
}
/** The launch fee's path: what a plain swap pays at each minute from the open to the end of the launch (a quiet market). */
export function launchCurve(rule: HookRule, minutes: number[] = [0, 1, 2, 5, 10, 15, 30, 45, 60, 90, 120, 180, 360, 720, 1440]): { minute: number; feePct: number }[] {
  return minutes.filter((m) => m <= Math.max(rule.launchMinutes, 0)).map((minute) => ({ minute, feePct: feeAt(rule, { minutesAfterOpen: minute }).feePct }));
}

/** A hook pool's key for a token against a quote (ETH is the zero address), on the hook `kind` names at `feePct`. */
export function hookPoolKey(token: Address, quote: Address | "ETH" | "USDG", kind: "ranges" | "full", feePct: number, hook?: Address) {
  const q = (quote === "ETH" ? zeroAddress : quote === "USDG" ? ADDRESSES.usdg : quote) as Address;
  const spacing = kind === "full" ? 200 : SPACING_OF[String(feePct)];
  if (!spacing) throw new HookChoiceError("feePct is 0.1, 0.5, 1, 2, 3, 4 or 5 (percent).");
  const quoteIs0 = BigInt(q) < BigInt(token);
  return { currency0: (quoteIs0 ? q : token) as Address, currency1: (quoteIs0 ? token : q) as Address, fee: DYNAMIC_FEE_FLAG, tickSpacing: spacing, hooks: kind === "full" ? ADDRESSES.loomFullHook : hook ?? ADDRESSES.loomBlocksHook };
}
/** A pool's id from its key (Uniswap v4). One pool per pair and spacing: the 1% to 5% tiers share one. */
export function poolIdOf(k: { currency0: Address; currency1: Address; fee: number; tickSpacing: number; hooks: Address }): `0x${string}` {
  return keccak256(encodeAbiParameters([{ type: "address" }, { type: "address" }, { type: "uint24" }, { type: "int24" }, { type: "address" }], [k.currency0, k.currency1, k.fee, k.tickSpacing, k.hooks]));
}
/** A pool's id on the current hooks; pass `hook` for a pool on an earlier one (loomOpenHookV2). */
export const hookPoolId = (token: Address, quote: Address | "ETH" | "USDG", kind: "ranges" | "full", feePct: number, hook?: Address) => poolIdOf(hookPoolKey(token, quote, kind, feePct, hook));

/** A hook pool's record, or null when the pair has none there: the swap fee, who opened it and when, its launch fee and
 *  volatility flag (ranges) or its Uniswap v3 reference (full). */
export async function hookPool(client: PublicClient, poolId: `0x${string}`, kind: "ranges" | "full", hook: Address = kind === "full" ? ADDRESSES.loomFullHook : ADDRESSES.loomBlocksHook) {
  if (kind === "full") {
    const p = await client.readContract({ address: ADDRESSES.loomFullHook, abi: loomFullHookAbi, functionName: "pools", args: [poolId] });
    if (p[0] === 0) return null;
    return { kind, feePct: p[0] / 10_000, quoteIs0: p[1], creator: p[2] as Address, launchFeePct: p[3] / 10_000, launchMinutes: p[4] / 60, openedAt: new Date(p[5] * 1000), volatility: false, reference: p[6] === zeroAddress ? null : (p[6] as Address) };
  }
  const p = await client.readContract({ address: hook, abi: loomOpenHookV2Abi, functionName: "pools", args: [poolId] });
  if (p[0] === 0) return null;
  return { kind, feePct: p[0] / 10_000, quoteIs0: p[1], creator: p[2] as Address, volatility: p[3], launchFeePct: p[4] / 10_000, launchMinutes: p[5] / 60, openedAt: new Date(p[6] * 1000), reference: null };
}
/** What a swap in a hook pool pays right now, as the hook would charge it, with the parts. */
export async function feeNow(client: PublicClient, poolId: `0x${string}`, kind: "ranges" | "full", hook: Address = kind === "full" ? ADDRESSES.loomFullHook : ADDRESSES.loomBlocksHook) {
  if (kind === "full") {
    const [buy, sell, base, launch, gapPips, priced] = await client.readContract({ address: ADDRESSES.loomFullHook, abi: loomFullHookAbi, functionName: "feeNow", args: [poolId] });
    return { kind, buyPct: buy / 10_000, sellPct: sell / 10_000, basePct: base / 10_000, launchPct: launch / 10_000, gapPct: gapPips / 10_000, priced };
  }
  const [fee, base, launch, volatility] = await client.readContract({ address: hook, abi: loomOpenHookV2Abi, functionName: "feeNow", args: [poolId] });
  return { kind, feePct: fee / 10_000, basePct: base / 10_000, launchPct: launch / 10_000, volatilityPct: volatility / 10_000 };
}
/** The hooks' live settings for the volatility fee and the arbitrage capture, for `feeAt`. */
export async function hookSettings(client: PublicClient): Promise<{ vol: VolSettings; gap: GapSettings & { window: number } }> {
  const [v, g] = await Promise.all([
    client.readContract({ address: ADDRESSES.loomBlocksHook, abi: loomOpenHookV2Abi, functionName: "vol" }),
    client.readContract({ address: ADDRESSES.loomFullHook, abi: loomFullHookAbi, functionName: "gap" }),
  ]);
  return { vol: { slope: v[0], free: v[1], max: v[2], fall: v[3] }, gap: { slope: g[0], plus: g[1], cap: g[2], window: g[3] } };
}
