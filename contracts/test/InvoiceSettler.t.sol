// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IERC20Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {InvoiceSettler} from "../src/InvoiceSettler.sol";
import {SettlerBase} from "./SettlerBase.sol";

contract InvoiceSettlerTest is SettlerBase {
    function test_SettlePaysExactlyTheSignedPayout() public {
        InvoiceSettler.Invoice memory inv = _invoice();
        _settleAsRelayer(inv, _merchantSig(inv, MERCHANT_PK), _payNowAuth(inv));

        assertEq(token.balanceOf(payout), AMOUNT);
        assertEq(token.balanceOf(payer), 10_000e6 - AMOUNT);
        (address p, address po, uint256 amount, uint256 refunded, uint256 paidAt) =
            settler.payments(settler.hashInvoice(inv));
        assertEq(p, payer);
        assertEq(po, payout);
        assertEq(amount, AMOUNT);
        assertEq(refunded, 0);
        assertEq(paidAt, block.timestamp);
    }

    function test_SettleEmitsInvoicePaid() public {
        InvoiceSettler.Invoice memory inv = _invoice();
        bytes memory sig = _merchantSig(inv, MERCHANT_PK);
        InvoiceSettler.Auth memory a = _payNowAuth(inv);
        vm.expectEmit(true, true, true, true, address(settler));
        emit InvoicePaid(settler.hashInvoice(inv), merchant, payer, payout, AMOUNT);
        _settleAsRelayer(inv, sig, a);
    }

    /// @dev Hero test. The emailed invoice is altered to pay the attacker; the merchant signature no longer
    ///      matches, so nothing moves even though the buyer's own authorization is otherwise valid.
    function test_SwappedPayoutReverts_BadMerchantSignature() public {
        InvoiceSettler.Invoice memory inv = _invoice();
        bytes memory sig = _merchantSig(inv, MERCHANT_PK);
        InvoiceSettler.Auth memory a = _payNowAuth(inv);

        InvoiceSettler.Invoice memory swapped = inv;
        swapped.payout = attackerPayout;

        vm.expectRevert(InvoiceSettler.BadMerchantSignature.selector);
        _settleAsRelayer(swapped, sig, a);

        assertEq(token.balanceOf(attackerPayout), 0);
        assertEq(token.balanceOf(payer), 10_000e6);
    }

    /// @dev The attacker re-signs the swapped invoice with their own key. The buyer authorized the honest
    ///      invoice hash as the EIP-3009 nonce, so the token rejects the authorization.
    function test_AttackerResignedInvoiceReverts_BuyerAuthDoesNotMatch() public {
        InvoiceSettler.Invoice memory inv = _invoice();
        InvoiceSettler.Auth memory a = _payNowAuth(inv); // signed over the honest invoice hash

        InvoiceSettler.Invoice memory forged = inv;
        forged.merchant = vm.addr(ATTACKER_PK);
        forged.payout = attackerPayout;

        bytes memory forgedSig = _merchantSig(forged, ATTACKER_PK);
        vm.expectRevert("invalid signature");
        _settleAsRelayer(forged, forgedSig, a);
        assertEq(token.balanceOf(attackerPayout), 0);
    }

    function test_TamperedAmountReverts() public {
        InvoiceSettler.Invoice memory inv = _invoice();
        bytes memory sig = _merchantSig(inv, MERCHANT_PK);
        InvoiceSettler.Auth memory a = _payNowAuth(inv);

        inv.amount = AMOUNT * 2;
        vm.expectRevert(InvoiceSettler.BadMerchantSignature.selector);
        _settleAsRelayer(inv, sig, a);
    }

    function test_WrongMerchantSignerReverts() public {
        InvoiceSettler.Invoice memory inv = _invoice();
        bytes memory sig = _merchantSig(inv, ATTACKER_PK);
        InvoiceSettler.Auth memory a = _payNowAuth(inv);
        vm.expectRevert(InvoiceSettler.BadMerchantSignature.selector);
        _settleAsRelayer(inv, sig, a);
    }

    function test_ExpiredReverts() public {
        InvoiceSettler.Invoice memory inv = _invoice();
        bytes memory sig = _merchantSig(inv, MERCHANT_PK);
        InvoiceSettler.Auth memory a = _auth(inv, PAYER_PK, 0, inv.expiry + 1 days);

        vm.warp(uint256(inv.expiry) + 1);
        vm.expectRevert(InvoiceSettler.InvoiceExpired.selector);
        _settleAsRelayer(inv, sig, a);
    }

    function test_SettleTwiceReverts_AlreadyPaid() public {
        InvoiceSettler.Invoice memory inv = _invoice();
        bytes memory sig = _merchantSig(inv, MERCHANT_PK);
        InvoiceSettler.Auth memory a = _payNowAuth(inv);
        _settleAsRelayer(inv, sig, a);

        vm.expectRevert(InvoiceSettler.AlreadyPaid.selector);
        _settleAsRelayer(inv, sig, a);
        assertEq(token.balanceOf(payout), AMOUNT);
    }

    function test_PayerLockRejectsOtherPayer() public {
        InvoiceSettler.Invoice memory inv = _invoice();
        inv.payer = makeAddr("someoneElse");
        bytes memory sig = _merchantSig(inv, MERCHANT_PK);
        InvoiceSettler.Auth memory a = _payNowAuth(inv);
        vm.expectRevert(InvoiceSettler.WrongPayer.selector);
        _settleAsRelayer(inv, sig, a);
    }

    function test_PayerLockAcceptsTheLockedPayer() public {
        InvoiceSettler.Invoice memory inv = _invoice();
        inv.payer = payer;
        _settleAsRelayer(inv, _merchantSig(inv, MERCHANT_PK), _payNowAuth(inv));
        assertEq(token.balanceOf(payout), AMOUNT);
    }

    function test_TokenNotAllowedReverts() public {
        InvoiceSettler.Invoice memory inv = _invoice();
        inv.token = makeAddr("otherToken");
        bytes memory sig = _merchantSig(inv, MERCHANT_PK);
        InvoiceSettler.Auth memory a = _payNowAuth(_invoice());
        vm.expectRevert(InvoiceSettler.TokenNotAllowed.selector);
        _settleAsRelayer(inv, sig, a);
    }

    function test_EmptyBuyerBalanceReverts() public {
        InvoiceSettler.Invoice memory inv = _invoice();
        bytes memory sig = _merchantSig(inv, MERCHANT_PK);
        uint256 poorPk = 0xDEAD;
        InvoiceSettler.Auth memory a = _auth(inv, poorPk, 0, inv.expiry);

        vm.expectRevert(
            abi.encodeWithSelector(IERC20Errors.ERC20InsufficientBalance.selector, vm.addr(poorPk), 0, AMOUNT)
        );
        _settleAsRelayer(inv, sig, a);
        // The revert rolled back the recorded payment, so the invoice can still be paid later.
        (,,,, uint256 paidAt) = settler.payments(settler.hashInvoice(inv));
        assertEq(paidAt, 0);
    }

    function test_PausedReverts() public {
        InvoiceSettler.Invoice memory inv = _invoice();
        bytes memory sig = _merchantSig(inv, MERCHANT_PK);
        InvoiceSettler.Auth memory a = _payNowAuth(inv);
        vm.prank(owner);
        settler.pause();
        vm.expectRevert(Pausable.EnforcedPause.selector);
        _settleAsRelayer(inv, sig, a);
    }

    function test_ContractTokenBalanceIsZeroAfterSettle() public {
        InvoiceSettler.Invoice memory inv = _invoice();
        _settleAsRelayer(inv, _merchantSig(inv, MERCHANT_PK), _payNowAuth(inv));
        assertEq(token.balanceOf(address(settler)), 0);
    }
}
