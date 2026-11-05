// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";
import {InvoiceSettler} from "../src/InvoiceSettler.sol";
import {SettlerBase} from "./SettlerBase.sol";
import {MockEIP3009Token} from "./mocks/MockEIP3009Token.sol";

/// @dev Fuzzed caller. Few ids and amounts on purpose, so the same invoice is attempted repeatedly.
contract SettleHandler is Test {
    InvoiceSettler immutable SETTLER;
    MockEIP3009Token immutable TOKEN;
    uint256 immutable MERCHANT_PK;
    uint256 immutable PAYER_PK;
    address immutable PAYOUT;

    mapping(bytes32 => uint256) public successes;
    uint256 public maxSuccessesForOneHash;
    uint256 public totalSettled;

    constructor(InvoiceSettler s, MockEIP3009Token t, uint256 merchantPk, uint256 payerPk, address payout_) {
        SETTLER = s;
        TOKEN = t;
        MERCHANT_PK = merchantPk;
        PAYER_PK = payerPk;
        PAYOUT = payout_;
    }

    function settle(uint256 idSeed, uint256 amountSeed) external {
        InvoiceSettler.Invoice memory inv = InvoiceSettler.Invoice({
            invoiceId: bytes32(bound(idSeed, 1, 4)),
            merchant: vm.addr(MERCHANT_PK),
            payout: PAYOUT,
            token: address(TOKEN),
            amount: bound(amountSeed, 1, 3) * 1e6,
            dueDate: 0,
            expiry: uint64(block.timestamp + 30 days),
            payer: address(0),
            domainHash: keccak256("invariant.example"),
            memoHash: keccak256("memo")
        });
        bytes32 hash = SETTLER.hashInvoice(inv);

        (uint8 mv, bytes32 mr, bytes32 ms) = vm.sign(MERCHANT_PK, hash);
        InvoiceSettler.Auth memory a = InvoiceSettler.Auth(vm.addr(PAYER_PK), 0, inv.expiry, 0, 0, 0);
        bytes32 structHash = keccak256(
            abi.encode(
                TOKEN.RECEIVE_WITH_AUTHORIZATION_TYPEHASH(),
                a.from,
                address(SETTLER),
                inv.amount,
                0,
                a.validBefore,
                hash
            )
        );
        (a.v, a.r, a.s) =
            vm.sign(PAYER_PK, keccak256(abi.encodePacked("\x19\x01", TOKEN.DOMAIN_SEPARATOR(), structHash)));

        try SETTLER.settle(inv, abi.encodePacked(mr, ms, mv), a) {
            uint256 n = ++successes[hash];
            if (n > maxSuccessesForOneHash) maxSuccessesForOneHash = n;
            totalSettled += inv.amount;
        } catch {}
    }
}

/// forge-config: default.invariant.runs = 32
/// forge-config: default.invariant.depth = 50
contract InvoiceSettlerInvariantTest is SettlerBase {
    SettleHandler handler;

    function setUp() public override {
        super.setUp();
        token.mint(payer, 1_000_000e6);
        handler = new SettleHandler(settler, token, MERCHANT_PK, PAYER_PK, payout);
        targetContract(address(handler));
    }

    /// @dev Guards against a vacuous invariant run: the handler really settles, and a repeat is rejected.
    function test_HandlerSettlesOnceAndRejectsTheRepeat() public {
        handler.settle(1, 1);
        handler.settle(1, 1);
        assertEq(handler.totalSettled(), 1e6);
        assertEq(handler.maxSuccessesForOneHash(), 1);
        assertEq(token.balanceOf(payout), 1e6);
    }

    /// @dev No invoice hash ever settles more than once.
    function invariant_NoHashSettlesTwice() public view {
        assertLe(handler.maxSuccessesForOneHash(), 1);
    }

    /// @dev The settler never keeps tokens: everything it pulls goes to the signed payout.
    function invariant_SettlerHoldsNoTokens() public view {
        assertEq(token.balanceOf(address(settler)), 0);
    }

    /// @dev The payout receives exactly the sum of the amounts that settled.
    function invariant_PayoutReceivedEqualsSettledTotal() public view {
        assertEq(token.balanceOf(payout), handler.totalSettled());
    }
}
