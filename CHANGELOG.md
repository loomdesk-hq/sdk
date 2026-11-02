## 0.7.1 (2026-11-02)

Four low findings from Hey Research Lab's read of 0.7.0, all under the same threat model as before (a hostile plan reaching a trusted contract), none exploitable by LoomDesk's own plans, none seen on chain:

- The router check accepted the router itself (ADDRESS_THIS) as a recipient without asking whether the execute moved everything back out. A plan could wrap the wallet's ETH to the router, or pull tokens to it with Permit2, and end there: the router keeps no balances, so anyone sweeps them in the next transaction. Now every currency routed to the router must leave it by the end (a sweep, an unwrap, a v4 take to the wallet), and ETH sent with the call must be spent inside it (a wrap, a v4 settle).
- Commands were read with a 0x3f mask; the router masks with 0x7f, where 0x40 is a bridge deposit. The check read 0x40 as a v3 swap. Now the router's mask is used, every type the check does not know is refused, and so is the allow-revert flag.
- A give to one of LoomDesk's lock contracts was refused as a handover unless the lock was named in `recipients`, which the README's lock example never did. The locks are known contracts: a give to them passes.
- Noted, not changed here: the agent plugins' guard sent router calls undecoded (fixed in loomdesk-agents 0.1.1), and the MCP skill's "before signing" list now says every recipient must be the user's own wallet.

## 0.7.0 (2026-11-02)

- `sendPlan` and `assertSendable` now read where every call pays. A close, collect, withdrawal or open on LoomLadder, a PilotGas fill or withdrawal, a LoomStake withdrawal, and every command and v4 action of a Universal Router swap must name the wallet (or the router itself, inside a swap). Anything else is refused, as is a call to one of these contracts the SDK cannot read, or a router command LoomDesk's swaps never use (TRANSFER, PAY_PORTION). A give or a delegate goes only to an address named in the new `recipients` option. Before this, a plan to a trusted contract was sent whatever it named: a compromised planner, proxy or DNS could have had the wallet close a ladder to someone else, open one for someone else, or sweep a swap elsewhere.
- `assertSendable` takes `owner` and `recipients` in its options; without `owner` it checks as before (destinations and approvals only). `sendPlan` always passes the wallet's address.
- Tests: `npm test`.

