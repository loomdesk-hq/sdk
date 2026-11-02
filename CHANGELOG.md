## 0.7.0 (2026-11-02)

- `sendPlan` and `assertSendable` now read where every call pays. A close, collect, withdrawal or open on LoomLadder, a PilotGas fill or withdrawal, a LoomStake withdrawal, and every command and v4 action of a Universal Router swap must name the wallet (or the router itself, inside a swap). Anything else is refused, as is a call to one of these contracts the SDK cannot read, or a router command LoomDesk's swaps never use (TRANSFER, PAY_PORTION). A give or a delegate goes only to an address named in the new `recipients` option. Before this, a plan to a trusted contract was sent whatever it named: a compromised planner, proxy or DNS could have had the wallet close a ladder to someone else, open one for someone else, or sweep a swap elsewhere.
- `assertSendable` takes `owner` and `recipients` in its options; without `owner` it checks as before (destinations and approvals only). `sendPlan` always passes the wallet's address.
- Tests: `npm test`.

