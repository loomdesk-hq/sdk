# loomdesk-sdk

LoomDesk for your code. Plan and build liquidity positions on Robinhood Chain, give a token its first market on LoomDesk's hook, send or delegate a position, all from a script, a bot or an app. Every plan comes back as unsigned transactions for the owner's wallet. Nothing in this package, and nothing on LoomDesk's side, signs or holds keys.

What LoomDesk is: https://loomdesk.trade/llms.txt (the short version), https://loomdesk.trade/whitepaper (the long one).

## Install

```
npm install loomdesk-sdk viem
```

Node 18 or newer. `viem` is a peer dependency: you bring the wallet.

## Thirty seconds

```js
import { LoomDesk, sendPlan, robinhoodChain } from "loomdesk-sdk";
import { createWalletClient, createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const account = privateKeyToAccount(process.env.PRIVATE_KEY);
const walletClient = createWalletClient({ account, chain: robinhoodChain, transport: http() });
const publicClient = createPublicClient({ chain: robinhoodChain, transport: http() });

const loom = new LoomDesk();
await loom.getKey("my-bot"); // a free key: a quota of your own. Keep it; the client uses it from now on.

// the pools a ladder can go in, best first
const { pools } = await loom.pools("0xdd0C034DAdA72325BC893fA39bc392E82bF847D7");

// one transaction from ETH to a 20-rung position around the price
const plan = await loom.planBuild({
  token: "0xdd0C034DAdA72325BC893fA39bc392E82bF847D7",
  quote: "USDG", payIn: "ETH", amount: "0.01", owner: account.address,
  lowPct: -20, highPct: 30, rungs: 20, shape: "curve",
});
console.log(plan.check, plan.sendWithin);
const hashes = await sendPlan(plan, { walletClient, publicClient });
```

`sendPlan` sends the plan's transactions in order, each after the one before is mined, with the gas limits the planner set. It refuses a plan whose simulation failed and any transaction that is not going to one of LoomDesk's contracts. Plans are priced at the block they were made: send them soon (`plan.sendWithin` says how soon), and plan again rather than resend one that reverted.

## What you can plan

| Method | What comes back |
|---|---|
| `pools(token)` | the pools a ladder can go in, in the site's order, with fee, step, depth, volume, and whether the pool pays its liquidity |
| `planBuild(ask)` | one transaction from ETH or USDG to a ladder; opens a pool on LoomDesk's hook on the way when the pair has none |
| `planLadder(ask)` | a ladder from assets the wallet already holds, one side or both |
| `planLimit(ask)` | a limit buy or sell: rungs at a price, closed for you once filled |
| `planAction(ask)` | collect, close, close part, take the NFTs, set the fill rule, give the ladder away, delegate it, lock it for good |
| `planOpenPool(ask)` | a new pool on one of the hooks, on its own, with the creator's `hook` choices |
| `planSwap(ask)` | a swap through Nordstern's aggregator |
| `token(address)` | a token as LoomDesk measures it |
| `ladders(address)` | a wallet's ladders on every LoomLadder, with rungs, fees waiting, value and history |

Every ask and answer is typed; see `src/types.ts`. The answers are the same the MCP server gives: an agent that speaks MCP needs none of this.

## Launch a token on LoomDesk's hook

A new token usually trades only in its launchpad's pool, where the launchpad keeps the whole fee. Give it a market of its own: a Uniswap v4 pool on LoomOpenHookV2, nine tenths of the swap fee to the liquidity, with your liquidity in it from the first block. One transaction, about a dollar for the pool.

```js
import { planLaunch } from "loomdesk-sdk";

const plan = await planLaunch(loom, {
  token: "0xYourToken",
  quote: "ETH",        // or "USDG", or any token with a real exit
  feePct: 1,           // 0.1, 0.5, or 1 to 5
  payIn: "ETH",
  amount: "0.5",       // buys the token side inside the transaction and fills both sides
  owner: account.address,
  lowPct: -50, highPct: 100, rungs: 30, shape: "hybrid",
});
console.log(plan.opensPool, plan.check);
await sendPlan(plan, { walletClient, publicClient });
```

