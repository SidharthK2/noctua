// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Script, console} from "forge-std/Script.sol";
import {Noctua} from "../src/Noctua.sol";

/// @notice Deploys Noctua to Base mainnet. No mocks — production uses the real, already-deployed
/// tokens: KRWQ 0x370923D39f139C64813f173a1bf0b4f9Ba36a24f (loan asset, krwq.cash) and canonical
/// WETH 0x4200000000000000000000000000000000000006 (collateral). The contract itself is
/// asset-agnostic; those addresses are wired into the web app and RFQ service via env vars.
///
/// Reads DEPLOYER_PRIVATE_KEY (plus BASE_RPC_URL for the rpc alias and ETHERSCAN_API_KEY for
/// --verify, via foundry.toml) from contracts/.env — forge loads it automatically when run from
/// the contracts directory.
///
/// Usage (from contracts/):
///   forge script script/DeployMainnet.s.sol:DeployMainnet \
///     --rpc-url base --broadcast --verify
///
/// Note the block number the deploy lands in — that's START_BLOCK for the RFQ service.
contract DeployMainnet is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        vm.startBroadcast(deployerKey);
        Noctua noctua = new Noctua();
        vm.stopBroadcast();

        console.log("deployer       ", deployer);
        console.log("NOCTUA_ADDRESS ", address(noctua));
        console.log("deploy block   ", block.number);
    }
}
