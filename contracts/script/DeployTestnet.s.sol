// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Script, console} from "forge-std/Script.sol";
import {Noctua} from "../src/Noctua.sol";
import {ERC20Mock} from "../test/mocks/ERC20Mock.sol";

/// @notice Deploys Noctua + two mock ERC-20s to a live testnet (e.g. Base Sepolia) and logs the
/// three addresses the web app and RFQ service need.
///
/// Reads DEPLOYER_PRIVATE_KEY (and ETHERSCAN_API_KEY for --verify, via foundry.toml) from
/// contracts/.env — forge loads it automatically when run from the contracts directory.
///
/// Usage (from contracts/):
///   forge script script/DeployTestnet.s.sol:DeployTestnet \
///     --rpc-url base_sepolia --broadcast --verify
contract DeployTestnet is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
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
