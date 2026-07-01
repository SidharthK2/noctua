// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @notice Prices a quote's collateral asset in its loan asset, following the Morpho Blue
/// convention: scaled by 1e36 and adjusted for both tokens' decimals, so that
/// `collateralAmount * price() / 1e36` is a loan-asset amount in native units.
interface IOracle {
    function price() external view returns (uint256);
}
