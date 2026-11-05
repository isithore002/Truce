// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {InvoiceSettler} from "../src/InvoiceSettler.sol";
import {SettlerBase} from "./SettlerBase.sol";
import {FeeOnTransferToken} from "./mocks/FeeOnTransferToken.sol";
import {MockERC1271Wallet} from "./mocks/MockERC1271Wallet.sol";

/// @notice Edge cases: fee tokens, time windows, contract wallets, validation, admin, and a fuzz test.
contract InvoiceSettlerEdgeTest is SettlerBase {
    function test_FeeOnTransferTokenReverts() public {
        FeeOnTransferToken feeToken = new FeeOnTransferToken();
        address[] memory allowed = new address[](1);
        allowed[0] = address(feeToken);
        settler = new InvoiceSettler(owner, allowed);
        token = feeToken;
        feeToken.mint(payer, 10_000e6);

        InvoiceSettler.Invoice memory inv = _invoice();
        bytes memory sig = _merchantSig(inv, MERCHANT_PK);
        InvoiceSettler.Auth memory a = _payNowAuth(inv);

        vm.expectRevert(InvoiceSettler.UnexpectedBalanceChange.selector);
        _settleAsRelayer(inv, sig, a);
        assertEq(feeToken.balanceOf(payout), 0);
    }

    // ---- authorization time window (the token enforces it; the due-date mode relies on it) ----

    function test_AuthorizationBeforeValidAfterReverts() public {
        InvoiceSettler.Invoice memory inv = _invoice();
        bytes memory sig = _merchantSig(inv, MERCHANT_PK);
        InvoiceSettler.Auth memory a = _auth(inv, PAYER_PK, inv.dueDate, inv.expiry);

        vm.expectRevert("authorization is not yet valid");
        _settleAsRelayer(inv, sig, a);

        // From the due date on, the same authorization settles.
        vm.warp(uint256(inv.dueDate) + 1);
        _settleAsRelayer(inv, sig, a);
        assertEq(token.balanceOf(payout), AMOUNT);
    }

    function test_AuthorizationAfterValidBeforeReverts() public {
        InvoiceSettler.Invoice memory inv = _invoice();
        bytes memory sig = _merchantSig(inv, MERCHANT_PK);
        InvoiceSettler.Auth memory a = _auth(inv, PAYER_PK, 0, block.timestamp + 1 days);

        vm.warp(block.timestamp + 2 days);
        vm.expectRevert("authorization is expired");
        _settleAsRelayer(inv, sig, a);
    }

    function test_AuthorizationFromAnotherSignerReverts() public {
        InvoiceSettler.Invoice memory inv = _invoice();
        bytes memory sig = _merchantSig(inv, MERCHANT_PK);
        InvoiceSettler.Auth memory a = _auth(inv, ATTACKER_PK, 0, inv.expiry);
        a.from = payer; // claims to be the buyer but is signed by someone else

        vm.expectRevert("invalid signature");
        _settleAsRelayer(inv, sig, a);
        assertEq(token.balanceOf(payer), 10_000e6);
    }

    // ---- merchant contract wallet (ERC-1271) ----

    function test_MerchantContractWallet_ERC1271Accepted() public {
        MockERC1271Wallet wallet = new MockERC1271Wallet(vm.addr(MERCHANT_PK));
        InvoiceSettler.Invoice memory inv = _invoice();
        inv.merchant = address(wallet);

        _settleAsRelayer(inv, _merchantSig(inv, MERCHANT_PK), _payNowAuth(inv));
        assertEq(token.balanceOf(payout), AMOUNT);
    }

    function test_MerchantContractWallet_RejectsOtherSigner() public {
        MockERC1271Wallet wallet = new MockERC1271Wallet(vm.addr(MERCHANT_PK));
        InvoiceSettler.Invoice memory inv = _invoice();
        inv.merchant = address(wallet);
        bytes memory sig = _merchantSig(inv, ATTACKER_PK);
        InvoiceSettler.Auth memory a = _payNowAuth(inv);

        vm.expectRevert(InvoiceSettler.BadMerchantSignature.selector);
        _settleAsRelayer(inv, sig, a);
    }

    // ---- invoice validation ----

    function test_ZeroAmountReverts() public {
        InvoiceSettler.Invoice memory inv = _invoice();
        inv.amount = 0;
        bytes memory sig = _merchantSig(inv, MERCHANT_PK);
        InvoiceSettler.Auth memory a = _payNowAuth(inv);
        vm.expectRevert(InvoiceSettler.InvalidInvoice.selector);
        _settleAsRelayer(inv, sig, a);
    }

    function test_ZeroPayoutReverts() public {
        InvoiceSettler.Invoice memory inv = _invoice();
        inv.payout = address(0);
        bytes memory sig = _merchantSig(inv, MERCHANT_PK);
        InvoiceSettler.Auth memory a = _payNowAuth(inv);
        vm.expectRevert(InvoiceSettler.InvalidInvoice.selector);
        _settleAsRelayer(inv, sig, a);
    }

    function test_AmountAboveUint128Reverts() public {
        InvoiceSettler.Invoice memory inv = _invoice();
        inv.amount = uint256(type(uint128).max) + 1;
        bytes memory sig = _merchantSig(inv, MERCHANT_PK);
        InvoiceSettler.Auth memory a = _payNowAuth(inv);
        vm.expectRevert(InvoiceSettler.InvalidInvoice.selector);
        _settleAsRelayer(inv, sig, a);
    }

    function test_BuyerCanSubmitTheirOwnSettlement() public {
        InvoiceSettler.Invoice memory inv = _invoice();
        bytes memory sig = _merchantSig(inv, MERCHANT_PK);
        InvoiceSettler.Auth memory a = _payNowAuth(inv);
        vm.prank(payer);
        settler.settle(inv, sig, a);
        assertEq(token.balanceOf(payout), AMOUNT);
    }

    // ---- admin ----

    function test_OnlyOwnerCanPause() public {
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, attackerPayout));
        vm.prank(attackerPayout);
        settler.pause();
    }

    function test_UnpauseRestoresSettling() public {
        InvoiceSettler.Invoice memory inv = _invoice();
        bytes memory sig = _merchantSig(inv, MERCHANT_PK);
        InvoiceSettler.Auth memory a = _payNowAuth(inv);
        vm.startPrank(owner);
        settler.pause();
        settler.unpause();
        vm.stopPrank();
        _settleAsRelayer(inv, sig, a);
        assertEq(token.balanceOf(payout), AMOUNT);
    }

    function test_AllowlistIsFixedAtDeploy() public view {
        assertTrue(settler.tokenAllowed(address(token)));
        assertFalse(settler.tokenAllowed(address(0xdead)));
    }

    // ---- fuzz ----

    /// @dev Settlement succeeds exactly when: now <= expiry, now > validAfter and now < validBefore.
    function testFuzz_AmountAndTimes(uint256 amount, uint256 afterOff, uint256 beforeOff, uint256 nowOff) public {
        amount = bound(amount, 1, 10_000e6);
        afterOff = bound(afterOff, 0, 10 days);
        beforeOff = bound(beforeOff, 1, 40 days);
        nowOff = bound(nowOff, 0, 45 days);

        uint256 t0 = block.timestamp;
        InvoiceSettler.Invoice memory inv = _invoice();
        inv.amount = amount;
        bytes memory sig = _merchantSig(inv, MERCHANT_PK);
        InvoiceSettler.Auth memory a = _auth(inv, PAYER_PK, t0 + afterOff, t0 + beforeOff);

        uint256 ts = t0 + nowOff;
        vm.warp(ts);
        bool shouldPass = ts <= inv.expiry && ts > a.validAfter && ts < a.validBefore;

        if (!shouldPass) vm.expectRevert();
        _settleAsRelayer(inv, sig, a);

        assertEq(token.balanceOf(payout), shouldPass ? amount : 0);
        assertEq(token.balanceOf(address(settler)), 0);
    }
}
