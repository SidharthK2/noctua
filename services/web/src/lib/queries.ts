import { signQuote } from "@noctua/shared"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { Address } from "viem"
import { maxUint256, zeroAddress } from "viem"
import { useAccount, usePublicClient, useWalletClient } from "wagmi"
import type { QuoteWire, RfqWire } from "../api.js"
import { createRfq, getRfq, listRfqs, submitQuote } from "../api.js"
import { erc20Abi, noctuaAbi } from "./abi.js"
import {
  COLLATERAL_ASSET_ADDRESS,
  LOAN_ASSET_ADDRESS,
  NOCTUA_ADDRESS,
  ORACLE_ADDRESS,
} from "./addresses.js"
import { CHAIN_ID } from "./chain.js"
import { parseUnits18 } from "./format.js"
import { wireQuoteToOnchain } from "./quote.js"
import type { StatusEvent } from "./status.js"

const DEFAULT_LLTV = 800_000_000_000_000_000n // 0.8e18
const FAUCET_LOAN_AMOUNT = parseUnits18("100000") // 100,000 DAI
const FAUCET_COLLATERAL_AMOUNT = parseUnits18("100") // 100 WETH

export type RfqDetail = RfqWire & { quotes: QuoteWire[] }

function addrKey(address: Address | undefined): string {
  return address ? address.toLowerCase() : "none"
}

export const queryKeys = {
  myRfqs: (borrower: Address | undefined) => ["rfqs", "mine", addrKey(borrower)] as const,
  openRfqs: () => ["rfqs", "open"] as const,
  balances: (wallet: Address | undefined) => ["balances", addrKey(wallet)] as const,
}

/** RFQs posted by the connected wallet, with quote details attached. */
export function useMyRfqs() {
  const { address } = useAccount()
  return useQuery({
    queryKey: queryKeys.myRfqs(address),
    queryFn: async (): Promise<RfqDetail[]> => {
      const all = await listRfqs()
      const mine = all.filter((r) => r.borrower.toLowerCase() === address?.toLowerCase())
      const details = await Promise.all(mine.map((r) => getRfq(r.id)))
      details.sort((a, b) => b.createdAt - a.createdAt)
      return details
    },
    enabled: address !== undefined,
    refetchInterval: 3000,
  })
}

/** Open RFQs available for the connected wallet to quote against (all of them, including its
 * own — one wallet can act as both borrower and maker in this demo). */
export function useOpenRfqs() {
  const { isConnected } = useAccount()
  return useQuery({
    queryKey: queryKeys.openRfqs(),
    queryFn: () => listRfqs("open"),
    enabled: isConnected,
    refetchInterval: 3000,
  })
}

export type Balances = {
  walletLoan: bigint
  walletColl: bigint
  escrowLoan: bigint
  escrowColl: bigint
}

/** Connected wallet + Noctua escrow token balances shown in the bottom status bar. */
export function useBalances() {
  const { address } = useAccount()
  const publicClient = usePublicClient()
  return useQuery({
    queryKey: queryKeys.balances(address),
    queryFn: async (): Promise<Balances> => {
      if (!publicClient || !address) throw new Error("wallet not connected")
      const balanceOf = (token: `0x${string}`, holder: `0x${string}`) =>
        publicClient.readContract({
          address: token,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [holder],
        })

      const [walletLoan, walletColl, escrowLoan, escrowColl] = await Promise.all([
        balanceOf(LOAN_ASSET_ADDRESS, address),
        balanceOf(COLLATERAL_ASSET_ADDRESS, address),
        balanceOf(LOAN_ASSET_ADDRESS, NOCTUA_ADDRESS),
        balanceOf(COLLATERAL_ASSET_ADDRESS, NOCTUA_ADDRESS),
      ])
      return { walletLoan, walletColl, escrowLoan, escrowColl }
    },
    enabled: !!address && !!publicClient,
    refetchInterval: 3000,
  })
}

