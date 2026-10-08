// LoomDesk's contracts, as viem ABIs, for reading them directly or encoding a call yourself. The planner encodes
// every write for you; these are here for reads (a ladder's rungs, a delegate, a pool's fee right now) and for
// anyone building without the planner.
import { parseAbi } from "viem";

export const erc20Abi = parseAbi([
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
]);

/** LoomLadder: ladders in any v3 or v4 pool with a money side. The current one has give and setDelegate. */
export const loomLadderAbi = parseAbi([
  "struct Rung { int24 tickLower; int24 tickUpper; uint256 amount0; uint256 amount1; }",
  "struct PoolKey { address currency0; address currency1; uint24 fee; int24 tickSpacing; address hooks; }",
  "struct Ladder { address owner; uint8 version; address nft; address currency0; address currency1; uint256[] tokenIds; }",
  "struct Credit { address referrer; uint256 copyOf; }",
  "function openV3For(address owner, address npm, address token0, address token1, uint24 fee, Rung[] rungs, uint160 sqrtPriceMin, uint160 sqrtPriceMax, uint256 deadline, Credit credit) returns (uint256)",
  "function openV4For(address owner, PoolKey key, Rung[] rungs, uint160 sqrtPriceMin, uint160 sqrtPriceMax, uint256 deadline, bytes hookData, Credit credit) payable returns (uint256)",
  "function add(uint256 ladderId, uint16 shareBps, uint256 max0, uint256 max1, uint256 deadline, bytes hookData) payable returns (uint256, uint256)",
  "function referrerOf(address) view returns (address)",
  "function moneySide(address c0, address c1) view returns (uint8)",
  "function openBps() view returns (uint16)",
  "function refBps() view returns (uint16)",
  "function copyBps() view returns (uint16)",
  "function collect(uint256 ladderId, address to, bytes hookData) returns (uint256, uint256)",
  "function compounds(uint256 ladderId) view returns (bool)",
  "function setCompound(uint256 ladderId, bool on)",
  "function compound(uint256 ladderId, uint256[] into, bytes hookData) returns (uint256 used0, uint256 used1)",
  "function close(uint256 ladderId, address to, uint256 amount0Min, uint256 amount1Min, uint256 deadline, bytes hookData) returns (uint256, uint256)",
  "function closePart(uint256 ladderId, address to, uint16 shareBps, uint256 amount0Min, uint256 amount1Min, uint256 deadline, bytes hookData) returns (uint256, uint256)",
  "function withdraw(uint256 ladderId, address to, bytes hookData)",
  "function claimOwed(address currency, address to) returns (uint256)",
  "function ladder(uint256 id) view returns (Ladder)",
  "function entryOf(uint256 id) view returns (uint256 value, bytes32 pool, uint8 side)",
  "function laddersOf(address owner) view returns (uint256[])",
  "function npmAllowed(address) view returns (bool)",
  "function paused() view returns (bool)",
  "function feeBps() view returns (uint16)",
  "function feeBpsFor(address owner) view returns (uint256)",
  "function pilot() view returns (address)",
  "function autoOf(uint256 ladderId) view returns (uint256)",
  "function feesSince(uint256 ladderId) view returns (uint256)",
  "function pilotedAt(uint256 ladderId) view returns (uint64)",
  "function setAuto(uint256 ladderId, uint256 packed)",
  "function give(uint256 ladderId, address to)",
  "function setDelegate(uint256 ladderId, address who, uint8 perms)",
  "function delegateOf(uint256) view returns (uint256)",
  "event Given(uint256 indexed ladderId, address indexed from, address indexed to)",
  "event DelegateSet(uint256 indexed ladderId, address indexed who, uint8 perms)",
  "function autoRun(uint8 kind, uint256 ladderId, bool asUsdg, uint256[3] mins, uint160[2] price, uint256 deadline, bytes hookData) returns (uint256 usdgOut, uint256 amount0, uint256 amount1)",
  "error Expired()", "error IsPaused()", "error NotYours()", "error NotAllowed()", "error BadRungs()", "error PriceOutOfBounds()", "error TooLittleOut()", "error ZeroAddress()", "error SendFailed()", "error NoMoneySide()", "error FeeTooHigh()",
  "error NotDue()", "error BadAuto()", "error TooCostly()",
]);

/** LoomZap: one asset in, a whole ladder out, the pool opened on the way when the pair has none. No owner, no settings. */
export const loomZapAbi = parseAbi([
  "struct PoolKey { address currency0; address currency1; uint24 fee; int24 tickSpacing; address hooks; }",
  "struct ZRung { int24 tickLower; int24 tickUpper; uint32 weight; }",
  "struct Credit { address referrer; uint256 copyOf; }",
  "struct Hop { address v3Pool; PoolKey key; }",
  "struct Leg { address tokenIn; uint256 amountIn; address tokenOut; uint256 minOut; bytes data; Hop hop; }",
  "struct Opening { address hook; address token; address quote; uint24 fee; uint160 sqrtPriceX96; PoolKey refKey; }",
  "function zapV4(PoolKey key, address quote, uint256 amountIn, uint256 swapAmount, uint256 minOut, ZRung[] rungs, uint256 deadline, bytes hookData, Credit credit) payable returns (uint256)",
  "function zapV3(address pool, address quote, uint256 amountIn, uint256 swapAmount, uint256 minOut, ZRung[] rungs, uint256 deadline, Credit credit) payable returns (uint256)",
  "function zapClose(uint256 ladderId, uint16 shareBps, address into, Hop hop, uint256 minOut, uint256 deadline, bytes hookData) returns (uint256)",
  "function zapCloseVia(uint256 ladderId, uint16 shareBps, address into, Leg[] sales, uint256 minOut, uint256 deadline, bytes hookData) returns (uint256)",
  "function zapAddVia(uint256 ladderId, address quote, uint256 amountIn, Leg[] legs, uint16 shareBps, uint256 deadline, bytes hookData) payable returns (uint256, uint256)",
  "function zapBuild(address payIn, uint256 amountIn, Leg[] legs, Opening opening, PoolKey key, ZRung[] rungs, uint256 deadline, bytes hookData, Credit credit) payable returns (uint256)",
  "function weth() view returns (address)",
  "function router() view returns (address)",
  "error Expired()", "error BadQuote()", "error TooLittleOut()", "error NothingToBuild()", "error NotThePool()", "error SendFailed()",
  "error BadRungs()", "error IsPaused()", "error NotAllowed()", "error ZeroAddress()", "error NotYours()",
]);

