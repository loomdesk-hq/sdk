// Robinhood Chain and LoomDesk's contracts on it, as of 27 October 2026. A plan from LoomDesk only ever goes to these
// (and to a token for an approval). LoomLadder moves with each migration and the earlier ones stay live for the
// ladders in them: the current list is always at https://loomdesk.trade/llms.txt, and `ladders()` names the contract
// each of your ladders lives in.
import { defineChain } from "viem";
import type { Address } from "./types.js";

export const CHAIN_ID = 4663;

/** Robinhood Chain, for viem clients. The public RPC rate-limits; use your own node or provider when you can. */
export const robinhoodChain = defineChain({
  id: CHAIN_ID,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.mainnet.chain.robinhood.com"] } },
  blockExplorers: { default: { name: "Blockscout", url: "https://robinhoodchain.blockscout.com" } },
});

export const ADDRESSES = {
  /** the current LoomLadder (ladders in any pool with a money side, since the evening of 30 October 2026, with the fixes of ContractWolf's report and the re-lay fixes after it); give and setDelegate live here */
  loomLadder: "0x792cC8791AEb4D61a894DC770d38e98ae8537aFA" as Address,
  /** one asset in, a whole ladder out; opens a pool on the hook on the way. The current LoomLadder's own zap */
  loomZap: "0x6e292580F888f13B70335985482a2bcb526d1ffF" as Address,
  /** puts an empty v4 pool's price back at the market before a ladder is laid in it; trades nothing */
  priceSetter: "0xE1394FBDFaA0186EDA5a999f4076002179100d2B" as Address,
  /** the autopilot's gas tank of the current LoomLadder (a tank serves one ladder contract) */
  pilotGas: "0x3A56f62ebba59d6531d9c24fe451B4e506D2eCDE" as Address,
  /** the tank of 0x96D6…8E01: what owners left there stays theirs to take back, and it goes on serving that ladder */
  pilotGasV2: "0xc658aBA5c0095f5Bff9891E289A17F05F3730162" as Address,
  /** the tank of the ladder before it, 0x72e5…F273 and earlier: what owners left there stays theirs to take back */
  pilotGasV1: "0x86B5776F64fF26943724C0E5117c0b1b58d15f90" as Address,
  /** LoomStake: 100,000 LOOM staked for a week lowers a wallet's share of a ladder's fees */
  loomStake: "0xA3Bf55FA691F7481d7252DDD5905c1e29A7F8707" as Address,
  /** the open hook new pools go on since 9 October 2026: any range, 0.1% to 5%, a launch fee, a volatility fee and the
   *  creator's blocks if wanted; what it takes for the book goes to the book. No block ever refuses a trade and only a
   *  pool's creator moves its fee (this revision replaced 0x8A82…20cc the same day; that one's pools stay listed) */
  loomBlocksHook: "0x5b907B52eAcBCeE78F2C56A6e74F5cf04A96e0cC" as Address,
  /** the first blocks hook (8 to 9 October 2026), with the sell lock and an owner fee lever: its pools stay, no new ones open on it */
  loomBlocksHookV1: "0x8A82E05AA319E506631810D1dC1f20BE248C20cc" as Address,
  /** LoomLock: liquidity locked for good. A ladder given to it can never be taken out; its fees go to the beneficiary
   *  its owner named (planAction lock / collect_locked). For the current LoomLadder (its ladder()), since 27 October 2026 */
  loomLock: "0xb14feF853F7a00fCffBB93F2e70831B04E8965A4" as Address,
  /** the LoomLock of 0x96D6…8E01: what is locked there is collected through it, nothing new goes in */
  loomLockV3: "0x066EfE119d825151D221C877bb325B63b70dacA9" as Address,
  /** the LoomLock of 0x72e5…F273: what is locked there is collected through it, nothing new goes in */
  loomLockV2: "0xD0da181C2EEf028891F27a16e21ABe7C57b63660" as Address,
  /** the first LoomLock, for 0x75F8…5f6C: what is locked there is collected through it, nothing new goes in */
  loomLockV1: "0x60e7bCF343CeB3b5c912155140cF4230B4ffbF55" as Address,
  /** LoomBurner: everything that lands there ends as LOOM burned (the hook's payee on its first night; the book's sink since) */
  loomBurner: "0x98Ec6E06482765795c21B3eF39Faa3bE1674a87B" as Address,
  /** the open hook before it (pools opened there stay there): any range, a launch fee and a volatility fee if wanted */
  loomOpenHookV2: "0x809397880B3A31C4E88cf6Aba367a45509e320CC" as Address,
  /** full-range pools anyone can open, every fee in the quote, arbitrage pays the gap */
  loomFullHook: "0x3AD87F5b9cf8F17eD39d787Eef3d9D19053D28Cc" as Address,
  /** the book's LOOM/WETH pool since 9 October 2026: 4% each way at rest, more for a swap that closes a gap to the
   *  market, every fee in WETH, full-range liquidity only. A wallet never sends to it. */
  loomPairsHookV3: "0x5C3DF4D664e606E87Ea4fFD4413C7791283D28cC" as Address,
  /** the book's pool before it (10% at rest), empty since the move */
  loomPairsHookV2: "0xE92bde61aBdb4C7bbCfC94554033a74998c928Cc" as Address,
  /** the swap router a plan's swaps go through: Uniswap's Universal Router, on LoomDesk's own route (planSwap) */
  swapRouter: "0x204FAca1764B154221e35c0d20aBb3c525710498" as Address,
  /** Permit2: a swap's approval goes to it, for the exact amount, and it lets the router take that much for 30 minutes */
  permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3" as Address,
  usdg: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168" as Address,
  weth: "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73" as Address,
  uniswapV4PoolManager: "0x8366a39CC670B4001A1121B8F6A443A643e40951" as Address,
  uniswapV4StateView: "0xF3334192D15450CdD385c8B70e03f9A6bD9E673b" as Address,
  uniswapV4PositionManager: "0x58daec3116aae6D93017bAAea7749052E8a04fA7" as Address,
} as const;

