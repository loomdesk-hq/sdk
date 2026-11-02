// Where a plan's calls send what they move. A destination in the allowed contracts is not enough: LoomDesk's own
// contracts take a recipient (a close pays `to`, an open is `for` an owner, a give hands the ladder to `to`), and the
// Universal Router pays whoever its commands name. A plan from LoomDesk names the wallet itself everywhere; one that
// names anyone else is refused here, unless the caller listed that address in `recipients` (a give to a friend, a
// delegate for an agent). A call to one of these contracts that cannot be read is refused too: a check that passes
// what it cannot read checks nothing.
import { decodeAbiParameters, decodeFunctionData, parseAbi, parseAbiParameters, type Hex } from "viem";
import type { Address, Tx } from "./types.js";
import { ADDRESSES, LEGACY_LADDERS, LEGACY_ZAPS } from "./contracts.js";
import { loomLadderAbi, loomStakeAbi, loomZapAbi, loomZapV2Abi, pilotGasAbi } from "./abis.js";

const low = (a: string) => a.toLowerCase();
/** the router's names for the caller and for itself */
const MSG_SENDER = "0x0000000000000000000000000000000000000001";
const ADDRESS_THIS = "0x0000000000000000000000000000000000000002";

const routerAbi = parseAbi(["function execute(bytes commands, bytes[] inputs, uint256 deadline) payable", "function execute(bytes commands, bytes[] inputs) payable"]);
const CMD = { V3_SWAP_EXACT_IN: 0x00, PERMIT2_TRANSFER_FROM: 0x02, SWEEP: 0x04, TRANSFER: 0x05, PAY_PORTION: 0x06, V2_SWAP_EXACT_IN: 0x08, PERMIT2_PERMIT: 0x0a, WRAP_ETH: 0x0b, UNWRAP_WETH: 0x0c, BALANCE_CHECK_ERC20: 0x0e, V4_SWAP: 0x10 } as const;
const ACT = { SWAP_EXACT_IN_SINGLE: 0x06, SWAP_EXACT_IN: 0x07, SETTLE: 0x0b, SETTLE_ALL: 0x0c, TAKE: 0x0e, TAKE_ALL: 0x0f } as const;
const L = {
  v3: parseAbiParameters("address recipient, uint256 amountIn, uint256 amountOutMin, bytes path, bool payerIsUser, uint256[] minHopPriceX36"),
  v2: parseAbiParameters("address recipient, uint256 amountIn, uint256 amountOutMin, address[] path, bool payerIsUser, uint256[] minHopPriceX36"),
  wrap: parseAbiParameters("address recipient, uint256 amount"),
  unwrap: parseAbiParameters("address recipient, uint256 amountMin"),
  sweep: parseAbiParameters("address token, address recipient, uint256 amountMin"),
  pull: parseAbiParameters("address token, address recipient, uint160 amount"),
  balanceCheck: parseAbiParameters("address owner, address token, uint256 minBalance"),
  v4: parseAbiParameters("bytes actions, bytes[] params"),
  take: parseAbiParameters("address currency, address recipient, uint256 amount"),
  settle: parseAbiParameters("address currency, uint256 amount"),
  permit: [{ type: "tuple", components: [{ name: "details", type: "tuple", components: [{ name: "token", type: "address" }, { name: "amount", type: "uint160" }, { name: "expiration", type: "uint48" }, { name: "nonce", type: "uint48" }] }, { name: "spender", type: "address" }, { name: "sigDeadline", type: "uint256" }] }, { type: "bytes" }] as const,
};

/** The ladder's and the tank's calls that name who is paid, or who gets control: the argument's name per function. */
const LADDER_RECIPIENTS: Record<string, string[]> = {
  openV3For: ["owner"], openV4For: ["owner"], close: ["to"], closePart: ["to"], collect: ["to"], withdraw: ["to"], claimOwed: ["to"],
  // these hand control to another address: only one the caller named
  give: ["to"], setDelegate: ["who"],
};
const HANDOVERS = new Set(["give", "setDelegate"]);
/** LoomDesk's locks: a give to one of these is the lock the README describes, not a handover to a stranger. */
const LOCKS = new Set([ADDRESSES.loomLock, ADDRESSES.loomLockV3, ADDRESSES.loomLockV2, ADDRESSES.loomLockV1].map(low));
/** WETH on the chain, what WRAP_ETH mints and UNWRAP_WETH burns inside the router. */
const WETH = low(ADDRESSES.weth);
/** the router's name for the chain's ETH in v4 actions */
const NATIVE = "0x0000000000000000000000000000000000000000";

export type RecipientsOptions = { owner: Address; allow: Set<string>; recipients: Set<string> };

