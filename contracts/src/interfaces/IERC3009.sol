// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @notice The subset of EIP-3009 that Truce uses (v, r, s overloads).
interface IERC3009 {
    function receiveWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;

    function cancelAuthorization(address authorizer, bytes32 nonce, uint8 v, bytes32 r, bytes32 s) external;

    function authorizationState(address authorizer, bytes32 nonce) external view returns (bool);
}
