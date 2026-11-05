// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";
import {InvoiceSettler} from "../src/InvoiceSettler.sol";

/// @notice Smoke test: Solidity hashInvoice must equal the TypeScript hash for every golden vector.
contract HashSmokeTest is Test {
    string constant VECTORS = "../packages/invoice-lib/test-vectors/invoice-vectors.json";

    function test_HashInvoiceMatchesEveryGoldenVector() public {
        string memory json = vm.readFile(VECTORS);
        uint256 checked;
        while (vm.keyExistsJson(json, string.concat(".vectors[", vm.toString(checked), "]"))) {
            string memory base = string.concat(".vectors[", vm.toString(checked), "]");
            address settler = vm.parseJsonAddress(json, string.concat(base, ".verifyingContract"));
            vm.chainId(uint256(vm.parseJsonUint(json, string.concat(base, ".chainId"))));
            deployCodeTo("InvoiceSettler.sol:InvoiceSettler", abi.encode(address(this), new address[](0)), settler);

            InvoiceSettler.Invoice memory inv = _invoice(json, string.concat(base, ".invoice"));
            bytes32 expected = vm.parseJsonBytes32(json, string.concat(base, ".expected.invoiceHash"));
            assertEq(
                InvoiceSettler(settler).hashInvoice(inv),
                expected,
                vm.parseJsonString(json, string.concat(base, ".name"))
            );
            ++checked;
        }
        assertEq(checked, 4, "expected four golden vectors");
    }

    function _invoice(string memory json, string memory p) internal pure returns (InvoiceSettler.Invoice memory inv) {
        inv.invoiceId = vm.parseJsonBytes32(json, string.concat(p, ".invoiceId"));
        inv.merchant = vm.parseJsonAddress(json, string.concat(p, ".merchant"));
        inv.payout = vm.parseJsonAddress(json, string.concat(p, ".payout"));
        inv.token = vm.parseJsonAddress(json, string.concat(p, ".token"));
        inv.amount = vm.parseJsonUint(json, string.concat(p, ".amount"));
        inv.dueDate = uint64(vm.parseJsonUint(json, string.concat(p, ".dueDate")));
        inv.expiry = uint64(vm.parseJsonUint(json, string.concat(p, ".expiry")));
        inv.payer = vm.parseJsonAddress(json, string.concat(p, ".payer"));
        inv.domainHash = vm.parseJsonBytes32(json, string.concat(p, ".domainHash"));
        inv.memoHash = vm.parseJsonBytes32(json, string.concat(p, ".memoHash"));
    }
}