/** Why this transaction pays or empowers someone other than the owner, or undefined when it does not. */
export function recipientProblem(t: Tx, o: RecipientsOptions): string | undefined {
  const to = low(t.to);
  const mine = (a: string) => { const x = low(a); return x === low(o.owner) || o.recipients.has(x); };
  const ladders = new Set([ADDRESSES.loomLadder, ...LEGACY_LADDERS].map(low));
  const zaps = new Set([ADDRESSES.loomZap, ...LEGACY_ZAPS].map(low));
  if (ladders.has(to)) {
    let d: { functionName: string; args: readonly unknown[] };
    try { d = decodeFunctionData({ abi: loomLadderAbi, data: t.data as Hex }) as typeof d; } catch { return `a call to LoomLadder that cannot be read (${t.data.slice(0, 10)})`; }
    const names = LADDER_RECIPIENTS[d.functionName];
    if (!names) return undefined;
    const fn = loomLadderAbi.find((x) => x.type === "function" && x.name === d.functionName) as { inputs: { name?: string }[] } | undefined;
    for (const n of names) {
      const i = fn?.inputs.findIndex((x) => x.name === n) ?? -1;
      const who = i >= 0 ? String(d.args[i]) : undefined;
      if (!who) return `${d.functionName} names no ${n}`;
      if (HANDOVERS.has(d.functionName) && !o.recipients.has(low(who)) && !(d.functionName === "give" && LOCKS.has(low(who)))) return `${d.functionName} hands the ladder to ${who}, whom you did not name in \`recipients\``;
      if (d.functionName === "give" && LOCKS.has(low(who))) continue;
      if (!mine(who)) return `${d.functionName} pays ${who}, not your wallet`;
    }
    return undefined;
  }
  if (zaps.has(to)) {
    // a zap opens for, pays and adds for the sender alone; its legs are checked beside (send.ts). It only has to be readable
    try { decodeFunctionData({ abi: loomZapV2Abi, data: t.data as Hex }); return undefined; } catch { /* the earlier zap */ }
    try { decodeFunctionData({ abi: loomZapAbi, data: t.data as Hex }); return undefined; } catch { return `a call to LoomZap that cannot be read (${t.data.slice(0, 10)})`; }
  }
  if (to === low(ADDRESSES.pilotGas) || to === low(ADDRESSES.pilotGasV2) || to === low(ADDRESSES.pilotGasV1)) {
    try {
      const d = decodeFunctionData({ abi: pilotGasAbi, data: t.data as Hex });
      if (d.functionName === "depositFor" && !mine(String(d.args[0]))) return `depositFor fills ${String(d.args[0])}'s tank, not yours`;
      if (d.functionName === "withdraw" && !mine(String(d.args[1]))) return `withdraw pays ${String(d.args[1])}, not your wallet`;
      return undefined;
    } catch { return `a call to PilotGas that cannot be read (${t.data.slice(0, 10)})`; }
  }
  if (to === low(ADDRESSES.loomStake)) {
    try {
      const d = decodeFunctionData({ abi: loomStakeAbi, data: t.data as Hex });
      if (d.functionName === "unstake" && !mine(String(d.args[1]))) return `unstake pays ${String(d.args[1])}, not your wallet`;
      return undefined;
    } catch { return `a call to LoomStake that cannot be read (${t.data.slice(0, 10)})`; }
  }
  if (to === low(ADDRESSES.swapRouter)) return routerProblem(t.data as Hex, BigInt(t.value || "0"), o, mine);
  return undefined;
}

/** The Universal Router: every command read, and every recipient the caller or the router itself. A command LoomDesk's
 *  swaps never use (TRANSFER, PAY_PORTION, anything unknown) is refused: the router can move what Permit2 lets it.
 *  Commands are read with the router's own mask (0x7f: 0x40 is a bridge deposit, not a v3 swap) and the allow-revert
 *  flag is refused. What the execute routes to the router itself (a wrap, a pull, a swap leg paid to ADDRESS_THIS, a
 *  v4 take) must leave it by the end, swept or unwrapped to the wallet: the router keeps no balances, and whatever is
 *  left in it is the next caller's to sweep. ETH sent with the call must be spent inside it (a wrap, a v4 settle). */
