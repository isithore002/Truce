// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {MockEIP3009Token} from "./MockEIP3009Token.sol";

/// @notice Burns 1% of every transfer, so the receiver gets less than `value`.
contract FeeOnTransferToken is MockEIP3009Token {
    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0) && to != address(0)) {
            uint256 fee = value / 100;
            super._update(from, address(0), fee);
            super._update(from, to, value - fee);
        } else {
            super._update(from, to, value);
        }
    }
}
