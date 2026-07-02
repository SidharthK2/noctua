// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Script, console} from "forge-std/Script.sol";
import {Noctua} from "../src/Noctua.sol";
import {ERC20Mock} from "../test/mocks/ERC20Mock.sol";

/// @notice Deploys Noctua + two mock ERC-20s to a live testnet (e.g. Base Sepolia) and logs the
/// three addresses the web app and RFQ service need.
///
/// Usage:
///   PRIVATE_KEY=0x... forge script script/DeployTestnet.s.sol:DeployTestnet \
///     --root contracts --rpc-url https://sepolia.base.org --broadcast
contract DeployTestnet is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        vm.startBroadcast(deployerKey);

        Noctua noctua = new Noctua();
        ERC20Mock usdt = new ERC20Mock("Noctua Mock USDT", "USDT", 18);
        ERC20Mock weth = new ERC20Mock("Noctua Mock WETH", "WETH", 18);

        vm.stopBroadcast();

        console.log("deployer        ", deployer);
        console.log("NOCTUA_ADDRESS     ", address(noctua));
        console.log("LOAN_ADDRESS       ", address(usdt));
        console.log("COLLATERAL_ADDRESS ", address(weth));
    }
}
