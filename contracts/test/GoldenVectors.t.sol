// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {InvoiceSettler} from "../src/InvoiceSettler.sol";
import {MockEIP3009Token} from "./mocks/MockEIP3009Token.sol";

/// @notice Cross-checks the TypeScript library: every vector in
///         packages/invoice-lib/test-vectors/invoice-vectors.json must hash identically here,
///         its stored signature must recover to the published signer, and a TypeScript-signed
///         invoice must settle on chain.
contract GoldenVectorsTest is Test {
    string constant VECTORS = "../packages/invoice-lib/test-vectors/invoice-vectors.json";
    uint256 constant BUYER_PK = 0xB0B;

    string json;

    function setUp() public {
        json = vm.readFile(VECTORS);
    }

    function _base(uint256 i) internal pure returns (string memory) {
        return string.concat(".vectors[", vm.toString(i), "]");
    }

    function _count() internal view returns (uint256 n) {
        while (vm.keyExistsJson(json, _base(n))) ++n;
    }

    function _invoice(uint256 i) internal view returns (InvoiceSettler.Invoice memory inv) {
        string memory p = string.concat(_base(i), ".invoice");
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

    /// @dev Deploys the settler at the vector's verifyingContract on the vector's chain id.
    function _deploySettler(uint256 i, address allowedToken) internal returns (InvoiceSettler) {
        address at = vm.parseJsonAddress(json, string.concat(_base(i), ".verifyingContract"));
        vm.chainId(vm.parseJsonUint(json, string.concat(_base(i), ".chainId")));
        address[] memory allowed = new address[](1);
        allowed[0] = allowedToken;
        deployCodeTo("InvoiceSettler.sol:InvoiceSettler", abi.encode(address(this), allowed), at);
        return InvoiceSettler(at);
    }

    function test_EveryVectorHashMatches() public {
        uint256 n = _count();
        assertEq(n, 4, "expected four golden vectors");
        for (uint256 i; i < n; ++i) {
            InvoiceSettler settler = _deploySettler(i, address(0));
            bytes32 expected = vm.parseJsonBytes32(json, string.concat(_base(i), ".expected.invoiceHash"));
            assertEq(
                settler.hashInvoice(_invoice(i)), expected, vm.parseJsonString(json, string.concat(_base(i), ".name"))
            );
        }
    }

    function test_EverySignatureRecoversThePublishedSigner() public view {
        for (uint256 i; i < _count(); ++i) {
            bytes32 hash = vm.parseJsonBytes32(json, string.concat(_base(i), ".expected.invoiceHash"));
            bytes memory sig = vm.parseJsonBytes(json, string.concat(_base(i), ".signature"));
            address signer = vm.parseJsonAddress(json, string.concat(_base(i), ".signer"));
            assertEq(ECDSA.recover(hash, sig), signer);
            assertEq(signer, _invoice(i).merchant);
        }
    }

    /// @dev The TypeScript merchant signature is accepted by the contract (open-payer vectors only,
    ///      because the buyer key here is our own test key).
    function test_TypeScriptSignedInvoiceSettlesOnChain() public {
        uint256 settled;
        for (uint256 i; i < _count(); ++i) {
            InvoiceSettler.Invoice memory inv = _invoice(i);
            if (inv.payer != address(0)) continue;

            InvoiceSettler settler = _deploySettler(i, inv.token);
            deployCodeTo("MockEIP3009Token.sol:MockEIP3009Token", inv.token);
            MockEIP3009Token token = MockEIP3009Token(inv.token);
            address buyer = vm.addr(BUYER_PK);
            token.mint(buyer, inv.amount);
            vm.warp(uint256(inv.expiry) - 1 days);

            bytes32 hash = settler.hashInvoice(inv);
            InvoiceSettler.Auth memory a = InvoiceSettler.Auth(buyer, 0, inv.expiry, 0, 0, 0);
            bytes32 structHash = keccak256(
                abi.encode(
                    token.RECEIVE_WITH_AUTHORIZATION_TYPEHASH(),
                    buyer,
                    address(settler),
                    inv.amount,
                    0,
                    a.validBefore,
                    hash
                )
            );
            (a.v, a.r, a.s) =
                vm.sign(BUYER_PK, keccak256(abi.encodePacked("\x19\x01", token.DOMAIN_SEPARATOR(), structHash)));

            uint256 before = token.balanceOf(inv.payout);
            settler.settle(inv, vm.parseJsonBytes(json, string.concat(_base(i), ".signature")), a);
            assertEq(token.balanceOf(inv.payout), before + inv.amount);
            ++settled;
        }
        assertEq(settled, 3, "three vectors have an open payer");
    }
}
