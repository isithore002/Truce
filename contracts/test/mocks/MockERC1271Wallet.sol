// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/// @notice Minimal contract wallet: a signature is valid if `owner` signed the digest.
contract MockERC1271Wallet {
    address public immutable OWNER;

    constructor(address owner_) {
        OWNER = owner_;
    }

    function isValidSignature(bytes32 hash, bytes calldata signature) external view returns (bytes4) {
        (address recovered, ECDSA.RecoverError err,) = ECDSA.tryRecoverCalldata(hash, signature);
        return err == ECDSA.RecoverError.NoError && recovered == OWNER ? bytes4(0x1626ba7e) : bytes4(0xffffffff);
    }
}
