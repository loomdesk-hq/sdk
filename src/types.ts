// What LoomDesk's planner takes and gives back. The same shapes the MCP server and POST /api/agent/ladder speak.

export type Address = `0x${string}`;
export type Hex = `0x${string}`;

/** Where a band puts the most: the four drawn shapes, or "custom" with `weights`, a height per rung. */
export type Shape = "spot" | "curve" | "bidask" | "hybrid" | "custom";
export type LimitSide = "buy" | "sell";

/** One unsigned transaction of a plan. `value` is wei as a decimal string; `gas` is set when the plan was simulated. */
export type Tx = { step: string; to: Address; data: Hex; value: string; gas?: string; note?: string };

/** How a plan fared when the planner simulated it, in order, from the owner, right before answering. */
export type PlanCheck = {
  /** the transactions could be simulated just now (when not, `ok` is left out and `note` says why) */
  simulated: boolean;
  /** every transaction went through, in order, from the owner */
  ok?: boolean;
  simulatedAt: string;
  block?: string;
  /** when not ok: the step that failed (1 based) and why, in words when the revert is a known one */
  failedStep?: number;
  reason?: string;
  /** what the plan sends in ETH, the most its gas can cost, and what the owner holds */
  ethNeeded?: string;
  gasEthAtMost?: string;
  ethHeld?: string;
  note?: string;
};

/** Every plan with transactions carries these once checked. */
export type Checked = {
  check?: PlanCheck;
  /** how soon to send: the swaps and floors in a plan are priced at that block */
  sendWithin?: string | { seconds?: number; text: string };
  /** every revert the plan can hit, by name, and what to do about it */
  ifItReverts?: unknown;
  recentMovePct?: number;
  slippagePct?: number;
};

/** A plan: its transactions, and whatever the planner says about them (fields differ by plan; see the docs). */
export type Plan = Checked & { transactions: Tx[]; [key: string]: unknown };

// --- asks -----------------------------------------------------------------------------------------------------

/** A pool being opened in the same plan (from `planOpenPool`'s answer): a ladder laid against its key and opening price. */
export type NewPool = { key: { currency0: Address; currency1: Address; fee: number; tickSpacing: number; hooks: Address }; sqrtPriceX96: string };

/** A ladder from assets the wallet already holds (one or both sides). */
export type LadderAsk = {
  token: Address;
  /** a pool from `pools()`; the default pool when left out */
  pool?: string;
  newPool?: NewPool;
  owner: Address;
  /** the band, in percent from the current price: lowPct negative for under it */
  lowPct: number;
  highPct: number;
  /** up to 40 */
  rungs?: number;
  shape?: Shape;
  /** shape custom: the height of each rung, low price to high, 0 to 1, stretched over the rungs built */
  weights?: number[];
  amountToken?: string;
  amountQuote?: string;
  fullRange?: boolean;
  /** with one asset: swap part of it for the other in the same pool and build the whole band in one transaction */
  split?: boolean;
  payWithEth?: boolean;
  slippagePct?: number;
  referrer?: Address;
  copyOf?: string;
};

/** A limit buy or sell: rungs at a price, closed for you once filled (unless `closeOnceFilled: false`). */
export type LimitAsk = {
  token: Address;
  pool?: string;
  owner: Address;
  side: LimitSide;
  /** dollars a token by default, or the pool's quote asset a token with unit "quote" */
  price: number;
  priceTo?: number;
  unit?: "usd" | "quote";
  /** of the asset the order holds: the token for a sell, the quote for a buy; a decimal string */
  amount: string;
  rungs?: number;
  shape?: "spot" | "curve" | "bidask";
  acceptBuilt?: boolean;
  payWithEth?: boolean;
  referrer?: Address;
  copyOf?: string;
  closeOnceFilled?: boolean;
};

export type LadderAction = "collect" | "close" | "close_part" | "take_nfts" | "close_once_filled" | "give" | "delegate";

/** Something done to a ladder you own, or are the delegate of. */
export type ActionAsk = {
  ladderId: string;
  owner: Address;
  action: LadderAction;
  /** the LoomLadder the ladder lives in (from `ladders()`); the current one when left out */
  contract?: Address;
  /** close_once_filled: switch the rule on (the default) or off */
  on?: boolean;
  /** close_part: 1 to 99 */
  sharePct?: number;
  slippagePct?: number;
  /** where the proceeds go (the owner when left out); give: the wallet that gets the ladder */
  to?: Address;
  /** the wallet that will send it, when it is the ladder's delegate and not its owner */
  actor?: Address;
  /** delegate: the wallet that may run the ladder */
  who?: Address;
  /** delegate: permissions summed: 1 add, 2 remove, 4 collect, 8 rules; 0 ends the delegation */
  perms?: number;
};

/** Which hook a new pool goes on, and with what. Every field is optional: a preset fills the rest, a field given beside
 *  it wins. Set when the pool opens, fixed after. The site's hook builder (loomdesk.trade/create) offers the same. */