/** Posts a new RFQ as the connected wallet. */
export function usePostRfqMutation(onStatus: (event: StatusEvent) => void) {
  const { address } = useAccount()
  const publicClient = usePublicClient()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      principalInput: string
      collateralInput: string
      daysInput: string
    }) => {
      if (!address) throw new Error("connect a wallet first")
      if (!publicClient) throw new Error("no RPC client for the active chain")
      const block = await publicClient.getBlock()
      const maturity = block.timestamp + BigInt(input.daysInput) * 86_400n
      return createRfq({
        borrower: address,
        loanAsset: LOAN_ASSET_ADDRESS,
        collateralAsset: COLLATERAL_ASSET_ADDRESS,
        principal: parseUnits18(input.principalInput),
        collateral: parseUnits18(input.collateralInput),
        maturity,
      })
    },
    onSuccess: (rfq) => {
      onStatus({ kind: "info", label: `posted RFQ ${rfq.id.slice(0, 8)}` })
      queryClient.invalidateQueries({ queryKey: queryKeys.myRfqs(address) })
    },
    onError: (err) => {
      onStatus({ kind: "error", label: "post RFQ failed", message: (err as Error).message })
    },
  })
}

/** Accept flow: approve collateral, then fill the quote on-chain via the connected wallet. */
export function useAcceptQuoteMutation(onStatus: (event: StatusEvent) => void) {
  const { address } = useAccount()
  const { data: walletClient } = useWalletClient()
  const publicClient = usePublicClient()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ rfqId, quoteWire }: { rfqId: string; quoteWire: QuoteWire }) => {
      if (!walletClient || !publicClient) throw new Error("connect a wallet first")
      const onchain = wireQuoteToOnchain(quoteWire.quote)

      const approveHash = await walletClient.writeContract({
        address: onchain.collateralAsset,
        abi: erc20Abi,
        functionName: "approve",
        args: [NOCTUA_ADDRESS, onchain.collateral],
      })
      await publicClient.waitForTransactionReceipt({ hash: approveHash })
      onStatus({ kind: "tx", label: "approved collateral", hash: approveHash })

      const fillHash = await walletClient.writeContract({
        address: NOCTUA_ADDRESS,
        abi: noctuaAbi,
        functionName: "fill",
        args: [onchain, quoteWire.signature],
      })
      await publicClient.waitForTransactionReceipt({ hash: fillHash })
      onStatus({ kind: "tx", label: "filled quote", hash: fillHash })

      return { rfqId, quoteWire }
    },
    onSuccess: () => {
      // The chain watcher observes the on-chain Filled event and marks the RFQ filled;
      // the 3s refetch above will pick up the status change. The caller records the
      // in-memory accepted-quote bridge itself (acceptedByRfqId) before this resolves.
      queryClient.invalidateQueries({ queryKey: queryKeys.myRfqs(address) })
      queryClient.invalidateQueries({ queryKey: queryKeys.balances(address) })
    },
    onError: (err) => {
      onStatus({ kind: "error", label: "accept failed", message: (err as Error).message })
    },
  })
}

/** Repay flow: approve repayment amount, then repay the loan on-chain via the connected wallet. */
export function useRepayLoanMutation(onStatus: (event: StatusEvent) => void) {
  const { address } = useAccount()
  const { data: walletClient } = useWalletClient()
  const publicClient = usePublicClient()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ rfqId: _rfqId, quoteWire }: { rfqId: string; quoteWire: QuoteWire }) => {
      if (!walletClient || !publicClient) throw new Error("connect a wallet first")
      const onchain = wireQuoteToOnchain(quoteWire.quote)

      const approveHash = await walletClient.writeContract({
        address: onchain.loanAsset,
        abi: erc20Abi,
        functionName: "approve",
        args: [NOCTUA_ADDRESS, onchain.repayment],
      })
      await publicClient.waitForTransactionReceipt({ hash: approveHash })
      onStatus({ kind: "tx", label: "approved repayment", hash: approveHash })

      const repayHash = await walletClient.writeContract({
        address: NOCTUA_ADDRESS,
        abi: noctuaAbi,
        functionName: "repay",
        args: [onchain],
      })
      await publicClient.waitForTransactionReceipt({ hash: repayHash })
      onStatus({ kind: "tx", label: "repaid loan", hash: repayHash })
    },
    onSuccess: () => {
      // The chain watcher observes the on-chain Repaid event and flips loanStatus itself;
      // the refetch above will pick up the change within a poll or two.
      queryClient.invalidateQueries({ queryKey: queryKeys.myRfqs(address) })
      queryClient.invalidateQueries({ queryKey: queryKeys.balances(address) })
    },
    onError: (err) => {
      onStatus({ kind: "error", label: "repay failed", message: (err as Error).message })
    },
  })
}

