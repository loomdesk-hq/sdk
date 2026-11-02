// The send gate (send.ts, recipients.ts): a plan to LoomDesk's contracts or the swap router goes only where the wallet
// is paid; one that names anyone else is refused unless that address was named by the caller.
import { test } from "node:test";
import assert from "node:assert/strict";
import { encodeAbiParameters, encodeFunctionData, parseAbi, parseAbiParameters, toHex } from "viem";
import { assertSendable } from "./send.js";
import { ADDRESSES, TRUSTED } from "./contracts.js";
import { loomLadderAbi, pilotGasAbi } from "./abis.js";
import type { Plan, Tx } from "./types.js";

const OWNER = "0x1111111111111111111111111111111111111111" as const;
const OTHER = "0x2222222222222222222222222222222222222222" as const;
const TOKEN = "0x3333333333333333333333333333333333333333" as const;
const MSG_SENDER = "0x0000000000000000000000000000000000000001";
const ADDRESS_THIS = "0x0000000000000000000000000000000000000002";
const plan = (...txs: Tx[]): Plan => ({ transactions: txs, check: { ok: true, simulated: true } } as unknown as Plan);
const tx = (to: string, data: string, step = "step"): Tx => ({ step, to, data, value: "0" } as Tx);
const ladder = ADDRESSES.loomLadder;
const close = (to: string) => encodeFunctionData({ abi: loomLadderAbi, functionName: "close", args: [1n, to as `0x${string}`, 0n, 0n, 0n, "0x"] });
const give = (to: string) => encodeFunctionData({ abi: loomLadderAbi, functionName: "give", args: [1n, to as `0x${string}`] });
const routerAbi = parseAbi(["function execute(bytes commands, bytes[] inputs, uint256 deadline) payable"]);
const exec = (cmds: number[], inputs: `0x${string}`[]) => encodeFunctionData({ abi: routerAbi, functionName: "execute", args: [toHex(new Uint8Array(cmds)), inputs, 1n] });
const sweep = (r: string) => encodeAbiParameters(parseAbiParameters("address token, address recipient, uint256 amountMin"), [TOKEN, r as `0x${string}`, 1n]);
const v3 = (r: string) => encodeAbiParameters(parseAbiParameters("address recipient, uint256 amountIn, uint256 amountOutMin, bytes path, bool payerIsUser, uint256[] minHopPriceX36"), [r as `0x${string}`, 1n, 1n, "0x", true, []]);

test("a close pays the wallet, or it is refused", () => {
  assertSendable(plan(tx(ladder, close(OWNER))), TRUSTED, { owner: OWNER });
  assert.throws(() => assertSendable(plan(tx(ladder, close(OTHER))), TRUSTED, { owner: OWNER }), /pays 0x2222/);
  // the same plan with no owner given is not checked for recipients (the old gate), and sendPlan always gives one
  assertSendable(plan(tx(ladder, close(OTHER))), TRUSTED);
});

test("a give or a delegate goes only to an address the caller named", () => {
  assert.throws(() => assertSendable(plan(tx(ladder, give(OTHER))), TRUSTED, { owner: OWNER }), /hands the ladder to 0x2222/);
  assertSendable(plan(tx(ladder, give(OTHER))), TRUSTED, { owner: OWNER, recipients: [OTHER] });
  assert.throws(() => assertSendable(plan(tx(ladder, "0xdeadbeef")), TRUSTED, { owner: OWNER }), /cannot be read/);
});

test("a tank is filled and emptied for the wallet alone", () => {
  const forOther = encodeFunctionData({ abi: pilotGasAbi, functionName: "depositFor", args: [OTHER] });
  assert.throws(() => assertSendable(plan({ ...tx(ADDRESSES.pilotGas, forOther), value: "1" }), TRUSTED, { owner: OWNER }), /tank, not yours/);
  const toOther = encodeFunctionData({ abi: pilotGasAbi, functionName: "withdraw", args: [1n, OTHER] });
  assert.throws(() => assertSendable(plan(tx(ADDRESSES.pilotGas, toOther)), TRUSTED, { owner: OWNER }), /pays 0x2222/);
});

const WETH = ADDRESSES.weth;
const path = (a: string, b: string) => `0x${a.slice(2)}000bb8${b.slice(2)}` as `0x${string}`;
const v3p = (r: string, p: `0x${string}`, payerIsUser = true) => encodeAbiParameters(parseAbiParameters("address recipient, uint256 amountIn, uint256 amountOutMin, bytes path, bool payerIsUser, uint256[] minHopPriceX36"), [r as `0x${string}`, 1n, 1n, p, payerIsUser, []]);
const wrap = (r: string) => encodeAbiParameters(parseAbiParameters("address recipient, uint256 amount"), [r as `0x${string}`, 1n]);
const unwrap = (r: string) => encodeAbiParameters(parseAbiParameters("address recipient, uint256 amountMin"), [r as `0x${string}`, 1n]);
const pull = (r: string) => encodeAbiParameters(parseAbiParameters("address token, address recipient, uint160 amount"), [TOKEN, r as `0x${string}`, 1n]);
const sweepOf = (token: string, r: string) => encodeAbiParameters(parseAbiParameters("address token, address recipient, uint256 amountMin"), [token as `0x${string}`, r as `0x${string}`, 1n]);
const withValue = (t: Tx, value: string): Tx => ({ ...t, value } as Tx);

