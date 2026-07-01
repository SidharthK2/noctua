// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Script, console} from "forge-std/Script.sol";
import {Noctua} from "../src/Noctua.sol";
import {ERC20Mock} from "../test/mocks/ERC20Mock.sol";
import {OracleMock} from "../test/mocks/OracleMock.sol";

/// @notice Deploys Noctua + two mock ERC-20s + an OracleMock to a live testnet (e.g. Base
/// Sepolia) and logs the four addresses the web app and RFQ service need.
///
/// Usage:
///   PRIVATE_KEY=0x... forge script script/DeployTestnet.s.sol:DeployTestnet \
///     --root contracts --rpc-url https://sepolia.base.org --broadcast
contract DeployTestnet is Script {
    /// @dev 2000e36 — `IOracle.price()` scale is 1e36, so this prices 1 WETH at 2000 DAI.
    uint256 internal constant INITIAL_ORACLE_PRICE = 2000e36;

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        vm.startBroadcast(deployerKey);

        Noctua noctua = new Noctua();
        ERC20Mock dai = new ERC20Mock("Noctua Mock DAI", "DAI");
        ERC20Mock weth = new ERC20Mock("Noctua Mock WETH", "WETH");
        OracleMock oracle = new OracleMock(INITIAL_ORACLE_PRICE);

        vm.stopBroadcast();

        console.log("deployer        ", deployer);
        console.log("NOCTUA_ADDRESS     ", address(noctua));
        console.log("LOAN_ADDRESS       ", address(dai));
        console.log("COLLATERAL_ADDRESS ", address(weth));
        console.log("ORACLE_ADDRESS     ", address(oracle));
    }
}