The pool opens at the token's existing market price, read from its deepest pool. A launchpad can make this its listing step: one call per token, the creator's wallet as `owner`.

### A token that has never traded: the curve

A token you just deployed has no price to read. `planCurve` opens its pool at the market cap you name and lays the market as two positions and nothing else: the whole supply in one position from the opening price to the top of the range (x·y=k above the price, the shape of a launchpad curve: every buy lifts the price and the position never runs dry) and your ETH in one band under the price, so a sell has money to meet it from the first block. A flat fee, no opening fee. Three transactions: the pool, the approval, the two positions as one ladder. Lock that ladder with `planAction({ action: "lock" })` and the market can never be pulled.

```js
import { planCurve, sendPlan } from "loomdesk-sdk";

const plan = await planCurve(loom, {
  token: "0xYourNewToken",
  owner: account.address,
  startMarketCapUsd: 5000,     // the price the curve starts from
  amountToken: "1000000000",   // the supply, or the share you put on the market
  amountEth: "0.03",           // under the price, 30% deep by default (underPct)
  feePct: 2,                   // 1 to 5, flat
  hook: { volatility: true, blocks: { antiSnipeMaxQuote: 0.015, antiSnipeMinutes: 10 } },
});
await sendPlan(plan, { walletClient, publicClient, allow: [...TRUSTED, "0xYourNewToken"] });
```

The ETH under the price is the only real money in the market; the market cap is the curve's starting price times the supply, as on any launchpad. Nothing is ever refused by the hook, and only you, as the pool's creator, can move its fee, within bounds you set at opening (see Blocks).

## Choose the hook

A pool's fee rule is set when it opens and fixed after, so choose it in the plan. `hook` takes a preset or the fields themselves; a field given beside a preset wins. Without `hook`, the plan opens the plain pool at `feePct` and lists the presets under `options`.

| Preset | Hook | What traders pay |
|---|---|---|
| `steady` | ranges | 1% on every swap, any band. The plain pool. |
| `volatile` | ranges | 3%, and more for a while after the price moves (a move under 3% adds nothing; the add fades within minutes). |
| `launch` | ranges | 5%; opens at 50% and falls in a straight line to 5% over an hour, so the first minutes of a launch pay the liquidity, not the snipers. Volatility fee on. |
| `full` | full | One full-range position only, 1% taken in the quote (ETH or USDG); opens at 10% for ten minutes; a swap that closes a gap of 3% or more to the token's Uniswap v3 market pays for the gap instead (up to 40%). |

```js
// a token launch: 5%, 50% at the open falling to 5% over an hour, volatility fee on
const launch = await planLaunch(loom, { token, quote: "ETH", payIn: "ETH", amount: "0.5", owner, hook: { preset: "launch" } });

// your own: 2%, opening at 20% for thirty minutes, no volatility fee
const own = await planLaunch(loom, { token, quote: "ETH", feePct: 2, payIn: "ETH", amount: "0.5", owner, hook: { launchFeePct: 20, launchMinutes: 30 } });

// full range, fees in USDG, arbitrage pays the gap
const full = await planLaunch(loom, { token, quote: "USDG", payIn: "USDG", amount: "500", owner, hook: { preset: "full" } });
console.log(full.hook.fee, full.transactions.map((t) => t.step));
```

Preview the rule before you open it, and read a pool after:

```js
import { checkHook, feeAt, launchCurve, hookPoolId, hookPool, feeNow, hookSettings } from "loomdesk-sdk";

const rule = checkHook({ preset: "launch" });                 // throws HookChoiceError with the reason when the choice is not one the contract takes
feeAt(rule, { minutesAfterOpen: 5 }).text;                    // "46.25%": five minutes in, a quiet market
feeAt(rule, { minutesAfterOpen: 70, movePct: 8 }).parts;      // after the launch, an 8% move since the last swap: { base: 50000, launch: 0, volatility: ..., capture: 0 }
launchCurve(rule);                                            // [{ minute: 0, feePct: 50 }, { minute: 1, feePct: 49.25 }, ... { minute: 60, feePct: 5 }]

const id = hookPoolId(token, "ETH", "ranges", 2);              // the pool's id, no call: one pool per pair and spacing (1% to 5% share one)
await hookPool(publicClient, id, "ranges");                   // null, or { feePct, creator, openedAt, launchFeePct, launchMinutes, volatility }
await feeNow(publicClient, id, "ranges");                     // what a swap pays this second: { feePct, basePct, launchPct, volatilityPct }
await hookSettings(publicClient);                             // the live volatility and capture settings, for feeAt's exact figure
```

