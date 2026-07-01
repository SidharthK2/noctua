// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {IERC1271} from "@openzeppelin/contracts/interfaces/IERC1271.sol";

/// @notice Minimal ERC-1271 smart contract wallet backed by a single EOA owner, for testing
/// that Noctua correctly settles quotes signed on behalf of contract makers.
contract ERC1271WalletMock is IERC1271 {
    bytes4 internal constant MAGIC_VALUE = 0x1626ba7e;

    address public immutable owner;

    constructor(address owner_) {
        owner = owner_;
    }

    function isValidSignature(bytes32 hash, bytes memory signature) external view returns (bytes4) {
        (address recovered,,) = ECDSA.tryRecover(hash, signature);
        if (recovered == owner && recovered != address(0)) {
            return MAGIC_VALUE;
        }
        return 0xffffffff;
    }
}
