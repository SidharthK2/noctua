import { parseAbi } from "viem"

/** Hand-trimmed ABI: only the events the ChainWatcher needs to observe. */
export const watcherAbi = parseAbi([
  "event Filled(bytes32 indexed quoteHash, address indexed maker, address indexed borrower, (address maker, address taker, address loanAsset, address collateralAsset, address oracle, uint256 principal, uint256 repayment, uint256 collateral, uint256 lltv, uint256 maturity, uint256 expiry, uint256 nonce) quote)",
  "event Cancelled(bytes32 indexed quoteHash, address indexed maker)",
  "event NonceBumped(address indexed maker, uint256 newNonce)",
])
