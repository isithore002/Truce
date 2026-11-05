// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Script, console} from "forge-std/Script.sol";
import {InvoiceSettler} from "../src/InvoiceSettler.sol";

/// @notice Deploys InvoiceSettler to Whitechain Sepolia (chain 1874) with the track USDT allowlisted.
///
///   cd contracts
///   forge script script/Deploy.s.sol --rpc-url whitechain_testnet --private-key $DEPLOYER_PK --broadcast
///
/// Env: OWNER (address; can only pause new settlements). Use a THROWAWAY key for the deployer.
contract Deploy is Script {
    /// @dev Track USDT proxy (6 decimals, EIP-3009). Not the "USDT.e" token on the same chain.
    address constant TRACK_USDT = 0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7;

    function run() external returns (InvoiceSettler settler) {
        require(block.chainid == 1874, "Truce: testnet only (chain 1874)");

        address owner = vm.envAddress("OWNER");
        address[] memory allowed = new address[](1);
        allowed[0] = TRACK_USDT;

        vm.startBroadcast();
        settler = new InvoiceSettler(owner, allowed);
        vm.stopBroadcast();

        console.log("InvoiceSettler:", address(settler));
        console.log("owner:", owner);
        console.log("allowed token:", TRACK_USDT);
        console.log("constructor args (for verification):");
        console.logBytes(abi.encode(owner, allowed));
    }
}
