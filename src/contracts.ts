// Robinhood Chain and LoomDesk's contracts on it, as of 6 October 2026. A plan from LoomDesk only ever goes to these
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
  /** the current LoomLadder (ladders in any pool with a money side); give and setDelegate live here */
  loomLadder: "0x75F858eEF29b47bE1a1254568f938aedB0F15f6C" as Address,
  /** one asset in, a whole ladder out; opens a pool on the hook on the way */
  loomZap: "0x345d539094485888038Ca444E03b8eE52e68afAC" as Address,
  /** the autopilot's gas tank */
  pilotGas: "0x86B5776F64fF26943724C0E5117c0b1b58d15f90" as Address,
  /** the open hook new pools go on since 9 October 2026: any range, 0.1% to 5%, a launch fee, a volatility fee and the
   *  creator's blocks if wanted; what it takes for the book goes to the book */
  loomBlocksHook: "0x8A82E05AA319E506631810D1dC1f20BE248C20cc" as Address,
  /** LoomLock: liquidity locked for good. A ladder given to it can never be taken out; its fees go to the beneficiary
   *  its owner named (planAction lock / collect_locked) */
  loomLock: "0x60e7bCF343CeB3b5c912155140cF4230B4ffbF55" as Address,
  /** LoomBurner: everything that lands there ends as LOOM burned (the hook's payee on its first night; the book's sink since) */
  loomBurner: "0x98Ec6E06482765795c21B3eF39Faa3bE1674a87B" as Address,
  /** the open hook before it (pools opened there stay there): any range, a launch fee and a volatility fee if wanted */
  loomOpenHookV2: "0x809397880B3A31C4E88cf6Aba367a45509e320CC" as Address,
  /** full-range pools anyone can open, every fee in the quote, arbitrage pays the gap */
  loomFullHook: "0x3AD87F5b9cf8F17eD39d787Eef3d9D19053D28Cc" as Address,
  /** the book's LOOM/WETH pool */
  loomPairsHookV2: "0xE92bde61aBdb4C7bbCfC94554033a74998c928Cc" as Address,
  /** the swap router a plan's swaps go through (Nordstern's Guard router) */
  swapRouter: "0x603206D6105217DD972E4Ab30676A220CA393346" as Address,
  usdg: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168" as Address,
  weth: "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73" as Address,
  uniswapV4PoolManager: "0x8366a39CC670B4001A1121B8F6A443A643e40951" as Address,
  uniswapV4StateView: "0xF3334192D15450CdD385c8B70e03f9A6bD9E673b" as Address,
  uniswapV4PositionManager: "0x58daec3116aae6D93017bAAea7749052E8a04fA7" as Address,
} as const;

/** Earlier LoomLadders, still live for the ladders opened in them. */
export const LEGACY_LADDERS: Address[] = [
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
];

/** Where a plan's transactions may go, by default: LoomDesk's contracts, the swap router, USDG and WETH (approvals). */
export const TRUSTED: Address[] = [
  ADDRESSES.loomLadder, ADDRESSES.loomZap, ADDRESSES.pilotGas, ADDRESSES.loomLock, ADDRESSES.loomBlocksHook, ADDRESSES.loomOpenHookV2, ADDRESSES.loomFullHook,
  ADDRESSES.swapRouter, ADDRESSES.usdg, ADDRESSES.weth, ...LEGACY_LADDERS,
];

/** The permissions a delegate may be given, summed: `DELEGATE.collect + DELEGATE.rules` is 12. */
export const DELEGATE = { add: 1, remove: 2, collect: 4, rules: 8 } as const;
