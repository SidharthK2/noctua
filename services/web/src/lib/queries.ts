import { signQuote } from "@noctua/shared"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { Address } from "viem"
import { maxUint256 } from "viem"
import { useAccount, usePublicClient, useWalletClient } from "wagmi"
import type { QuoteWire, RfqWire } from "../api.js"
import { createRfq, getRfq, listRfqs, submitQuote } from "../api.js"
import { erc20Abi, noctuaAbi } from "./abi.js"
import {
  COLLATERAL_ASSET_ADDRESS,
  COLLATERAL_DECIMALS,
  LOAN_ASSET_ADDRESS,
  LOAN_DECIMALS,
  NOCTUA_ADDRESS,
} from "./addresses.js"
import { ACTIVE_CHAIN, CHAIN_ID, IS_MAINNET } from "./chain.js"
import { parseUnits } from "./format.js"
import { wireQuoteToOnchain } from "./quote.js"
import type { StatusEvent } from "./status.js"

const FAUCET_LOAN_AMOUNT = parseUnits("100000000", LOAN_DECIMALS) // ₩100,000,000 KRWQ
const FAUCET_COLLATERAL_AMOUNT = parseUnits("100", COLLATERAL_DECIMALS) // 100 WETH

export type RfqDetail = RfqWire & { quotes: QuoteWire[] }

function addrKey(address: Address | undefined): string {
  return address ? address.toLowerCase() : "none"
}

export const queryKeys = {
  myRfqs: (borrower: Address | undefined) => ["rfqs", "mine", addrKey(borrower)] as const,
  openRfqs: () => ["rfqs", "open"] as const,
  makerLoans: (maker: Address | undefined) => ["rfqs", "maker-loans", addrKey(maker)] as const,
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

/** Open RFQs — public read, no wallet required (quoting against one does need a signer).
 * All of them are listed, including the connected wallet's own: one wallet can act as both
 * borrower and maker in this demo. */
export function useOpenRfqs() {
  return useQuery({
    queryKey: queryKeys.openRfqs(),
    queryFn: () => listRfqs("open"),
    refetchInterval: 3000,
  })
}

/** Loans the connected wallet has funded as a maker — filled RFQs whose winning quote's `maker`
 * is the connected wallet. Once an RFQ is filled it drops out of `useOpenRfqs`, so this is the
 * maker's only visibility into (and enforcement point for) loans it holds. */
export function useMakerLoans() {
  const { address } = useAccount()
  return useQuery({
    queryKey: queryKeys.makerLoans(address),
    queryFn: async (): Promise<Array<{ detail: RfqDetail; winningQuote: QuoteWire }>> => {
      const all = await listRfqs()
      const filled = all.filter((r) => r.status === "filled" && r.filledBy)
      const details = await Promise.all(filled.map((r) => getRfq(r.id)))
      const mine: Array<{ detail: RfqDetail; winningQuote: QuoteWire }> = []
      for (const detail of details) {
        const winningQuote = detail.quotes.find((q) => q.digest === detail.filledBy)
        if (winningQuote && winningQuote.quote.maker.toLowerCase() === address?.toLowerCase()) {
          mine.push({ detail, winningQuote })
        }
      }
      mine.sort((a, b) => b.detail.createdAt - a.detail.createdAt)
      return mine
    },
    enabled: address !== undefined,
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
  const publicClient = usePublicClient({ chainId: CHAIN_ID })
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

/** Error for actions that need the wallet on the active chain. `useWalletClient` is pinned to
 * `CHAIN_ID`, so it returns nothing while the wallet sits on another chain — name the actual
 * problem instead of claiming the user isn't connected. */
function walletNotReadyError(walletChainId: number | undefined): Error {
  if (walletChainId !== undefined && walletChainId !== CHAIN_ID) {
    return new Error(`wrong network — switch your wallet to ${ACTIVE_CHAIN.name}`)
  }
  return new Error("connect a wallet first")
}

/** Posts a new RFQ as the connected wallet. */
export function usePostRfqMutation(onStatus: (event: StatusEvent) => void) {
  const { address } = useAccount()
  const publicClient = usePublicClient({ chainId: CHAIN_ID })
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
        principal: parseUnits(input.principalInput, LOAN_DECIMALS),
        collateral: parseUnits(input.collateralInput, COLLATERAL_DECIMALS),
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
  const { address, chainId: walletChainId } = useAccount()
  const { data: walletClient } = useWalletClient({ chainId: CHAIN_ID })
  const publicClient = usePublicClient({ chainId: CHAIN_ID })
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ rfqId, quoteWire }: { rfqId: string; quoteWire: QuoteWire }) => {
      if (!walletClient || !publicClient) throw walletNotReadyError(walletChainId)
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
  const { address, chainId: walletChainId } = useAccount()
  const { data: walletClient } = useWalletClient({ chainId: CHAIN_ID })
  const publicClient = usePublicClient({ chainId: CHAIN_ID })
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ rfqId: _rfqId, quoteWire }: { rfqId: string; quoteWire: QuoteWire }) => {
      if (!walletClient || !publicClient) throw walletNotReadyError(walletChainId)
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

/** Claim-default flow: the maker's only enforcement right. Moves escrowed collateral straight to
 * the maker, so unlike fill/repay there's no approve step. */
export function useClaimDefaultMutation(onStatus: (event: StatusEvent) => void) {
  const { address, chainId: walletChainId } = useAccount()
  const { data: walletClient } = useWalletClient({ chainId: CHAIN_ID })
  const publicClient = usePublicClient({ chainId: CHAIN_ID })
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ rfqId: _rfqId, quoteWire }: { rfqId: string; quoteWire: QuoteWire }) => {
      if (!walletClient || !publicClient) throw walletNotReadyError(walletChainId)
      const onchain = wireQuoteToOnchain(quoteWire.quote)

      const claimHash = await walletClient.writeContract({
        address: NOCTUA_ADDRESS,
        abi: noctuaAbi,
        functionName: "claimDefault",
        args: [onchain],
      })
      await publicClient.waitForTransactionReceipt({ hash: claimHash })
      onStatus({ kind: "tx", label: "claimed default", hash: claimHash })
    },
    onSuccess: () => {
      // The chain watcher observes the on-chain Defaulted event and flips loanStatus itself;
      // the refetch above will pick up the change within a poll or two.
      queryClient.invalidateQueries({ queryKey: queryKeys.makerLoans(address) })
      queryClient.invalidateQueries({ queryKey: queryKeys.balances(address) })
    },
    onError: (err) => {
      onStatus({ kind: "error", label: "claim default failed", message: (err as Error).message })
    },
  })
}

