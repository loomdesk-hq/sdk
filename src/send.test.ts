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

test("a swap pays the wallet or the router itself, never a third address, and runs no command LoomDesk never uses", () => {
  assertSendable(plan(tx(ADDRESSES.swapRouter, exec([0x00, 0x04], [v3(ADDRESS_THIS), sweep(MSG_SENDER)]))), TRUSTED, { owner: OWNER });
  assertSendable(plan(tx(ADDRESSES.swapRouter, exec([0x00], [v3(OWNER)]))), TRUSTED, { owner: OWNER });
  assert.throws(() => assertSendable(plan(tx(ADDRESSES.swapRouter, exec([0x00, 0x04], [v3(ADDRESS_THIS), sweep(OTHER)]))), TRUSTED, { owner: OWNER }), /the sweep pays 0x2222/);
  assert.throws(() => assertSendable(plan(tx(ADDRESSES.swapRouter, exec([0x05], [sweep(OWNER)]))), TRUSTED, { owner: OWNER }), /never use \(0x05\)/);
  assert.throws(() => assertSendable(plan(tx(ADDRESSES.swapRouter, "0x12345678")), TRUSTED, { owner: OWNER }), /cannot be read/);
});