function routerProblem(data: Hex, value: bigint, o: RecipientsOptions, mine: (a: string) => boolean): string | undefined {
  let commands: Hex, inputs: readonly Hex[];
  try {
    const d = decodeFunctionData({ abi: routerAbi, data });
    commands = d.args[0] as Hex; inputs = d.args[1] as readonly Hex[];
  } catch { return "a call to the swap router that cannot be read"; }
  const bytes = commands.slice(2).match(/.{2}/g) ?? [];
  if (bytes.length !== inputs.length) return "a swap whose commands and inputs do not match";
  const ok = (a: string) => { const x = low(a); return x === MSG_SENDER || x === ADDRESS_THIS || mine(x); };
  const toRouter = (a: string) => low(a) === ADDRESS_THIS;
  /** what sits in the router and has not left it yet, by currency */
  const held = new Set<string>();
  let spentValue = value === 0n;
  const v3Ends = (path: Hex): [string, string] | undefined => { const h = path.slice(2); return h.length >= 86 ? [low(`0x${h.slice(0, 40)}`), low(`0x${h.slice(h.length - 40)}`)] : undefined; };
  for (const [i, b] of bytes.entries()) {
    const byte = parseInt(b, 16);
    if (byte & 0x80) return `command ${i + 1} is allowed to revert, which LoomDesk's swaps never are`;
    const cmd = byte & 0x7f;
    const input = inputs[i];
    try {
      switch (cmd) {
        case CMD.V3_SWAP_EXACT_IN: {
          const [r, , , path, payerIsUser] = decodeAbiParameters(L.v3, input);
          if (!ok(r)) return `a swap leg pays ${r}`;
          const ends = v3Ends(path as Hex);
          if (!ends) return "a v3 swap leg whose path cannot be read";
          if (!payerIsUser) held.delete(ends[0]);
          if (toRouter(r)) held.add(ends[1]);
          break;
        }
        case CMD.V2_SWAP_EXACT_IN: {
          const [r, , , path, payerIsUser] = decodeAbiParameters(L.v2, input);
          if (!ok(r)) return `a swap leg pays ${r}`;
          const p = path as readonly string[];
          if (p.length < 2) return "a v2 swap leg whose path cannot be read";
          if (!payerIsUser) held.delete(low(p[0]));
          if (toRouter(r)) held.add(low(p[p.length - 1]));
          break;
        }
        case CMD.WRAP_ETH: { const [r] = decodeAbiParameters(L.wrap, input); if (!ok(r)) return `wrapping pays ${r}`; spentValue = true; if (toRouter(r)) held.add(WETH); break; }
        case CMD.UNWRAP_WETH: { const [r] = decodeAbiParameters(L.unwrap, input); if (!ok(r)) return `unwrapping pays ${r}`; held.delete(WETH); if (toRouter(r)) held.add(NATIVE); break; }
        case CMD.SWEEP: { const [token, r] = decodeAbiParameters(L.sweep, input); if (!ok(r)) return `the sweep pays ${r}`; if (!toRouter(r)) held.delete(low(token)); break; }
        case CMD.PERMIT2_TRANSFER_FROM: { const [token, r] = decodeAbiParameters(L.pull, input); if (!ok(r)) return `the swap pulls your tokens to ${r}`; if (toRouter(r)) held.add(low(token)); break; }
        case CMD.BALANCE_CHECK_ERC20: break;
        case CMD.PERMIT2_PERMIT: { const [p] = decodeAbiParameters(L.permit, input); const s = (p as { spender: string }).spender; if (!o.allow.has(low(s))) return `the permit names ${s} as spender, outside the allowed contracts`; break; }
        case CMD.V4_SWAP: {
          const [actions, params] = decodeAbiParameters(L.v4, input);
          const acts = (actions as Hex).slice(2).match(/.{2}/g) ?? [];
          if (acts.length !== (params as readonly Hex[]).length) return "a v4 swap whose actions and params do not match";
          for (const [j, a] of acts.entries()) {
            const act = parseInt(a, 16);
            if (act === ACT.TAKE) { const [cur, r] = decodeAbiParameters(L.take, (params as readonly Hex[])[j]); if (!ok(r)) return `a v4 take pays ${r}`; if (toRouter(r)) held.add(low(cur)); else held.delete(low(cur)); }
            else if (act === ACT.SETTLE || act === ACT.SETTLE_ALL) { const [cur] = decodeAbiParameters(L.settle, (params as readonly Hex[])[j]); if (low(cur) === NATIVE) spentValue = true; held.delete(low(cur)); }
            else if (act === ACT.TAKE_ALL) { const [cur] = decodeAbiParameters(L.settle, (params as readonly Hex[])[j]); held.delete(low(cur)); }
            else if (![ACT.SWAP_EXACT_IN_SINGLE, ACT.SWAP_EXACT_IN].includes(act as never)) return `a v4 action LoomDesk's swaps never use (0x${a})`;
          }
          break;
        }
        default: return `a router command LoomDesk's swaps never use (0x${b})`;
      }
    } catch { return `a router command that cannot be read (0x${b})`; }
  }
  if (!spentValue) return "a swap sent with ETH that nothing in it spends (no wrap, no v4 settle): it would stay in the router for anyone to sweep";
  if (held.size) return `a swap that leaves ${[...held].map((c) => (c === NATIVE ? "ETH" : c === WETH ? "WETH" : c)).join(" and ")} in the router, where anyone can sweep it`;
  return undefined;
}