/** LoomOpenHookV2: pools anyone opens, any range. The fee is the tier plus, while they last, a launch fee and a volatility fee. */
export const loomOpenHookV2Abi = parseAbi([
  "struct PoolKey { address currency0; address currency1; uint24 fee; int24 tickSpacing; address hooks; }",
  "function createPoolWith(address token, address quote, uint24 fee, uint160 sqrtPriceX96, PoolKey refKey, bool vol, uint24 launchFee, uint32 launchSecs) payable returns (bytes32)",
  "function feeNow(bytes32 poolId) view returns (uint24 fee, uint24 base, uint24 launch, uint24 volatility)",
  "function pools(bytes32) view returns (uint24 fee, bool quoteIs0, address creator, bool vol, uint24 launchFee, uint32 launchSecs, uint32 openedAt)",
  "function vol() view returns (uint24 slope, uint24 free, uint24 max, uint16 fall)",
  "error BadLaunch()", "error BadVol()", "error BadQuote()", "error BadTier()", "error BadPrice()", "error BadReference()", "error Exists()", "error IsPaused()", "error WrongFee()", "error SendFailed()",
]);

/** LoomBlocksHook: the open hook with the creator's blocks, set at opening; V2's calls still work on it. */
export const loomBlocksHookAbi = parseAbi([
  "struct PoolKey { address currency0; address currency1; uint24 fee; int24 tickSpacing; address hooks; }",
  "struct Blocks { uint8 mask; uint32 snipeSecs; uint128 snipeMaxQuote; uint24 royalty; uint24 burn; uint32 sellLockSecs; uint24 feeFloor; uint24 feeCeil; uint24 offHoursFee; }",
  "function createPoolBlocks(address token, address quote, uint24 fee, uint160 sqrtPriceX96, PoolKey refKey, bool vol, uint24 launchFee, uint32 launchSecs, Blocks b) payable returns (bytes32)",
  "function feeNow(bytes32 poolId) view returns (uint24 fee, uint24 base, uint24 launch, uint24 volatility, uint24 royalty, uint24 burn)",
  "function pools(bytes32) view returns (uint24 fee, bool quoteIs0, address creator, bool vol, uint24 launchFee, uint32 launchSecs, uint32 openedAt, int24 spacing, uint8 blocks)",
  "function blocksOf(bytes32) view returns (uint8 mask, uint32 snipeSecs, uint128 snipeMaxQuote, uint24 royalty, uint24 burn, uint32 sellLockSecs, uint24 feeFloor, uint24 feeCeil, uint24 offHoursFee)",
  "function setFee(bytes32 poolId, uint24 fee)",
  "function marketOpen() view returns (bool)",
  "error BadBlocks()", "error SellLocked(uint32 until)", "error SnipeTooBig(uint256 quoteAmount, uint256 most)", "error NotCreator()", "error FeeOutOfBounds()", "error TooSoon()",
]);

/** LoomFullHook: full-range pools anyone opens, every fee in the quote; a swap that closes a wide gap to the token's market pays for it. */
export const loomFullHookAbi = parseAbi([
  "function createPool(address token, address quote, uint24 fee, uint160 sqrtPriceX96, address ref, uint24 launchFee, uint32 launchSecs) payable returns (bytes32)",
  "function feeNow(bytes32 poolId) view returns (uint24 buyFee, uint24 sellFee, uint24 base, uint24 launch, int32 gapPips, bool priced)",
  "function pools(bytes32) view returns (uint24 fee, bool quoteIs0, address creator, uint24 launchFee, uint32 launchSecs, uint32 openedAt, address ref, bool refTokenIs0)",
  "function gap() view returns (uint24 slope, uint24 plus, uint24 cap, uint32 window)",
  "function spacingOf(uint24) view returns (int24)",
  "function creationFeeEth() view returns (uint256)",
  "function creationFeeUsdg() view returns (uint256)",
  "function paused() view returns (bool)",
  "error BadLaunch()", "error BadQuote()", "error BadTier()", "error BadPrice()", "error BadReference()", "error Exists()", "error IsPaused()", "error WrongFee()", "error SendFailed()", "error OnlyFullRange()",
]);

/** PilotGas: the gas tank the keeper spends from when it runs a ladder's autopilot rules. */
export const pilotGasAbi = parseAbi([
  "function balanceOf(address owner) view returns (uint256)",
  "function maxGasPrice() view returns (uint256)",
  "function overheadGas() view returns (uint256)",
  "function costOf(uint256 gas, uint256 gasPrice) view returns (uint256)",
  "function deposit() payable",
  "function depositFor(address owner) payable",
  "function withdraw(uint256 amount, address to)",
  "error NotAllowed()", "error NoGas()", "error SendFailed()", "error ZeroAddress()",
]);
