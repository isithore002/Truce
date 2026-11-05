// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

// Proves the OpenZeppelin imports resolve. Deleted in task T03.
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC3009} from "./interfaces/IERC3009.sol";

contract Placeholder is EIP712, Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    constructor() EIP712("Truce", "1") Ownable(msg.sender) {}

    function check(address signer, bytes32 digest, bytes calldata sig) external view returns (bool) {
        return SignatureChecker.isValidSignatureNow(signer, digest, sig);
    }
}