/** Earlier LoomLadders, still live for the ladders opened in them. */
export const LEGACY_LADDERS: Address[] = [
  "0x96D6E6F1E5cB1f4597cC60e1aAa23170E64e8E01",
  "0x72e5dC8bb512B93E49991d541C23208B9145F273",
  "0xA68CAD7C0675007C31F8dFf7A594aA9EA973F35f",
  "0x75F858eEF29b47bE1a1254568f938aedB0F15f6C",
  "0xED7dcF8dFed7e25322809f4958052EabC5219CE4",
  "0xf6aA78Bf1524946412c127A7D7817D7803F25c9D",
  "0x8643E482303380DD4bb188A868d42b11DaA56412",
  "0x97650654737b410a6e09f3CE974106E2B393b3B2",
  "0x30Eb52b054C7EAd28f52176Ed5Dc9333e91e54a9",
  "0x970ADc65Ba854a9f0D8f0519959929DEbF2Bc25B",
  "0xe0218f7894C2493E32D377D002c818AcFc6549B4",
  "0x9042ef3A6d6A6ca03c81C14cc8EFf8065d26d8F2",
  "0xc9695D87792e3e10571c5cb1A14dd5C9026E4197",
  "0x751CA878767a71DE33F2beaB10276d76e33a2be1",
  "0xA80Ce686210b06bB9381f0f4C36981202f3d776d",
  "0x81b5aC3B68609810B99a213b9d7fea79917e7E59",
  "0x26727ce2767c7da910f8BE1841B1B1Aa58eBA930",
  "0x9f7e85061424A601ce994FD2770c7B252482BA8a",
  "0x7c4582738756444564369669a1d4DF157661cF42",
];

/** The zap of an earlier LoomLadder (a close `into` one asset of a ladder there goes through it). Another one is
 *  found on the chain: LoomLadder.zap() on that contract, whose ladder() names the contract back. */
export const LEGACY_ZAPS: Address[] = [
  "0x4A0ab8f92351a4d3117BA3F277CefdA6B63ecb2C",
  "0x465AC088C61B6bB50E3690F7BC5cAD9f491000a6",
  "0x345d539094485888038Ca444E03b8eE52e68afAC",
  "0xB120623713677497c738790862726f1F3d4B0974",
  "0x269aA9596B1185a038025F08C0f6a9B6637CC01D",
  "0xb4B9b36E7698DCA6BE6dc87c7Bae36cC0E88bDE5",
  "0x6ea6c3E85f4D9BfC658Dd752ca117d64b42e8Af0",
  "0x77bb4C9ae9689dF9E99DbCE6F5DfA0Ae0e396718",
  "0x7FB4f06cb282D47cB618448e19B42b9B105e2b15",
  "0x2911F1A4418295B14C0F908C758465a6EdA56d5d",
];

/** Where a plan's transactions may go, by default: LoomDesk's contracts, the swap router and Permit2, USDG and WETH.
 *  An approval may go to any token, as long as what it approves is one of these (assertSendable reads it). */
export const TRUSTED: Address[] = [
  ADDRESSES.loomLadder, ADDRESSES.loomZap, ADDRESSES.priceSetter, ADDRESSES.pilotGas, ADDRESSES.pilotGasV2, ADDRESSES.pilotGasV1, ADDRESSES.loomStake, ADDRESSES.loomLock, ADDRESSES.loomLockV3, ADDRESSES.loomLockV2, ADDRESSES.loomLockV1, ADDRESSES.loomBlocksHook, ADDRESSES.loomBlocksHookV1, ADDRESSES.loomOpenHookV2, ADDRESSES.loomFullHook,
  ADDRESSES.swapRouter, ADDRESSES.permit2, ADDRESSES.usdg, ADDRESSES.weth, ...LEGACY_LADDERS, ...LEGACY_ZAPS,
];

/** Never a spender and never a destination: anyone can make Multicall3 call transferFrom, so an allowance to it is anyone's. */
export const MULTICALL3: Address = "0xcA11bde05977b3631167028862bE2a173976CA11";

/** The permissions a delegate may be given, summed: `DELEGATE.collect + DELEGATE.rules` is 12. */
export const DELEGATE = { add: 1, remove: 2, collect: 4, rules: 8 } as const;
