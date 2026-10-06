// Let an agent collect a position's fees and set its rules, while every payout stays with you; then read it back.
//   PRIVATE_KEY=0x... LADDER=12 AGENT=0x... node examples/delegate-to-agent.mjs
import { LoomDesk, sendPlan, perms, readDelegate, loomLadderAbi, ADDRESSES, robinhoodChain } from "@loomdesk/sdk";
import { createWalletClient, createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const account = privateKeyToAccount(process.env.PRIVATE_KEY);
const walletClient = createWalletClient({ account, chain: robinhoodChain, transport: http(process.env.RPC_URL) });
const publicClient = createPublicClient({ chain: robinhoodChain, transport: http(process.env.RPC_URL) });
const loom = new LoomDesk({ key: process.env.LOOMDESK_KEY });

const plan = await loom.planAction({ ladderId: process.env.LADDER, owner: account.address, action: "delegate", who: process.env.AGENT, perms: perms("collect", "rules") });
console.log(plan.note);
await sendPlan(plan, { walletClient, publicClient });

const word = await publicClient.readContract({ address: ADDRESSES.loomLadder, abi: loomLadderAbi, functionName: "delegateOf", args: [BigInt(process.env.LADDER)] });
console.log("delegate:", readDelegate(word));
