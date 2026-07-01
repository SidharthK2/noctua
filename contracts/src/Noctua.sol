// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

import {Quote, QuoteLib} from "./libraries/QuoteLib.sol";
import {IOracle} from "./interfaces/IOracle.sol";

/// @title Noctua
/// @notice RFQ-based fixed-rate lending settlement contract. Makers (lenders) sign `Quote`s
/// off-chain (EIP-712); takers (borrowers) settle them on-chain via `fill`. Every quote is
/// implicit zero-coupon: the maker lends `principal` and is owed `repayment` at `maturity` with
/// no on-chain rate math (no APR, day-count, or compounding conventions are computed here — the
/// spread between `principal` and `repayment` fully encodes the cost of the loan).
///
/// @dev Design notes:
/// - Fee-on-transfer and rebasing tokens are NOT supported. The contract trusts the nominal
///   amounts in a `Quote` to be exactly what is transferred; deflationary or rebasing tokens as
///   either `loanAsset` or `collateralAsset` will desynchronize accounting and can lock or leak
///   funds. Integrators must only use quotes referencing standard-conforming ERC-20s.
/// - Every state-mutating function follows strict checks-effects-interactions ordering: all
///   validation and storage writes happen before any external call. This is the contract's only
///   reentrancy defense — there is no reentrancy guard, and none is needed if CEI is preserved.
/// - The repayment window is inclusive of `maturity` (`repay` succeeds at
///   `block.timestamp == maturity`); default is strictly after (`claimDefault` requires
///   `block.timestamp > maturity`). A loan can never be simultaneously repayable and
///   defaultable.
/// - When a `Quote.oracle` is set, positions are subject to pre-maturity margin liquidation
///   against `lltv`. When it is zero, the loan is pawn-style: uncollateralized by any oracle
///   check pre-maturity, and enforced purely by forfeiture of collateral at default.
contract Noctua is EIP712 {
    using SafeERC20 for IERC20;
    using QuoteLib for Quote;

    /// @dev Fixed-point scale used for `lltv` ratios.
    uint256 internal constant WAD = 1e18;

    /// @dev Scale of `IOracle.price()`, following the Morpho Blue convention.
    uint256 internal constant ORACLE_PRICE_SCALE = 1e36;

    enum Status {
        None,
        Active,
        Repaid,
        Liquidated,
        Defaulted
    }

    /// @dev Packs into a single storage slot (address + enum).
    struct Loan {
        address borrower;
        Status status;
    }

    /// @notice Loan state for a given quote hash.
    mapping(bytes32 quoteHash => Loan) public loans;

    /// @notice Whether a maker has cancelled a given quote hash.
    mapping(bytes32 quoteHash => bool) public cancelled;

    /// @notice Current nonce for a maker; bumping invalidates all quotes signed at the old nonce.
    mapping(address maker => uint256) public nonces;

    event Filled(bytes32 indexed quoteHash, address indexed maker, address indexed borrower, Quote quote);
    event Repaid(bytes32 indexed quoteHash, address indexed payer);
    event Liquidated(bytes32 indexed quoteHash, address indexed liquidator);
    event Defaulted(bytes32 indexed quoteHash);
    event Cancelled(bytes32 indexed quoteHash, address indexed maker);
    event NonceBumped(address indexed maker, uint256 newNonce);

    error QuoteExpired();
    error MaturityNotInFuture();
    error NotDesignatedTaker();
    error NotMaker();
    error InvalidNonce();
    error LltvTooHigh();
    error QuoteCancelled();
    error LoanNotNone();
    error InvalidSignature();
    error LoanNotActive();
    error PastMaturity();
    error NotYetMaturity();
    error NoOracle();
    error PositionHealthy();

    constructor() EIP712("Noctua", "1") {}

    /// @notice Returns the EIP-712 digest a maker must sign to authorize `quote`.
    function hashQuote(Quote calldata quote) external view returns (bytes32) {
        return _hashTypedDataV4(quote.structHash());
    }

    /// @notice Settles a signed `Quote`: escrows the taker's collateral and disburses the
    /// maker's principal. The caller becomes the borrower.
    function fill(Quote calldata quote, bytes calldata signature) external returns (bytes32 quoteHash) {
        if (block.timestamp > quote.expiry) revert QuoteExpired();
        if (block.timestamp >= quote.maturity) revert MaturityNotInFuture();
        if (quote.taker != address(0) && quote.taker != msg.sender) revert NotDesignatedTaker();
        if (quote.nonce != nonces[quote.maker]) revert InvalidNonce();
        if (quote.oracle != address(0) && quote.lltv >= WAD) revert LltvTooHigh();

        quoteHash = _hashTypedDataV4(quote.structHash());

        if (cancelled[quoteHash]) revert QuoteCancelled();
        if (loans[quoteHash].status != Status.None) revert LoanNotNone();
        if (!SignatureChecker.isValidSignatureNow(quote.maker, quoteHash, signature)) revert InvalidSignature();

        loans[quoteHash] = Loan({borrower: msg.sender, status: Status.Active});

        emit Filled(quoteHash, quote.maker, msg.sender, quote);

        IERC20(quote.collateralAsset).safeTransferFrom(msg.sender, address(this), quote.collateral);
        IERC20(quote.loanAsset).safeTransferFrom(quote.maker, msg.sender, quote.principal);
    }

    /// @notice Repays an active loan on or before maturity. Callable by anyone on the
    /// borrower's behalf; collateral is always returned to the original borrower, regardless of
    /// who pays.
    function repay(Quote calldata quote) external {
        bytes32 quoteHash = _hashTypedDataV4(quote.structHash());
        Loan memory loan = loans[quoteHash];

        if (loan.status != Status.Active) revert LoanNotActive();
        if (block.timestamp > quote.maturity) revert PastMaturity();

        loans[quoteHash].status = Status.Repaid;

        emit Repaid(quoteHash, msg.sender);

        IERC20(quote.loanAsset).safeTransferFrom(msg.sender, quote.maker, quote.repayment);
        IERC20(quote.collateralAsset).safeTransfer(loan.borrower, quote.collateral);
    }

    /// @notice Liquidates an under-collateralized loan before maturity. Reverts if the quote
    /// carries no oracle (pawn-style loans are never margin-liquidated) or if the position is
    /// still healthy. The liquidator pays the full `repayment` to the maker and receives the
    /// full `collateral`; the incentive is the spread between collateral value and repayment,
    /// with no additional bonus factor.
    function liquidate(Quote calldata quote) external {
        bytes32 quoteHash = _hashTypedDataV4(quote.structHash());
        Loan memory loan = loans[quoteHash];

        if (loan.status != Status.Active) revert LoanNotActive();
        if (quote.oracle == address(0)) revert NoOracle();
        if (block.timestamp > quote.maturity) revert PastMaturity();

        uint256 collateralValue = Math.mulDiv(quote.collateral, IOracle(quote.oracle).price(), ORACLE_PRICE_SCALE);
        uint256 maxDebt = Math.mulDiv(collateralValue, quote.lltv, WAD);
        if (quote.repayment <= maxDebt) revert PositionHealthy();

        loans[quoteHash].status = Status.Liquidated;

        emit Liquidated(quoteHash, msg.sender);

        IERC20(quote.loanAsset).safeTransferFrom(msg.sender, quote.maker, quote.repayment);
        IERC20(quote.collateralAsset).safeTransfer(msg.sender, quote.collateral);
    }

    /// @notice Claims a defaulted loan strictly after maturity. Callable by anyone; all
    /// collateral is sent to the maker regardless of its value relative to the debt — this is a
    /// pawn-style forfeiture, not a liquidation, so any surplus above `repayment` is intentionally
    /// forfeited to the lender rather than returned to the borrower.
    function claimDefault(Quote calldata quote) external {
        bytes32 quoteHash = _hashTypedDataV4(quote.structHash());
        Loan memory loan = loans[quoteHash];

        if (loan.status != Status.Active) revert LoanNotActive();
        if (block.timestamp <= quote.maturity) revert NotYetMaturity();

        loans[quoteHash].status = Status.Defaulted;

        emit Defaulted(quoteHash);

        IERC20(quote.collateralAsset).safeTransfer(quote.maker, quote.collateral);
    }

    /// @notice Cancels a quote so it can no longer be filled. Only the maker may cancel.
    function cancel(Quote calldata quote) external {
        if (msg.sender != quote.maker) revert NotMaker();

        bytes32 quoteHash = _hashTypedDataV4(quote.structHash());
        cancelled[quoteHash] = true;

        emit Cancelled(quoteHash, msg.sender);
    }

    /// @notice Bumps the caller's nonce, mass-cancelling every outstanding quote signed at the
    /// old nonce.
    function bumpNonce() external {
        uint256 newNonce = ++nonces[msg.sender];
        emit NonceBumped(msg.sender, newNonce);
    }
}
