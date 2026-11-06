// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {InvoiceSettler} from "../src/InvoiceSettler.sol";
import {SettlerBase} from "./SettlerBase.sol";

/// @dev Refunds: the payout wallet signs an EIP-3009 authorization; money goes only to the original payer, capped.
contract InvoiceSettlerRefundTest is SettlerBase {
    event Refunded(bytes32 indexed hash, address indexed payer, uint256 amount, uint256 totalRefunded);

    uint256 constant PAYOUT_PK = 0xFEED;
    address merchantWallet;
    InvoiceSettler.Invoice inv;
    bytes32 hash;

    function setUp() public override {
        super.setUp();
        merchantWallet = vm.addr(PAYOUT_PK);
        token.mint(merchantWallet, 5_000e6);
        inv = _invoice();
        inv.payout = merchantWallet;
        hash = settler.hashInvoice(inv);
        _settleAsRelayer(inv, _merchantSig(inv, MERCHANT_PK), _payNowAuth(inv));
    }

    function _refundAuth(uint256 amount, uint256 pk, bytes32 nonce)
        internal
        view
        returns (InvoiceSettler.Auth memory a)
    {
        a.from = vm.addr(pk);
        a.validAfter = 0;
        a.validBefore = block.timestamp + 1 days;
        bytes32 structHash = keccak256(
            abi.encode(
                token.RECEIVE_WITH_AUTHORIZATION_TYPEHASH(),
                a.from,
                address(settler),
                amount,
                a.validAfter,
                a.validBefore,
                nonce
            )
        );
        (a.v, a.r, a.s) = vm.sign(pk, keccak256(abi.encodePacked("\x19\x01", token.DOMAIN_SEPARATOR(), structHash)));
    }

    function _refund(uint256 amount) internal {
        InvoiceSettler.Auth memory m = _refundAuth(amount, PAYOUT_PK, settler.refundNonce(hash));
        vm.prank(relayer);
        settler.refund(hash, amount, m);
    }

    function test_PartialRefundGoesToTheOriginalPayer() public {
        uint256 payerBefore = token.balanceOf(payer);
        vm.expectEmit(true, true, false, true, address(settler));
        emit Refunded(hash, payer, 250e6, 250e6);
        _refund(250e6);
        assertEq(token.balanceOf(payer), payerBefore + 250e6);
        assertEq(token.balanceOf(merchantWallet), 5_000e6 + AMOUNT - 250e6);
        (,,, uint256 refunded,) = settler.payments(hash);
        assertEq(refunded, 250e6);
        assertEq(token.balanceOf(address(settler)), 0);
    }

    function test_FullRefundThenAnyMoreReverts() public {
        _refund(AMOUNT);
        InvoiceSettler.Auth memory m = _refundAuth(1, PAYOUT_PK, settler.refundNonce(hash));
        vm.expectRevert(InvoiceSettler.RefundExceedsPaid.selector);
        vm.prank(relayer);
        settler.refund(hash, 1, m);
        assertEq(token.balanceOf(address(settler)), 0);
    }

    function test_RefundsCannotExceedThePaidAmountInTotal() public {
        _refund(1_000e6);
        InvoiceSettler.Auth memory m = _refundAuth(251e6, PAYOUT_PK, settler.refundNonce(hash));
        vm.expectRevert(InvoiceSettler.RefundExceedsPaid.selector);
        settler.refund(hash, 251e6, m);
        _refund(250e6); // exactly the remainder is fine
        (,,, uint256 refunded,) = settler.payments(hash);
        assertEq(refunded, AMOUNT);
    }

    function test_ZeroAmountReverts() public {
        InvoiceSettler.Auth memory m = _refundAuth(0, PAYOUT_PK, settler.refundNonce(hash));
        vm.expectRevert(InvoiceSettler.RefundExceedsPaid.selector);
        settler.refund(hash, 0, m);
    }

    function test_UnknownInvoiceReverts() public {
        InvoiceSettler.Auth memory m = _refundAuth(1e6, PAYOUT_PK, bytes32(0));
        vm.expectRevert(InvoiceSettler.NotPaid.selector);
        settler.refund(bytes32(uint256(123)), 1e6, m);
    }

    function test_OnlyThePayoutWalletCanAuthorize() public {
        // An attacker with their own funds and own signature cannot trigger a refund of someone else's invoice.
        token.mint(vm.addr(ATTACKER_PK), 5_000e6);
        InvoiceSettler.Auth memory m = _refundAuth(100e6, ATTACKER_PK, settler.refundNonce(hash));
        vm.expectRevert(InvoiceSettler.NotPayout.selector);
        settler.refund(hash, 100e6, m);
    }

    function test_AuthorizationForADifferentAmountFails() public {
        InvoiceSettler.Auth memory m = _refundAuth(10e6, PAYOUT_PK, settler.refundNonce(hash));
        vm.expectRevert(); // token rejects: signature covers 10e6, not 500e6
        settler.refund(hash, 500e6, m);
        (,,, uint256 refunded,) = settler.payments(hash);
        assertEq(refunded, 0, "failed refund leaves no trace");
    }

    function test_ReplayingARefundAuthorizationFails() public {
        InvoiceSettler.Auth memory m = _refundAuth(100e6, PAYOUT_PK, settler.refundNonce(hash));
        settler.refund(hash, 100e6, m);
        vm.expectRevert(); // nonce moved on, so the same signature no longer matches
        settler.refund(hash, 100e6, m);
        (,,, uint256 refunded,) = settler.payments(hash);
        assertEq(refunded, 100e6);
    }

    function test_RefundWorksWhilePaused() public {
        vm.prank(owner);
        settler.pause();
        _refund(100e6);
        (,,, uint256 refunded,) = settler.payments(hash);
        assertEq(refunded, 100e6);
    }

    function test_PayoutWithTooLittleBalanceReverts() public {
        // Empty the merchant wallet, then try to refund.
        uint256 all = token.balanceOf(merchantWallet);
        vm.prank(merchantWallet);
        token.transfer(address(0xdead), all);
        InvoiceSettler.Auth memory m = _refundAuth(100e6, PAYOUT_PK, settler.refundNonce(hash));
        vm.expectRevert();
        settler.refund(hash, 100e6, m);
        (,,, uint256 refunded,) = settler.payments(hash);
        assertEq(refunded, 0);
    }

    function test_PaidTokenIsRecorded() public view {
        assertEq(settler.paidToken(hash), address(token));
        assertEq(settler.paidToken(bytes32(uint256(5))), address(0));
    }

    function testFuzz_RefundsNeverExceedPaid(uint256 a, uint256 b) public {
        a = bound(a, 1, AMOUNT);
        _refund(a);
        b = bound(b, 1, AMOUNT);
        InvoiceSettler.Auth memory m = _refundAuth(b, PAYOUT_PK, settler.refundNonce(hash));
        if (b > AMOUNT - a) vm.expectRevert(InvoiceSettler.RefundExceedsPaid.selector);
        settler.refund(hash, b, m);
        (,,, uint256 refunded,) = settler.payments(hash);
        assertLe(refunded, AMOUNT);
        assertEq(token.balanceOf(address(settler)), 0);
    }
}