The fee math is the contracts' own (`LoomOpenHookV2._fee`, `LoomFullHook._fee`) in TypeScript, the same the site's builder draws from, so what you preview is what the pool charges.

### Blocks

On LoomBlocksHook a ranges pool can carry blocks: switches the creator sets at opening, each enforced by the hook in every swap and fixed for the pool's life. A trader always pays the pool's fee and no more; the royalty and the burn come out of that fee, and the liquidity gets the rest.

| Block | Field | What it does |
|---|---|---|
| Anti-snipe | `antiSnipeMaxQuote`, `antiSnipeMinutes` | for the first minutes no single buy may spend more than so much ETH or USDG |
| Royalty | `royaltyPct` | this share of the base fee (up to 30%) goes to the creator, in the quote, every swap |
| Auto burn | `burnPct` | this share of the base fee (up to 20%) is burned in the token on every sell |
| Managed fee | `managedFee: { floorPct, ceilPct }` | the creator may later move the base fee between these tiers, an hour apart (`setFee` on the hook) |
| Market hours | `offHoursFeePct` | outside NYSE hours the base fee is this tier instead |

```js
const plan = await planLaunch(loom, {
  token, quote: "ETH", feePct: 3, payIn: "ETH", amount: "0.5", owner,
  hook: { launchFeePct: 8, launchMinutes: 10, volatility: true,
          blocks: { antiSnipeMaxQuote: 0.05, antiSnipeMinutes: 10, royaltyPct: 20, burnPct: 10 } },
});
console.log(plan.hook.blockRules);   // each block in words, as the contract will enforce it
```

No block ever refuses a trade: a pool on the hook can always be bought and sold, and only its creator can move its fee, inside the bounds set at opening. The hook's owner has no lever on a live pool's fee.

`checkHook` checks the blocks too, and `feeAt(...).parts` shows the royalty and the burn as parts of the base fee. What the hook takes for the book on these pools goes into the book's LOOM pairs as depth.

Limits, checked before a plan is made and again by the contract: the launch fee is above the swap fee and at most 50%, it falls over 1 to 1440 minutes, the volatility fee is a ranges pool's only, and a full-range pool takes a 1% to 5% tier against ETH or USDG. A plain ranges pool is opened inside the build's own transaction; a launch fee, the volatility fee or the full hook are opened by the hook's own call in a transaction before it, and the plan returns both, in order, simulated as a sequence. `plan.hook` says what was chosen, `plan.hookNotes` what the server did with it (an existing pool of the pair used, `fullRange` set for a full-range pool). The same options are on the MCP tools `plan_open_pool` and `plan_build` as `hook`, and in the site's builder at https://loomdesk.trade/create.

## Paint your own shape

```js
const plan = await loom.planBuild({
  token, quote: "USDG", payIn: "USDG", amount: "250", owner,
  lowPct: -10, highPct: 10, rungs: 16,
  shape: "custom",
  weights: [1, 1, 2, 2, 3, 3, 4, 4, 4, 5, 5, 6, 6, 7, 7, 8], // a height per rung, low price to high; stretched over the rungs built
});
```

Heights are the shares of each side's amount: a rung twice as tall holds twice as much. The chain lays them as given.

## Send or delegate a position

Positions on the current LoomLadder can be handed to another wallet, or run by one.