/** Sign & send flow: maxUint256-approve the loan asset once, then sign (EIP-712, via wallet
 * popup) and submit a quote as the connected wallet. */
export function useSendQuoteMutation(onStatus: (event: StatusEvent) => void) {
  const { address, chainId: walletChainId } = useAccount()
  const { data: walletClient } = useWalletClient({ chainId: CHAIN_ID })
  const publicClient = usePublicClient({ chainId: CHAIN_ID })
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      rfq,
      repaymentInput,
      expiryMinutesInput,
    }: {
      rfq: RfqWire
      repaymentInput: string
      expiryMinutesInput: string
    }) => {
      if (!walletClient || !publicClient || !address) throw walletNotReadyError(walletChainId)

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
        principal: BigInt(rfq.principal),
        repayment: parseUnits(repaymentInput, LOAN_DECIMALS),
        collateral: BigInt(rfq.collateral),
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

/** Faucet: mints ₩100,000,000 mock KRWQ and 100 WETH to the connected wallet via two txs
 * (ERC20Mock.mint is public). Testnet/demo only — the real mainnet tokens have no public mint,
 * so this is hard-disabled on chain 8453 (the UI also hides the button there). */
export function useFaucetMutation(onStatus: (event: StatusEvent) => void) {
  const { address, chainId: walletChainId } = useAccount()
  const { data: walletClient } = useWalletClient({ chainId: CHAIN_ID })
  const publicClient = usePublicClient({ chainId: CHAIN_ID })
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      if (IS_MAINNET) throw new Error("faucet is testnet-only")
      if (!walletClient || !publicClient || !address) throw walletNotReadyError(walletChainId)

      const krwqHash = await walletClient.writeContract({
        address: LOAN_ASSET_ADDRESS,
        abi: erc20Abi,
        functionName: "mint",
        args: [address, FAUCET_LOAN_AMOUNT],
      })
      await publicClient.waitForTransactionReceipt({ hash: krwqHash })
      onStatus({ kind: "tx", label: "minted ₩100,000,000 KRWQ", hash: krwqHash })

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