/** Sign & send flow: maxUint256-approve the loan asset once, then sign (EIP-712, via wallet
 * popup) and submit a quote as the connected wallet. */
export function useSendQuoteMutation(onStatus: (event: StatusEvent) => void) {
  const { address } = useAccount()
  const { data: walletClient } = useWalletClient()
  const publicClient = usePublicClient()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      rfq,
      repaymentInput,
      expiryMinutesInput,
      oracleOn,
    }: {
      rfq: RfqWire
      repaymentInput: string
      expiryMinutesInput: string
      oracleOn: boolean
    }) => {
      if (!walletClient || !publicClient || !address) throw new Error("connect a wallet first")

      const approveHash = await walletClient.writeContract({
        address: rfq.loanAsset,
        abi: erc20Abi,
        functionName: "approve",
        args: [NOCTUA_ADDRESS, maxUint256],
      })
      await publicClient.waitForTransactionReceipt({ hash: approveHash })
      onStatus({ kind: "tx", label: "approved loan asset", hash: approveHash })

      const nonce = await publicClient.readContract({
        address: NOCTUA_ADDRESS,
        abi: noctuaAbi,
        functionName: "nonces",
        args: [address],
      })
      const block = await publicClient.getBlock()
      const expiry = block.timestamp + BigInt(expiryMinutesInput) * 60n

      const quote = {
        maker: address,
        taker: rfq.borrower,
        loanAsset: rfq.loanAsset,
        collateralAsset: rfq.collateralAsset,
        oracle: oracleOn ? ORACLE_ADDRESS : zeroAddress,
        principal: BigInt(rfq.principal),
        repayment: parseUnits18(repaymentInput),
        collateral: BigInt(rfq.collateral),
        lltv: oracleOn ? DEFAULT_LLTV : 0n,
        maturity: BigInt(rfq.maturity),
        expiry,
        nonce,
      }

      const signature = await signQuote(walletClient, quote, CHAIN_ID, NOCTUA_ADDRESS)
      const stored = await submitQuote(rfq.id, { ...quote, signature })
      return { rfq, stored }
    },
    onSuccess: ({ rfq }) => {
      onStatus({ kind: "info", label: `sent quote for RFQ ${rfq.id.slice(0, 8)}` })
      queryClient.invalidateQueries({ queryKey: queryKeys.openRfqs() })
    },
    onError: (err) => {
      onStatus({ kind: "error", label: "send quote failed", message: (err as Error).message })
    },
  })
}

/** Faucet: mints 100,000 DAI and 100 WETH to the connected wallet via two txs (ERC20Mock.mint is
 * public). Testnet/demo only — never wire this up against a real token. */
export function useFaucetMutation(onStatus: (event: StatusEvent) => void) {
  const { address } = useAccount()
  const { data: walletClient } = useWalletClient()
  const publicClient = usePublicClient()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      if (!walletClient || !publicClient || !address) throw new Error("connect a wallet first")

      const daiHash = await walletClient.writeContract({
        address: LOAN_ASSET_ADDRESS,
        abi: erc20Abi,
        functionName: "mint",
        args: [address, FAUCET_LOAN_AMOUNT],
      })
      await publicClient.waitForTransactionReceipt({ hash: daiHash })
      onStatus({ kind: "tx", label: "minted 100,000 DAI", hash: daiHash })

      const wethHash = await walletClient.writeContract({
        address: COLLATERAL_ASSET_ADDRESS,
        abi: erc20Abi,
        functionName: "mint",
        args: [address, FAUCET_COLLATERAL_AMOUNT],
      })
      await publicClient.waitForTransactionReceipt({ hash: wethHash })
      onStatus({ kind: "tx", label: "minted 100 WETH", hash: wethHash })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.balances(address) })
    },
    onError: (err) => {
      onStatus({ kind: "error", label: "faucet failed", message: (err as Error).message })
    },
  })
}