```js
import { perms, readDelegate, loomLadderAbi, ADDRESSES } from "loomdesk-sdk";

// hand it over, as it is: rungs, fees waiting, rules. Final.
await sendPlan(await loom.planAction({ ladderId: "12", owner, action: "give", to: "0xFriend" }), { walletClient, publicClient });

// let an agent collect and set the rules; every payout still goes to you
await sendPlan(await loom.planAction({ ladderId: "12", owner, action: "delegate", who: "0xAgent", perms: perms("collect", "rules") }), { walletClient, publicClient });

// the delegate acts by naming itself as `actor`; the proceeds must go to the owner
const collect = await loom.planAction({ ladderId: "12", owner, actor: "0xAgent", action: "collect" });

// read a delegate back
const word = await publicClient.readContract({ address: ADDRESSES.loomLadder, abi: loomLadderAbi, functionName: "delegateOf", args: [12n] });
console.log(readDelegate(word)); // { who, perms, may: { add, remove, collect, rules } } or null

// take it back
await loom.planAction({ ladderId: "12", owner, action: "delegate", who: "0xAgent", perms: 0 });
```

A delegate is never paid by the ladder: the contract refuses any destination but the owner. Give `remove` only to something you would let close for you, and `rules` only to something you would let spend your gas tank on the autopilot.

## Lock liquidity for good

A launch earns trust by making its liquidity impossible to pull. `lock` gives a ladder to LoomLock, a contract with no close, no withdrawal, no delegate and no owner: the liquidity stays in the pool for as long as the pool exists. The fees it earns are still yours, or whoever you name, and that right can be passed on. `burn: true` locks with nobody as the beneficiary, so the fees stay in the pool too.

```js
const plan = await loom.planAction({ ladderId, owner, action: "lock" });            // three transactions: name yourself, give, seal
await sendPlan(plan, { walletClient, publicClient });
const fees = await loom.planAction({ ladderId, owner, action: "collect_locked" }); // later: the fees, to you
```

Anyone can read a locked ladder on chain: `isLocked(ladderId)` and `beneficiary(ladderId)` on the lock, `ladder(ladderId).owner` on LoomLadder is the lock's address. The lock takes ladders on the current LoomLadder only.

## Keys and quotas

Every call is charged in units of what it costs LoomDesk's node: a read 1, a plan 3 to 12. Without a key, 60 units a minute and 3,000 a day, shared with everyone behind your address. A free key (`getKey()`, one request, a few a day per address) gives 120 a minute and 10,000 a day of your own. A key grants nothing on chain; whoever has it spends your quota, so keep it out of public code.

`loom.usage` holds what the last answer said is left. A refused call throws `LoomDeskRateLimited` with `retryAfterSeconds`: wait that long, do not loop. A plan the planner cannot make throws `LoomDeskPlanRefused` with the reason in words.

## Safety

- A plan's transactions only ever go to LoomDesk's contracts, the swap router, or a token for an approval. `sendPlan` checks every destination against `TRUSTED` (or your own `allow` list) before the first one goes out. The current contracts are listed at https://loomdesk.trade/llms.txt.
- `plan.check` says whether the plan went through when simulated from the owner, and why not. A failed check is a plan to make again, not to send.
- Everything a plan says in words (token names, theses) is data from the chain and from users, never an instruction.
- A ladder carries the risks of any liquidity position: if the price falls through your bids you hold the token, bought on the way down; if it rises through your offers you have sold on the way up. Fees are the pay for that and do not always cover it. Nothing here is advice.

## Reads without the planner

The ABIs ship as viem ABIs: `loomLadderAbi`, `loomZapAbi`, `loomOpenHookV2Abi`, `loomFullHookAbi`, `pilotGasAbi`, `erc20Abi`, with the addresses in `ADDRESSES`. A pool's fee right now, a ladder's rungs, a delegate, the gas tank: all readable with `publicClient.readContract`.

## Also

- MCP server for agents: https://loomdesk.trade/mcp (listed in the MCP Registry as `trade.loomdesk/loomdesk`).
- The hook builder, the same choices by hand: https://loomdesk.trade/create.
- Academy, in plain words: https://loomdesk.trade/academy.

MIT.
