// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";

import {Noctua} from "../src/Noctua.sol";
import {Quote, QuoteLib} from "../src/libraries/QuoteLib.sol";

import {ERC20Mock} from "./mocks/ERC20Mock.sol";
import {OracleMock} from "./mocks/OracleMock.sol";
import {ERC1271WalletMock} from "./mocks/ERC1271WalletMock.sol";

contract NoctuaTest is Test {
    Noctua internal noctua;
    ERC20Mock internal loanAsset;
    ERC20Mock internal collateralAsset;
    OracleMock internal oracle;

    uint256 internal makerPk = 0xA11CE;
    address internal maker;
    address internal borrower;
    address internal liquidator;

    uint256 internal constant PRINCIPAL = 10_000e18;
    uint256 internal constant REPAYMENT = 10_400e18;
    uint256 internal constant COLLATERAL = 10e18;
    uint256 internal constant LLTV = 0.8e18;
    uint256 internal constant ORACLE_PRICE = 2000e36;

    function setUp() public {
        noctua = new Noctua();
        loanAsset = new ERC20Mock("Loan", "LOAN");
        collateralAsset = new ERC20Mock("Collateral", "COLL");
        oracle = new OracleMock(ORACLE_PRICE);

        maker = vm.addr(makerPk);
        borrower = makeAddr("borrower");
        liquidator = makeAddr("liquidator");

        loanAsset.mint(maker, 1_000_000e18);
        collateralAsset.mint(borrower, 1_000_000e18);
        loanAsset.mint(borrower, 1_000_000e18);
        loanAsset.mint(liquidator, 1_000_000e18);

        vm.prank(maker);
        loanAsset.approve(address(noctua), type(uint256).max);
        vm.prank(borrower);
        collateralAsset.approve(address(noctua), type(uint256).max);
        vm.prank(borrower);
        loanAsset.approve(address(noctua), type(uint256).max);
        vm.prank(liquidator);
        loanAsset.approve(address(noctua), type(uint256).max);
    }

    function _quote() internal view returns (Quote memory) {
        return Quote({
            maker: maker,
            taker: address(0),
            loanAsset: address(loanAsset),
            collateralAsset: address(collateralAsset),
            oracle: address(oracle),
            principal: PRINCIPAL,
            repayment: REPAYMENT,
            collateral: COLLATERAL,
            lltv: LLTV,
            maturity: block.timestamp + 90 days,
            expiry: block.timestamp + 1 days,
            nonce: 0
        });
    }

    function _sign(Quote memory q, uint256 pk) internal view returns (bytes memory) {
        bytes32 digest = noctua.hashQuote(q);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return abi.encodePacked(r, s, v);
    }

    function _fill(Quote memory q) internal returns (bytes32) {
        bytes memory sig = _sign(q, makerPk);
        vm.prank(borrower);
        return noctua.fill(q, sig);
    }

    // ---------------------------------------------------------------------
    // fill
    // ---------------------------------------------------------------------

    function test_fill_happyPath() public {
        Quote memory q = _quote();
        bytes memory sig = _sign(q, makerPk);
        bytes32 expectedHash = noctua.hashQuote(q);

        uint256 makerLoanBefore = loanAsset.balanceOf(maker);
        uint256 borrowerLoanBefore = loanAsset.balanceOf(borrower);
        uint256 borrowerCollateralBefore = collateralAsset.balanceOf(borrower);

        vm.expectEmit(true, true, true, true, address(noctua));
        emit Noctua.Filled(expectedHash, maker, borrower, q);

        vm.prank(borrower);
        bytes32 quoteHash = noctua.fill(q, sig);

        assertEq(quoteHash, expectedHash);
        (address loanBorrower, Noctua.Status status) = noctua.loans(quoteHash);
        assertEq(loanBorrower, borrower);
        assertEq(uint8(status), uint8(Noctua.Status.Active));

        assertEq(loanAsset.balanceOf(maker), makerLoanBefore - PRINCIPAL);
        assertEq(loanAsset.balanceOf(borrower), borrowerLoanBefore + PRINCIPAL);
        assertEq(collateralAsset.balanceOf(borrower), borrowerCollateralBefore - COLLATERAL);
        assertEq(collateralAsset.balanceOf(address(noctua)), COLLATERAL);
    }

    function test_fill_reverts_expired() public {
        Quote memory q = _quote();
        q.expiry = block.timestamp - 1;
        bytes memory sig = _sign(q, makerPk);

        vm.prank(borrower);
        vm.expectRevert(Noctua.QuoteExpired.selector);
        noctua.fill(q, sig);
    }

    function test_fill_reverts_maturityNotInFuture() public {
        Quote memory q = _quote();
        q.maturity = block.timestamp;
        bytes memory sig = _sign(q, makerPk);

        vm.prank(borrower);
        vm.expectRevert(Noctua.MaturityNotInFuture.selector);
        noctua.fill(q, sig);
    }

    function test_fill_reverts_wrongTaker() public {
        Quote memory q = _quote();
        q.taker = makeAddr("reserved");
        bytes memory sig = _sign(q, makerPk);

        vm.prank(borrower);
        vm.expectRevert(Noctua.NotDesignatedTaker.selector);
        noctua.fill(q, sig);
    }

    function test_fill_reservedQuote_fillableByDesignatedTaker() public {
        Quote memory q = _quote();
        q.taker = borrower;
        bytes memory sig = _sign(q, makerPk);

        vm.prank(borrower);
        noctua.fill(q, sig);
    }

    function test_fill_reverts_staleNonceAfterBump() public {
        vm.prank(maker);
        noctua.bumpNonce();

        Quote memory q = _quote();
        bytes memory sig = _sign(q, makerPk);

        vm.prank(borrower);
        vm.expectRevert(Noctua.InvalidNonce.selector);
        noctua.fill(q, sig);
    }

    function test_fill_reverts_cancelled() public {
        Quote memory q = _quote();
        vm.prank(maker);
        noctua.cancel(q);

        bytes memory sig = _sign(q, makerPk);
        vm.prank(borrower);
        vm.expectRevert(Noctua.QuoteCancelled.selector);
        noctua.fill(q, sig);
    }

    function test_fill_reverts_doubleFill() public {
        Quote memory q = _quote();
        _fill(q);

        bytes memory sig = _sign(q, makerPk);
        vm.prank(borrower);
        vm.expectRevert(Noctua.LoanNotNone.selector);
        noctua.fill(q, sig);
    }

    function test_fill_reverts_tamperedSignature() public {
        Quote memory q = _quote();
        bytes memory sig = _sign(q, makerPk);
        // Flip a byte in r.
        sig[0] = bytes1(uint8(sig[0]) ^ 0xff);

        vm.prank(borrower);
        vm.expectRevert(Noctua.InvalidSignature.selector);
        noctua.fill(q, sig);
    }

    function test_fill_reverts_lltvTooHighWithOracle() public {
        Quote memory q = _quote();
        q.lltv = 1e18;
        bytes memory sig = _sign(q, makerPk);

        vm.prank(borrower);
        vm.expectRevert(Noctua.LltvTooHigh.selector);
        noctua.fill(q, sig);
    }

    function test_fill_lltvAboveWadAllowed_whenNoOracle() public {
        Quote memory q = _quote();
        q.oracle = address(0);
        q.lltv = 1e18;
        bytes memory sig = _sign(q, makerPk);

        vm.prank(borrower);
        noctua.fill(q, sig);
    }

    // ---------------------------------------------------------------------
    // repay
    // ---------------------------------------------------------------------

    function test_repay_byBorrower() public {
        Quote memory q = _quote();
        bytes32 quoteHash = _fill(q);

        uint256 makerLoanBefore = loanAsset.balanceOf(maker);
        uint256 noctuaCollateralBefore = collateralAsset.balanceOf(address(noctua));

        vm.expectEmit(true, true, true, true, address(noctua));
        emit Noctua.Repaid(quoteHash, borrower);

        vm.prank(borrower);
        noctua.repay(q);

        assertEq(loanAsset.balanceOf(maker), makerLoanBefore + REPAYMENT);
        assertEq(collateralAsset.balanceOf(borrower), 1_000_000e18);
        assertEq(collateralAsset.balanceOf(address(noctua)), noctuaCollateralBefore - COLLATERAL);

        (, Noctua.Status status) = noctua.loans(quoteHash);
        assertEq(uint8(status), uint8(Noctua.Status.Repaid));
    }

    function test_repay_byThirdParty_collateralStillToBorrower() public {
        Quote memory q = _quote();
        _fill(q);

        address payer = makeAddr("payer");
        loanAsset.mint(payer, REPAYMENT);
        vm.prank(payer);
        loanAsset.approve(address(noctua), REPAYMENT);

        uint256 borrowerCollateralBefore = collateralAsset.balanceOf(borrower);

        vm.prank(payer);
        noctua.repay(q);

        assertEq(collateralAsset.balanceOf(borrower), borrowerCollateralBefore + COLLATERAL);
    }

    function test_repay_reverts_afterMaturity() public {
        Quote memory q = _quote();
        _fill(q);

        vm.warp(q.maturity + 1);
        vm.prank(borrower);
        vm.expectRevert(Noctua.PastMaturity.selector);
        noctua.repay(q);
    }

    function test_repay_atMaturity_succeeds() public {
        Quote memory q = _quote();
        _fill(q);

        vm.warp(q.maturity);
        vm.prank(borrower);
        noctua.repay(q);
    }

    function test_repay_reverts_whenNotActive() public {
        Quote memory q = _quote();

        vm.prank(borrower);
        vm.expectRevert(Noctua.LoanNotActive.selector);
        noctua.repay(q);
    }

    // ---------------------------------------------------------------------
    // liquidate
    // ---------------------------------------------------------------------

    function test_liquidate_reverts_whileHealthy() public {
        Quote memory q = _quote();
        _fill(q);

        vm.prank(liquidator);
        vm.expectRevert(Noctua.PositionHealthy.selector);
        noctua.liquidate(q);
    }

    function test_liquidate_succeeds_afterPriceDrop() public {
        Quote memory q = _quote();
        _fill(q);
        oracle.setPrice(1200e36);

        uint256 liquidatorLoanBefore = loanAsset.balanceOf(liquidator);
        uint256 liquidatorCollateralBefore = collateralAsset.balanceOf(liquidator);
        uint256 makerLoanBefore = loanAsset.balanceOf(maker);

        vm.prank(liquidator);
        noctua.liquidate(q);

        assertEq(loanAsset.balanceOf(liquidator), liquidatorLoanBefore - REPAYMENT);
        assertEq(collateralAsset.balanceOf(liquidator), liquidatorCollateralBefore + COLLATERAL);
        assertEq(loanAsset.balanceOf(maker), makerLoanBefore + REPAYMENT);

        (, Noctua.Status status) = noctua.loans(noctua.hashQuote(q));
        assertEq(uint8(status), uint8(Noctua.Status.Liquidated));
    }

    function test_liquidate_boundary_exactlyHealthy_reverts() public {
        // maxDebt = collateral * price / 1e36 * lltv / 1e18 = REPAYMENT
        // => price = REPAYMENT * 1e36 * 1e18 / (COLLATERAL * LLTV)
        uint256 price = (REPAYMENT * 1e36 * 1e18) / (COLLATERAL * LLTV);

        Quote memory q = _quote();
        _fill(q);
        oracle.setPrice(price);

        vm.prank(liquidator);
        vm.expectRevert(Noctua.PositionHealthy.selector);
        noctua.liquidate(q);
    }

    function test_liquidate_boundary_oneWeiAbove_liquidatable() public {
        uint256 price = (REPAYMENT * 1e36 * 1e18) / (COLLATERAL * LLTV);

        Quote memory q = _quote();
        // Bump repayment by 1 wei relative to the exact-health price so it becomes unhealthy.
        q.repayment = REPAYMENT + 1;
        bytes32 quoteHash = _fill(q);
        oracle.setPrice(price);

        vm.prank(liquidator);
        noctua.liquidate(q);

        (, Noctua.Status status) = noctua.loans(quoteHash);
        assertEq(uint8(status), uint8(Noctua.Status.Liquidated));
    }

    function test_liquidate_reverts_noOracle() public {
        Quote memory q = _quote();
        q.oracle = address(0);
        _fill(q);

        vm.prank(liquidator);
        vm.expectRevert(Noctua.NoOracle.selector);
        noctua.liquidate(q);
    }

    function test_liquidate_reverts_pastMaturity() public {
        Quote memory q = _quote();
        _fill(q);
        oracle.setPrice(1200e36);

        vm.warp(q.maturity + 1);
        vm.prank(liquidator);
        vm.expectRevert(Noctua.PastMaturity.selector);
        noctua.liquidate(q);
    }

    // ---------------------------------------------------------------------
    // claimDefault
    // ---------------------------------------------------------------------

    function test_claimDefault_reverts_atMaturity() public {
        Quote memory q = _quote();
        _fill(q);

        vm.warp(q.maturity);
        vm.expectRevert(Noctua.NotYetMaturity.selector);
        noctua.claimDefault(q);
    }

    function test_claimDefault_reverts_beforeMaturity() public {
        Quote memory q = _quote();
        _fill(q);

        vm.expectRevert(Noctua.NotYetMaturity.selector);
        noctua.claimDefault(q);
    }

    function test_claimDefault_succeeds_afterMaturity() public {
        Quote memory q = _quote();
        bytes32 quoteHash = _fill(q);

        vm.warp(q.maturity + 1);

        uint256 makerCollateralBefore = collateralAsset.balanceOf(maker);

        vm.expectEmit(true, true, true, true, address(noctua));
        emit Noctua.Defaulted(quoteHash);

        address rando = makeAddr("rando");
        vm.prank(rando);
        noctua.claimDefault(q);

        assertEq(collateralAsset.balanceOf(maker), makerCollateralBefore + COLLATERAL);
        (, Noctua.Status status) = noctua.loans(quoteHash);
        assertEq(uint8(status), uint8(Noctua.Status.Defaulted));
    }

    function test_claimDefault_reverts_onceRepaid() public {
        Quote memory q = _quote();
        _fill(q);

        vm.prank(borrower);
        noctua.repay(q);

        vm.warp(q.maturity + 1);
        vm.expectRevert(Noctua.LoanNotActive.selector);
        noctua.claimDefault(q);
    }

    // ---------------------------------------------------------------------
    // cancel / bumpNonce
    // ---------------------------------------------------------------------

    function test_cancel_reverts_nonMaker() public {
        Quote memory q = _quote();
        vm.prank(borrower);
        vm.expectRevert(Noctua.NotMaker.selector);
        noctua.cancel(q);
    }

    function test_cancel_makesQuoteUnfillable() public {
        Quote memory q = _quote();
        vm.prank(maker);
        noctua.cancel(q);

        bytes memory sig = _sign(q, makerPk);
        vm.prank(borrower);
        vm.expectRevert(Noctua.QuoteCancelled.selector);
        noctua.fill(q, sig);
    }

    function test_bumpNonce_invalidatesOutstandingQuote() public {
        Quote memory q = _quote();
        bytes memory sig = _sign(q, makerPk);

        vm.prank(maker);
        noctua.bumpNonce();

        vm.prank(borrower);
        vm.expectRevert(Noctua.InvalidNonce.selector);
        noctua.fill(q, sig);
    }

    // ---------------------------------------------------------------------
    // ERC-1271
    // ---------------------------------------------------------------------

    function test_fill_erc1271Maker() public {
        ERC1271WalletMock wallet = new ERC1271WalletMock(maker);
        loanAsset.mint(address(wallet), 1_000_000e18);
        vm.prank(address(wallet));
        loanAsset.approve(address(noctua), type(uint256).max);

        Quote memory q = _quote();
        q.maker = address(wallet);
        bytes memory sig = _sign(q, makerPk);

        vm.prank(borrower);
        noctua.fill(q, sig);

        (, Noctua.Status status) = noctua.loans(noctua.hashQuote(q));
        assertEq(uint8(status), uint8(Noctua.Status.Active));
    }

    // ---------------------------------------------------------------------
    // Typehash guard
    // ---------------------------------------------------------------------

    function test_typehash_matchesLiteralTypeString() public pure {
        bytes32 expected = keccak256(
            "Quote(address maker,address taker,address loanAsset,address collateralAsset,address oracle,uint256 principal,uint256 repayment,uint256 collateral,uint256 lltv,uint256 maturity,uint256 expiry,uint256 nonce)"
        );
        assertEq(QuoteLib.QUOTE_TYPEHASH, expected);
    }

    // ---------------------------------------------------------------------
    // Fuzz
    // ---------------------------------------------------------------------

    function testFuzz_fillAndRepay_conservesBalances(uint256 principal, uint256 repayment, uint256 collateral) public {
        principal = bound(principal, 1, 500_000e18);
        repayment = bound(repayment, principal, principal * 2 + 1);
        collateral = bound(collateral, 1, 500_000e18);

        loanAsset.mint(maker, repayment);
        collateralAsset.mint(borrower, collateral);
        loanAsset.mint(borrower, repayment);

        Quote memory q = _quote();
        q.principal = principal;
        q.repayment = repayment;
        q.collateral = collateral;

        uint256 makerLoanBefore = loanAsset.balanceOf(maker);
        uint256 borrowerLoanBefore = loanAsset.balanceOf(borrower);
        uint256 borrowerCollateralBefore = collateralAsset.balanceOf(borrower);

        _fill(q);

        assertEq(loanAsset.balanceOf(maker), makerLoanBefore - principal);
        assertEq(loanAsset.balanceOf(borrower), borrowerLoanBefore + principal);
        assertEq(collateralAsset.balanceOf(borrower), borrowerCollateralBefore - collateral);

        vm.prank(borrower);
        noctua.repay(q);

        assertEq(loanAsset.balanceOf(maker), makerLoanBefore - principal + repayment);
        assertEq(collateralAsset.balanceOf(borrower), borrowerCollateralBefore);
    }
}
