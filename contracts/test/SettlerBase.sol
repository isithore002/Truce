// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";
import {InvoiceSettler} from "../src/InvoiceSettler.sol";
import {MockEIP3009Token} from "./mocks/MockEIP3009Token.sol";

/// @dev Shared fixture: chain 1874, one allowlisted EIP-3009 token, merchant/payer/attacker keys.
abstract contract SettlerBase is Test {
    event InvoicePaid(
        bytes32 indexed hash, address indexed merchant, address indexed payer, address payout, uint256 amount
    );

    uint256 constant AMOUNT = 1_250e6; // 1,250 USDT (6 decimals)
    uint256 constant MERCHANT_PK = 0xA11CE;
    uint256 constant PAYER_PK = 0xB0B;
    uint256 constant ATTACKER_PK = 0xBAD;

    InvoiceSettler settler;
    MockEIP3009Token token;

    address owner = makeAddr("owner");
    address relayer = makeAddr("relayer");
    address payout = makeAddr("merchantPayout");
    address attackerPayout = makeAddr("attackerPayout");
    address merchant;
    address payer;

    function setUp() public virtual {
        vm.chainId(1874);
        vm.warp(1_700_000_000);
        merchant = vm.addr(MERCHANT_PK);
        payer = vm.addr(PAYER_PK);

        token = new MockEIP3009Token();
        address[] memory allowed = new address[](1);
        allowed[0] = address(token);
        settler = new InvoiceSettler(owner, allowed);
        token.mint(payer, 10_000e6);
    }

    function _invoice() internal view returns (InvoiceSettler.Invoice memory) {
        return InvoiceSettler.Invoice({
            invoiceId: bytes32(uint256(1)),
            merchant: merchant,
            payout: payout,
            token: address(token),
            amount: AMOUNT,
            dueDate: uint64(block.timestamp + 7 days),
            expiry: uint64(block.timestamp + 30 days),
            payer: address(0),
            domainHash: keccak256("northlight-design.example"),
            memoHash: keccak256("memo")
        });
    }

    function _merchantSig(InvoiceSettler.Invoice memory inv, uint256 pk) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, settler.hashInvoice(inv));
        return abi.encodePacked(r, s, v);
    }

    /// @dev Buyer signs EIP-3009 ReceiveWithAuthorization to the settler with nonce = invoice hash.
    function _auth(InvoiceSettler.Invoice memory inv, uint256 pk, uint256 validAfter, uint256 validBefore)
        internal
        view
        returns (InvoiceSettler.Auth memory a)
    {
        a.from = vm.addr(pk);
        a.validAfter = validAfter;
        a.validBefore = validBefore;
        bytes32 structHash = keccak256(
            abi.encode(
                token.RECEIVE_WITH_AUTHORIZATION_TYPEHASH(),
                a.from,
                address(settler),
                inv.amount,
                validAfter,
                validBefore,
                settler.hashInvoice(inv)
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", token.DOMAIN_SEPARATOR(), structHash));
        (a.v, a.r, a.s) = vm.sign(pk, digest);
    }

    /// @dev A valid pay-now authorization for `inv` from the default payer.
    function _payNowAuth(InvoiceSettler.Invoice memory inv) internal view returns (InvoiceSettler.Auth memory) {
        return _auth(inv, PAYER_PK, 0, inv.expiry);
    }

    function _settleAsRelayer(InvoiceSettler.Invoice memory inv, bytes memory sig, InvoiceSettler.Auth memory a)
        internal
    {
        vm.prank(relayer);
        settler.settle(inv, sig, a);
    }
}
