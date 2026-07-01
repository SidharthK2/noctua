/**
 * Hand-trimmed ABI fragments — only the functions this demo calls. Kept in sync by hand with
 * `contracts/src/Noctua.sol` / `contracts/test/mocks/ERC20Mock.sol`; avoids a build-time
 * dependency on `contracts/out/**`.
 */

const quoteTupleComponents = [
  { name: "maker", type: "address" },
  { name: "taker", type: "address" },
  { name: "loanAsset", type: "address" },
  { name: "collateralAsset", type: "address" },
  { name: "oracle", type: "address" },
  { name: "principal", type: "uint256" },
  { name: "repayment", type: "uint256" },
  { name: "collateral", type: "uint256" },
  { name: "lltv", type: "uint256" },
  { name: "maturity", type: "uint256" },
  { name: "expiry", type: "uint256" },
  { name: "nonce", type: "uint256" },
] as const

export const noctuaAbi = [
  {
    type: "function",
    name: "fill",
    stateMutability: "nonpayable",
    inputs: [
      { name: "quote", type: "tuple", components: quoteTupleComponents },
      { name: "signature", type: "bytes" },
    ],
    outputs: [{ name: "quoteHash", type: "bytes32" }],
  },
  {
    type: "function",
    name: "repay",
    stateMutability: "nonpayable",
    inputs: [{ name: "quote", type: "tuple", components: quoteTupleComponents }],
    outputs: [],
  },
  {
    type: "function",
    name: "hashQuote",
    stateMutability: "view",
    inputs: [{ name: "quote", type: "tuple", components: quoteTupleComponents }],
    outputs: [{ name: "", type: "bytes32" }],
  },
  {
    type: "function",
    name: "loans",
    stateMutability: "view",
    inputs: [{ name: "quoteHash", type: "bytes32" }],
    outputs: [
      { name: "borrower", type: "address" },
      { name: "status", type: "uint8" },
    ],
  },
  {
    type: "function",
    name: "nonces",
    stateMutability: "view",
    inputs: [{ name: "maker", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const

export const erc20Abi = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "value", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const

/** Mirrors `Noctua.Status`: None, Active, Repaid, Liquidated, Defaulted. */
export const LOAN_STATUS = ["None", "Active", "Repaid", "Liquidated", "Defaulted"] as const
