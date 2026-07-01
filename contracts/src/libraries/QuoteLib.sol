// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @notice A lending quote, signed off-chain by the maker (lender) and settled on-chain by
/// the taker (borrower) via `Noctua.fill`.
///
/// The rate is implicit: the maker lends `principal` and is owed `repayment` at `maturity`,
/// zero-coupon style. The contract never performs rate math — no APR, day-count, or
/// compounding conventions exist on-chain. Off-chain UIs derive the implied rate as
/// `(repayment / principal - 1)` annualized over the remaining term.
///
/// Two quotes with identical fields hash identically, so only one of them is fillable.
/// Makers issuing several otherwise-identical quotes should vary `expiry` by a second.
struct Quote {
    /// @dev Lender. Must sign the EIP-712 digest of this struct (EOA or ERC-1271).
    address maker;
    /// @dev Borrower the quote is reserved for; address(0) leaves it fillable by anyone.
    address taker;
    /// @dev Token lent to the borrower and repaid to the maker.
    address loanAsset;
    /// @dev Token escrowed by the borrower until repayment.
    address collateralAsset;
    /// @dev Prices collateral in loan-asset terms (1e36 scale). address(0) disables
    /// pre-maturity liquidation entirely: the loan is then pawn-style, enforced only by
    /// default at maturity.
    address oracle;
    /// @dev Loan-asset amount sent maker → taker at fill.
    uint256 principal;
    /// @dev Loan-asset amount owed to the maker by maturity.
    uint256 repayment;
    /// @dev Collateral-asset amount escrowed at fill.
    uint256 collateral;
    /// @dev Max healthy debt as a WAD fraction of collateral value. The position is
    /// liquidatable once `repayment > collateralValue * lltv`. Ignored when `oracle` is 0.
    uint256 lltv;
    /// @dev Timestamp the repayment is due by (inclusive). Afterwards the loan is in default.
    uint256 maturity;
    /// @dev Timestamp the quote stops being fillable (inclusive).
    uint256 expiry;
    /// @dev Must equal the maker's current nonce in Noctua; bumping the nonce mass-cancels.
    uint256 nonce;
}

library QuoteLib {
    bytes32 internal constant QUOTE_TYPEHASH = keccak256(
        "Quote(address maker,address taker,address loanAsset,address collateralAsset,address oracle,uint256 principal,uint256 repayment,uint256 collateral,uint256 lltv,uint256 maturity,uint256 expiry,uint256 nonce)"
    );

    /// @dev EIP-712 struct hash. `abi.encode(TYPEHASH, quote)` matches the per-field
    /// encoding because every member of Quote is a static type.
    function structHash(Quote calldata quote) internal pure returns (bytes32) {
        return keccak256(abi.encode(QUOTE_TYPEHASH, quote));
    }
}
