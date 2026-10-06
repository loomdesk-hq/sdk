// Give a token its first market on LoomDesk's hook, with your liquidity in it, in one transaction.
//   PRIVATE_KEY=0x... TOKEN=0x... node examples/launch-token.mjs
import { LoomDesk, planLaunch, sendPlan, robinhoodChain } from "loomdesk-sdk";
import { createWalletClient, createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const account = privateKeyToAccount(process.env.PRIVATE_KEY);
const walletClient = createWalletClient({ account, chain: robinhoodChain, transport: http(process.env.RPC_URL) });
const publicClient = createPublicClient({ chain: robinhoodChain, transport: http(process.env.RPC_URL) });

const loom = new LoomDesk({ key: process.env.LOOMDESK_KEY });
const plan = await planLaunch(loom, {
  token: process.env.TOKEN,
  quote: "ETH",
  feePct: 1,
  payIn: "ETH",
  amount: process.env.AMOUNT ?? "0.05",
  owner: account.address,
  lowPct: -50, highPct: 100, rungs: 30, shape: "hybrid",
});
console.log(plan.opensPool ? "the pool opens in this transaction" : "the pair already has a pool on the hook");
console.log("check:", plan.check, "send within:", plan.sendWithin);
if (plan.check?.ok === false) { console.log("not sent:", plan.check.reason); process.exit(1); }
const hashes = await sendPlan(plan, { walletClient, publicClient, onStep: (i, t) => console.log(`step ${i + 1}: ${t.step}`) });
console.log("done:", hashes);