/// @dev Stateful fuzzing: settle and refund in random order. Refunds can never exceed what was paid.
contract RefundHandler is SettlerBase {
    uint256 constant HPAYOUT_PK = 0xFEED;
    bytes32[] public hashes;
    uint256 public totalPaid;
    uint256 public totalRefunded;

    function setUp() public override {
        super.setUp();
        token.mint(payer, 1_000_000e6);
        token.mint(vm.addr(HPAYOUT_PK), 1_000_000e6);
    }

    function settleOne(uint256 idSeed) external {
        InvoiceSettler.Invoice memory inv = _invoice();
        inv.invoiceId = bytes32(bound(idSeed, 1, 3));
        inv.payout = vm.addr(HPAYOUT_PK);
        bytes32 h = settler.hashInvoice(inv);
        (,,,, uint256 paidAt) = settler.payments(h);
        if (paidAt != 0) return;
        _settleAsRelayer(inv, _merchantSig(inv, MERCHANT_PK), _payNowAuth(inv));
        hashes.push(h);
        totalPaid += inv.amount;
    }

    function refundSome(uint256 which, uint256 amountSeed) external {
        if (hashes.length == 0) return;
        bytes32 h = hashes[which % hashes.length];
        uint256 amount = bound(amountSeed, 1, AMOUNT);
        bytes32 nonce = settler.refundNonce(h);
        InvoiceSettler.Auth memory a;
        a.from = vm.addr(HPAYOUT_PK);
        a.validBefore = block.timestamp + 1 days;
        bytes32 structHash = keccak256(
            abi.encode(
                token.RECEIVE_WITH_AUTHORIZATION_TYPEHASH(),
                a.from,
                address(settler),
                amount,
                a.validAfter,
                a.validBefore,
                nonce
            )
        );
        (a.v, a.r, a.s) =
            vm.sign(HPAYOUT_PK, keccak256(abi.encodePacked("\x19\x01", token.DOMAIN_SEPARATOR(), structHash)));
        try settler.refund(h, amount, a) {
            totalRefunded += amount;
        } catch {}
    }

    function settlerBalance() external view returns (uint256) {
        return token.balanceOf(address(settler));
    }

    function sumRefunded() public view returns (uint256 sum) {
        for (uint256 i; i < hashes.length; ++i) {
            (,, uint256 amt, uint256 refunded,) = settler.payments(hashes[i]);
            require(refunded <= amt, "refunded exceeds paid");
            sum += refunded;
        }
    }
}

/// forge-config: default.invariant.runs = 32
/// forge-config: default.invariant.depth = 40
contract InvoiceSettlerRefundInvariantTest is SettlerBase {
    RefundHandler h;

    function setUp() public override {
        super.setUp();
        h = new RefundHandler();
        h.setUp();
        // The handler owns its own settler; invariants are checked through it.
        targetContract(address(h));
        bytes4[] memory sels = new bytes4[](2);
        sels[0] = RefundHandler.settleOne.selector;
        sels[1] = RefundHandler.refundSome.selector;
        targetSelector(FuzzSelector({addr: address(h), selectors: sels}));
    }

    /// @dev Guards against a vacuous run: the handler really settles and refunds.
    function test_HandlerActuallyRefunds() public {
        h.settleOne(1);
        h.refundSome(0, 100e6);
        assertGt(h.totalPaid(), 0);
        assertGt(h.totalRefunded(), 0);
        assertEq(h.sumRefunded(), h.totalRefunded());
    }

    function invariant_RefundedNeverExceedsPaidAndSettlerHoldsNothing() public view {
        assertEq(h.sumRefunded(), h.totalRefunded());
        assertLe(h.totalRefunded(), h.totalPaid());
        assertEq(h.settlerBalance(), 0);
    }
}
