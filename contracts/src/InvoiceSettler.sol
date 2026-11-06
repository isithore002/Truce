// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC3009} from "./interfaces/IERC3009.sol";

/// @title InvoiceSettler
/// @notice Settles an EIP-712 merchant-signed invoice from a buyer's EIP-3009 authorization.
///         Funds go only to the payout address the merchant signed. Each invoice settles once.
/// @dev The owner can only pause new settlements. No function lets anyone move funds otherwise.
contract InvoiceSettler is EIP712, Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @dev Field order and types must match docs/INTERFACES.md section 1 and packages/invoice-lib.
    struct Invoice {
        bytes32 invoiceId;
        address merchant;
        address payout;
        address token;
        uint256 amount;
        uint64 dueDate;
        uint64 expiry;
        address payer;
        bytes32 domainHash;
        bytes32 memoHash;
    }

    /// @dev Buyer's EIP-3009 ReceiveWithAuthorization (to = this contract, nonce = invoice hash).
    struct Auth {
        address from;
        uint256 validAfter;
        uint256 validBefore;
        uint8 v;
        bytes32 r;
        bytes32 s;
    }

    /// @dev Four slots: (payer, paidAt), (payout), (amount, refunded), (token).
    struct Payment {
        address payer;
        uint64 paidAt;
        address payout;
        uint128 amount;
        uint128 refunded;
        address token;
    }

    bytes32 public constant INVOICE_TYPEHASH = keccak256(
        "Invoice(bytes32 invoiceId,address merchant,address payout,address token,uint256 amount,uint64 dueDate,uint64 expiry,address payer,bytes32 domainHash,bytes32 memoHash)"
    );

    mapping(address token => bool) public tokenAllowed;
    mapping(bytes32 hash => Payment) private _payments;

    event Refunded(bytes32 indexed hash, address indexed payer, uint256 amount, uint256 totalRefunded);
    event InvoicePaid(
        bytes32 indexed hash, address indexed merchant, address indexed payer, address payout, uint256 amount
    );

    error InvoiceExpired();
    error AlreadyPaid();
    error BadMerchantSignature();
    error WrongPayer();
    error TokenNotAllowed();
    error InvalidInvoice();
    error UnexpectedBalanceChange();
    error NotPaid();
    error NotPayout();
    error RefundExceedsPaid();

    /// @param owner_ can pause and unpause only.
    /// @param allowedTokens fixed for the life of the contract (no function changes it).
    constructor(address owner_, address[] memory allowedTokens) EIP712("Truce", "1") Ownable(owner_) {
        for (uint256 i; i < allowedTokens.length; ++i) {
            tokenAllowed[allowedTokens[i]] = true;
        }
    }

    /// @notice EIP-712 digest of the invoice. Also the EIP-3009 nonce and the settlement key.
    function hashInvoice(Invoice calldata inv) public view returns (bytes32) {
        // A struct of static members abi-encodes inline, identical to listing its fields.
        return _hashTypedDataV4(keccak256(abi.encode(INVOICE_TYPEHASH, inv)));
    }

    /// @notice Settle `inv` from the buyer's authorization. Anyone may submit (a relayer, or the buyer).
    /// @dev Checks, then effects (record the payment), then interactions. Pays only `inv.payout`.
    function settle(Invoice calldata inv, bytes calldata merchantSig, Auth calldata a)
        external
        whenNotPaused
        nonReentrant
    {
        if (block.timestamp > inv.expiry) revert InvoiceExpired();
        if (!tokenAllowed[inv.token]) revert TokenNotAllowed();
        if (inv.amount == 0 || inv.amount > type(uint128).max || inv.payout == address(0)) revert InvalidInvoice();
        if (inv.payer != address(0) && inv.payer != a.from) revert WrongPayer();

        bytes32 hash = hashInvoice(inv);
        Payment storage p = _payments[hash];
        if (p.paidAt != 0) revert AlreadyPaid();
        if (!SignatureChecker.isValidSignatureNow(inv.merchant, hash, merchantSig)) revert BadMerchantSignature();

        p.payer = a.from;
        p.paidAt = uint64(block.timestamp);
        p.payout = inv.payout;
        p.amount = uint128(inv.amount);
        p.token = inv.token;

        IERC20 token = IERC20(inv.token);
        uint256 balanceBefore = token.balanceOf(address(this));
        IERC3009(inv.token)
            .receiveWithAuthorization(
                a.from, address(this), inv.amount, a.validAfter, a.validBefore, hash, a.v, a.r, a.s
            );
        if (token.balanceOf(address(this)) != balanceBefore + inv.amount) revert UnexpectedBalanceChange();

        token.safeTransfer(inv.payout, inv.amount);
        emit InvoicePaid(hash, inv.merchant, a.from, inv.payout, inv.amount);
    }

    /// @notice Returns money to the original payer, capped at what was paid. The payout wallet signs an
    ///         EIP-3009 authorization (to = this contract, nonce = refundNonce(hash)); funds then go to the
    ///         payer recorded at settlement, never anywhere else. Works while paused.
    /// @dev Effects (raise `refunded`) before interactions. The cap makes `refunded <= amount` an invariant.
    function refund(bytes32 hash, uint256 amount, Auth calldata m) external nonReentrant {
        Payment storage p = _payments[hash];
        if (p.paidAt == 0) revert NotPaid();
        if (m.from != p.payout) revert NotPayout();
        if (amount == 0 || amount > p.amount - p.refunded) revert RefundExceedsPaid();

        bytes32 nonce = refundNonce(hash);
        p.refunded += uint128(amount);

        IERC20 token = IERC20(p.token);
        uint256 balanceBefore = token.balanceOf(address(this));
        IERC3009(p.token)
            .receiveWithAuthorization(m.from, address(this), amount, m.validAfter, m.validBefore, nonce, m.v, m.r, m.s);
        if (token.balanceOf(address(this)) != balanceBefore + amount) revert UnexpectedBalanceChange();

        token.safeTransfer(p.payer, amount);
        emit Refunded(hash, p.payer, amount, p.refunded);
    }

    /// @notice The EIP-3009 nonce the payout wallet must sign for the next refund of `hash`.
    function refundNonce(bytes32 hash) public view returns (bytes32) {
        // forge-lint: disable-next-line(asm-keccak256)
        return keccak256(abi.encode("REFUND", hash, uint256(_payments[hash].refunded)));
    }

    /// @notice The token an invoice was paid in (zero if unpaid).
    function paidToken(bytes32 hash) external view returns (address) {
        return _payments[hash].token;
    }

    function payments(bytes32 hash)
        external
        view
        returns (address payer, address payout, uint256 amount, uint256 refunded, uint256 paidAt)
    {
        Payment storage p = _payments[hash];
        return (p.payer, p.payout, p.amount, p.refunded, p.paidAt);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
