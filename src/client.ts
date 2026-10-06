// The client: LoomDesk's planner over HTTP. Every plan comes back as unsigned transactions for the owner's wallet;
// nothing here signs or spends. The same plans the MCP server offers, for code that would rather not speak MCP.
import type { ActionAsk, Address, BuildAsk, KeyGrant, LadderAsk, LimitAsk, OpenPoolAsk, Plan, PoolsAnswer, SwapAsk, Usage } from "./types.js";

export type LoomDeskOptions = {
  /** a key from `getKey()`: a quota of your own (120 units a minute, 10,000 a day) instead of your address's */
  key?: string;
  /** default https://loomdesk.trade */
  baseUrl?: string;
  /** your own fetch, for a proxy or a test */
  fetch?: typeof fetch;
};

/** An answer LoomDesk refused or could not give. `status` is the HTTP status; `body` what it said. */
export class LoomDeskError extends Error {
  constructor(message: string, public status: number, public body: unknown) {
    super(message);
    this.name = "LoomDeskError";
  }
}
/** Over quota (429) or the node busy (503): wait `retryAfterSeconds`, do not loop. */
export class LoomDeskRateLimited extends LoomDeskError {
  constructor(message: string, status: number, body: unknown, public retryAfterSeconds: number, public usage: Usage) {
    super(message, status, body);
    this.name = "LoomDeskRateLimited";
  }
}
/** The planner refused the plan itself (422): the message says why, in words meant to be acted on. */
export class LoomDeskPlanRefused extends LoomDeskError {
  constructor(message: string, body: unknown) {
    super(message, 422, body);
    this.name = "LoomDeskPlanRefused";
  }
}

const num = (s: string | undefined) => (s === undefined ? undefined : Number(s));
/** The draft IETF RateLimit fields LoomDesk answers with, read back. */
export function usageFrom(headers: Headers): Usage {
  const u: Usage = {};
  const rl = headers.get("ratelimit") ?? "";
  const pol = headers.get("ratelimit-policy") ?? "";
  const minute = /"minute";r=(\d+)/.exec(rl);
  const day = /"day";r=(\d+)/.exec(rl);
  const qMin = /"minute";q=(\d+)/.exec(pol);
  const qDay = /"day";q=(\d+)/.exec(pol);
  if (minute) u.unitsLeftThisMinute = Number(minute[1]);
  if (day) u.unitsLeftToday = Number(day[1]);
  if (qMin) u.perMinute = Number(qMin[1]);
  if (qDay) u.perDay = Number(qDay[1]);
  const ra = num(headers.get("retry-after") ?? undefined);
  if (ra !== undefined && Number.isFinite(ra)) u.retryAfterSeconds = ra;
  return u;
}

export class LoomDesk {
  readonly baseUrl: string;
  private key?: string;
  private readonly f: typeof fetch;
  /** what the last answer said is left of your quota */
  usage: Usage = {};

  constructor(opts: LoomDeskOptions = {}) {
    this.baseUrl = (opts.baseUrl ?? "https://loomdesk.trade").replace(/\/$/, "");
    this.key = opts.key;
    this.f = opts.fetch ?? globalThis.fetch;
    if (!this.f) throw new Error("no fetch: pass one in options, or use Node 18 or newer");
  }

  /** A free key: a quota of your own, and your agent's standing on LoomDesk. Keep it out of public code. The client
   *  uses it from then on. A few a day per address. */
  async getKey(name?: string): Promise<KeyGrant> {
    const r = await this.f(`${this.baseUrl}/api/agent/key`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(name ? { name } : {}) });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw this.refusal(r, body);
    this.key = (body as KeyGrant).key;
    return body as KeyGrant;
  }
  /** Use a key you already have. */
  useKey(key: string | undefined): void { this.key = key; }

  /** The pools of a token a ladder can go in, in the order the site offers them, best first. */
  pools(token: Address): Promise<PoolsAnswer> { return this.plan({ plan: "pools", token }) as Promise<PoolsAnswer>; }
  /** A ladder from assets the wallet holds. */
  planLadder(ask: LadderAsk): Promise<Plan> { return this.plan({ plan: "ladder", ...ask }) as Promise<Plan>; }
  /** A limit buy or sell. */
  planLimit(ask: LimitAsk): Promise<Plan> { return this.plan({ plan: "limit", ...ask }) as Promise<Plan>; }
  /** Collect, close, take the NFTs, set the fill rule, give the ladder away, or delegate it. */
  planAction(ask: ActionAsk): Promise<Plan> { return this.plan({ plan: "action", ...ask }) as Promise<Plan>; }
  /** A new pool on LoomOpenHookV2. Prefer `planBuild`, which opens the pool and builds the ladder in one transaction. */
  planOpenPool(ask: OpenPoolAsk): Promise<Plan> { return this.plan({ plan: "open_pool", ...ask }) as Promise<Plan>; }
  /** One transaction from ETH or USDG to a ladder, the pool opened on LoomDesk's hook on the way when the pair has none. */
  planBuild(ask: BuildAsk): Promise<Plan> { return this.plan({ plan: "build", ...ask }) as Promise<Plan>; }
  /** A swap through Nordstern's aggregator. */
  planSwap(ask: SwapAsk): Promise<Plan> { return this.plan({ plan: "swap", ...ask }) as Promise<Plan>; }

  /** A token as the site measures it: price, pools, depth, flags. */
  async token(address: Address): Promise<Record<string, unknown>> { return this.get(`/api/index/token?address=${address}`); }
  /** A wallet's ladders on every LoomLadder, with their rungs, fees waiting, value and history. */
  async ladders(address: Address): Promise<{ ladders: Array<Record<string, unknown> & { id: string; contract: Address }>; [key: string]: unknown }> { return this.get(`/api/ladders?address=${address}`) as never; }

  private headers(json = true): Record<string, string> {
    const h: Record<string, string> = json ? { "content-type": "application/json" } : {};
    if (this.key) h.authorization = `Bearer ${this.key}`;
    return h;
  }
  private async plan(body: Record<string, unknown>): Promise<unknown> {
    const r = await this.f(`${this.baseUrl}/api/agent/ladder`, { method: "POST", headers: this.headers(), body: JSON.stringify(body) });
    this.usage = usageFrom(r.headers);
    const out = await r.json().catch(() => ({}));
    if (!r.ok) throw this.refusal(r, out);
    return out;
  }
  private async get(path: string): Promise<Record<string, unknown>> {
    const r = await this.f(`${this.baseUrl}${path}`, { headers: this.headers(false) });
    const out = await r.json().catch(() => ({}));
    if (!r.ok) throw this.refusal(r, out);
    return out as Record<string, unknown>;
  }
  private refusal(r: Response, body: unknown): LoomDeskError {
    const msg = (body as { error?: string })?.error ?? `LoomDesk answered ${r.status}`;
    if (r.status === 429 || r.status === 503) {
      const u = usageFrom(r.headers);
      const ra = (body as { retryAfterSeconds?: number })?.retryAfterSeconds ?? u.retryAfterSeconds ?? 5;
      return new LoomDeskRateLimited(msg, r.status, body, ra, u);
    }
    if (r.status === 422) return new LoomDeskPlanRefused(msg, body);
    return new LoomDeskError(msg, r.status, body);
  }
}