test("a swap pays the wallet or the router itself, never a third address, and runs no command LoomDesk never uses", () => {
  assertSendable(plan(tx(ADDRESSES.swapRouter, exec([0x00, 0x04], [v3p(ADDRESS_THIS, path(WETH, TOKEN)), sweep(MSG_SENDER)]))), TRUSTED, { owner: OWNER });
  assertSendable(plan(tx(ADDRESSES.swapRouter, exec([0x00], [v3p(OWNER, path(WETH, TOKEN))]))), TRUSTED, { owner: OWNER });
  assert.throws(() => assertSendable(plan(tx(ADDRESSES.swapRouter, exec([0x00, 0x04], [v3p(ADDRESS_THIS, path(WETH, TOKEN)), sweep(OTHER)]))), TRUSTED, { owner: OWNER }), /the sweep pays 0x2222/);
  assert.throws(() => assertSendable(plan(tx(ADDRESSES.swapRouter, exec([0x05], [sweep(OWNER)]))), TRUSTED, { owner: OWNER }), /never use \(0x05\)/);
  assert.throws(() => assertSendable(plan(tx(ADDRESSES.swapRouter, "0x12345678")), TRUSTED, { owner: OWNER }), /cannot be read/);
});

test("the router keeps nothing: what an execute routes to the router itself leaves it by the end, ETH sent is spent inside, the router's own mask and no allow-revert flag (Hey Research Lab, 2026-11-02)", () => {
  const router = ADDRESSES.swapRouter;
  // the plain LoomDesk swap: wrap to the router, swap from it, sweep the output to the wallet
  assertSendable(plan(withValue(tx(router, exec([0x0b, 0x00, 0x04], [wrap(ADDRESS_THIS), v3p(ADDRESS_THIS, path(WETH, TOKEN), false), sweep(MSG_SENDER)])), "1")), TRUSTED, { owner: OWNER });
  // a wrap to the router with nothing that moves the WETH on: left for anyone to sweep
  assert.throws(() => assertSendable(plan(withValue(tx(router, exec([0x0b], [wrap(ADDRESS_THIS)])), "1")), TRUSTED, { owner: OWNER }), /leaves WETH in the router/);
  // a wrap to the router, unwrapped back to the wallet: fine
  assertSendable(plan(withValue(tx(router, exec([0x0b, 0x0c], [wrap(ADDRESS_THIS), unwrap(MSG_SENDER)])), "1")), TRUSTED, { owner: OWNER });
  // a Permit2 pull to the router with no sweep: left
  assert.throws(() => assertSendable(plan(tx(router, exec([0x02], [pull(ADDRESS_THIS)]))), TRUSTED, { owner: OWNER }), /leaves 0x3333/);
  assertSendable(plan(tx(router, exec([0x02, 0x04], [pull(ADDRESS_THIS), sweepOf(TOKEN, OWNER)]))), TRUSTED, { owner: OWNER });
  // a swap leg paid to the router, its output never swept: left
  assert.throws(() => assertSendable(plan(tx(router, exec([0x00], [v3p(ADDRESS_THIS, path(WETH, TOKEN))]))), TRUSTED, { owner: OWNER }), /leaves 0x3333/);
  // ETH sent with a call that nothing in it spends (a lone balance check)
  const bal = encodeAbiParameters(parseAbiParameters("address owner, address token, uint256 minBalance"), [OWNER, TOKEN, 1n]);
  assert.throws(() => assertSendable(plan(withValue(tx(router, exec([0x0e], [bal])), "1")), TRUSTED, { owner: OWNER }), /ETH that nothing in it spends/);
  assertSendable(plan(tx(router, exec([0x0e], [bal]))), TRUSTED, { owner: OWNER });
  // 0x40 is the router's bridge deposit under its 0x7f mask, never a v3 swap; 0x80 is the allow-revert flag
  assert.throws(() => assertSendable(plan(tx(router, exec([0x40], [v3(OWNER)]))), TRUSTED, { owner: OWNER }), /never use \(0x40\)/);
  assert.throws(() => assertSendable(plan(tx(router, exec([0x80], [v3(OWNER)]))), TRUSTED, { owner: OWNER }), /allowed to revert/);
});

test("a give to LoomDesk's lock is the lock, not a handover: sent without naming it in recipients", () => {
  assertSendable(plan(tx(ladder, give(ADDRESSES.loomLock))), TRUSTED, { owner: OWNER });
  assert.throws(() => assertSendable(plan(tx(ladder, give(OTHER))), TRUSTED, { owner: OWNER }), /hands the ladder/);
});
