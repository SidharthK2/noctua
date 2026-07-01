// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IOracle} from "../../src/interfaces/IOracle.sol";

contract OracleMock is IOracle {
    uint256 public price_;

    constructor(uint256 initialPrice) {
        price_ = initialPrice;
    }

    function setPrice(uint256 newPrice) external {
        price_ = newPrice;
    }

    function price() external view returns (uint256) {
        return price_;
    }
}
