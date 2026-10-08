// A smoke test against the live site: nothing is signed or sent. Run with `npm run smoke`.
import { LoomDesk, assertSendable, planLaunch, readDelegate, perms, DELEGATE } from "../dist/index.js";

const LOOM = "0xdd0C034DAdA72325BC893fA39bc392E82bF847D7";
const OWNER = "0x000000000000000000000000000000000000dEaD"; // any address: the simulation gives it ETH to try with
const loom = new LoomDesk({ baseUrl: process.env.LOOMDESK_URL });

const t0 = Date.now();
const { pools } = await loom.pools(LOOM);
console.log(`pools: ${pools.length}, first ${pools[0]?.pair} ${pools[0]?.swapFeePct}% ${pools[0]?.version === 4 ? "v4" : "v3"}; ${Date.now() - t0} ms`);
console.log("usage after a read:", loom.usage);

const plan = await loom.planBuild({ token: LOOM, quote: "USDG", payIn: "ETH", amount: "0.01", owner: OWNER, lowPct: -20, highPct: 30, rungs: 12, shape: "curve" });
console.log(`build: ${plan.transactions.length} tx, check`, plan.check, "sendWithin", plan.sendWithin);
assertSendable(plan);
console.log("every destination is a trusted contract");

const launch = await planLaunch(loom, { token: LOOM, quote: "ETH", feePct: 1, payIn: "ETH", amount: "0.01", owner: OWNER, rungs: 8 });
console.log(`launch: opensPool ${launch.opensPool}, ${launch.transactions.length} tx, ok ${launch.check?.ok}`);

// the hook choices: a pool that has to be opened, planned with each preset (a token with no pool on either hook yet)
const NEW = process.env.LOOMDESK_NEW_TOKEN;
if (NEW) {
  for (const preset of ["launch", "volatile", "full"]) {
    const p = await planLaunch(loom, { token: NEW, quote: preset === "full" ? "USDG" : "ETH", payIn: "ETH", amount: "0.02", owner: OWNER, rungs: 6, hook: { preset } });
    console.log(`${preset}: ${p.transactions.length} tx [${p.transactions.map((t) => t.step.slice(0, 40)).join(" | ")}], hook ${p.hook?.kind} ${p.hook?.feePct}% launch ${p.hook?.launchFeePct}%/${p.hook?.launchMinutes}m vol ${p.hook?.volatility}, ok ${p.check?.ok ?? p.check?.note}`);
    assertSendable(p);
  }
  try {
    await loom.planOpenPool({ token: NEW, quote: "ETH", feePct: 1, owner: OWNER, hook: { launchFeePct: 0.5, launchMinutes: 10 } });
    throw new Error("a launch fee under the swap fee was accepted");
  } catch (e) { console.log(`a bad hook choice throws: ${e.message.slice(0, 90)}`); }
} else console.log("hook presets: set LOOMDESK_NEW_TOKEN to a token with no pool on the hooks to plan them");
import { HOOK_PRESETS } from "../dist/index.js";
if (HOOK_PRESETS.launch.launchFeePct !== 50 || HOOK_PRESETS.full.kind !== "full") throw new Error("HOOK_PRESETS is wrong");

const delegated = readDelegate((BigInt(perms("collect", "rules")) << 160n) | BigInt("0x2f7CE7eeF4b091E0827dA1E8C2E10D061d95d180"));
if (delegated?.perms !== DELEGATE.collect + DELEGATE.rules || !delegated.may.collect || delegated.may.remove) throw new Error("readDelegate is wrong");
console.log("delegate word reads back:", delegated.who, delegated.may);

try {
  await loom.planAction({ ladderId: "999999999", owner: OWNER, action: "collect" });
  console.log("unexpected: a plan for a ladder that does not exist");
} catch (e) {
  console.log(`a refused plan throws ${e.name}: ${e.message.slice(0, 80)}`);
}
console.log("usage at the end:", loom.usage);