export type HookOptions = {
  /** ranges (default): LoomOpenHookV2, any band, the fee taken in the asset paid in. full: LoomFullHook, one full-range
   *  position only, every fee in the quote (ETH or USDG), and a swap that closes a gap of 3% or more to the token's
   *  Uniswap v3 market pays for the gap instead of the base fee. */
  kind?: "ranges" | "full";
  /** steady: 1%, plain. volatile: 3%, volatility fee on. launch: 5%, opens at 50% and falls to 5% over an hour, volatility
   *  fee on. full: full range, 1% in the quote, opens at 10% for ten minutes. */
  preset?: HookPreset;
  /** the fee the pool opens at, percent: above the swap fee, at most 50; falls in a straight line to the swap fee over launchMinutes */
  launchFeePct?: number;
  /** 1 to 1440 */
  launchMinutes?: number;
  /** ranges only: a fee that rises for a while after the price moves (a move under 3% adds nothing; the add fades within minutes) */
  volatility?: boolean;
};
export type HookPreset = "steady" | "volatile" | "launch" | "full";
/** The presets by name, as the server resolves them. */
export const HOOK_PRESETS: Record<HookPreset, Required<Pick<HookOptions, "kind" | "launchFeePct" | "launchMinutes" | "volatility">> & { feePct: number; note: string }> = {
  steady: { kind: "ranges", feePct: 1, launchFeePct: 0, launchMinutes: 0, volatility: false, note: "1% on every swap, any range; the plain pool" },
  volatile: { kind: "ranges", feePct: 3, launchFeePct: 0, launchMinutes: 0, volatility: true, note: "3%, more while the price moves fast, any range" },
  launch: { kind: "ranges", feePct: 5, launchFeePct: 50, launchMinutes: 60, volatility: true, note: "a token launch: 5%, opens at 50% and falls to 5% over an hour, volatility fee on" },
  full: { kind: "full", feePct: 1, launchFeePct: 10, launchMinutes: 10, volatility: false, note: "full range only, 1% in the quote, opens at 10% for ten minutes; arbitrage pays the gap" },
};
/** What a plan says about the hook it opens the pool on. */
export type HookChosen = { kind: "ranges" | "full"; address: Address; preset?: HookPreset; feePct: number; launchFeePct: number; launchMinutes: number; volatility: boolean; /** the fee rule in words */ fee: string };

/** A new pool on one of LoomDesk's hooks for a token against ETH, USDG or another quote. About a dollar once. */
export type OpenPoolAsk = { token: Address; quote: "ETH" | "USDG" | Address; /** the swap fee, percent; left out: the preset's, else 1 */ feePct?: number; owner: Address; /** which hook and with what; left out: the plain ranges pool */ hook?: HookOptions };

/** One transaction from ETH or USDG to a ladder, the pool opened on LoomDesk's hook on the way when the pair has none. */
export type BuildAsk = {
  token: Address;
  quote: "ETH" | "USDG" | Address;
  payIn: "ETH" | "USDG";
  /** a decimal string of what is paid */
  amount: string;
  owner: Address;
  /** a v4 pool of the token to build in, by id; the quote is then that pool's */
  pool?: string;
  /** the swap fee for a pool that has to be opened: 0.1, 0.5, or 1 to 5 (percent) */
  feePct?: number;
  /** for a pool that has to be opened: which hook and with what. A full-range pool, a launch fee or the volatility fee
   *  are opened by the hook's own call in a transaction before the build; the plan returns both, in order. */
  hook?: HookOptions;
  lowPct?: number;
  highPct?: number;
  rungs?: number;
  shape?: Shape;
  weights?: number[];
  fullRange?: boolean;
  slippagePct?: number;
  referrer?: Address;
  copyOf?: string;
  /** a limit order in place of a band: its side and its prices, quote per token */
  limit?: { side: LimitSide; near: number; far?: number };
};

export type SwapAsk = { from: "ETH" | "USDG" | string; to: "ETH" | "USDG" | string; amount: string; owner: Address; slippagePct?: number };

// --- answers --------------------------------------------------------------------------------------------------

/** What `pools()` says about one pool a ladder can go in. */
export type PoolChoice = {
  pool: string;
  version: 3 | 4;
  pair: string;
  quote: string;
  quoteAddress?: Address;
  loomdeskPool?: boolean;
  swapFeePct?: number | null;
  hook?: Address | null;
  tickSpacing?: number | null;
  stepPct?: number | null;
  fullRangeOnly?: boolean;
  paysLiquidity?: boolean;
  usdToMovePrice2Pct?: number;
  volume24hUsd?: number;
  fees24hUsd?: number;
  untraded?: boolean | null;
  note?: string;
  [key: string]: unknown;
};

export type PoolsAnswer = { token: Record<string, unknown>; pools: PoolChoice[]; note?: string; noPoolYet?: unknown; [key: string]: unknown };

/** A free key and how to send it. */
export type KeyGrant = {
  key: string;
  id: string;
  tier: "free";
  perMinute: number;
  perDay: number;
  plansAtOnce: number;
  use: { mcpHeader: string; mcpUrl: string; claudeCode: string; http: string; note: string };
};

/** What the last answer said is left of the caller's quota (from the RateLimit headers). */
export type Usage = { unitsLeftThisMinute?: number; unitsLeftToday?: number; perMinute?: number; perDay?: number; retryAfterSeconds?: number };
