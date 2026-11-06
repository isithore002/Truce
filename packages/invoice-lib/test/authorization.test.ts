import { concat, encodeAbiParameters, hashDomain, hashTypedData, keccak256, parseAbiParameters, recoverTypedDataAddress, stringToHex, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";
import {
  TRACK_USDT,
  authorizationWindow,
  cancelAuthorizationTypedData,
  receiveAuthorizationTypedData,
  signCancelAuthorization,
  signReceiveAuthorization,
  splitSignature,
  tokenDomain,
} from "../src/authorization.js";
import { invoiceHash } from "../src/hash.js";
import { ANVIL_KEY_0, baseInvoice, ctx } from "./fixtures.js";

const tokenCtx = { chainId: 1874, token: TRACK_USDT };
const buyer = privateKeyToAccount(ANVIL_KEY_0);
const settler = ctx.verifyingContract;
const hash = invoiceHash(baseInvoice, ctx);

// Read from the live track USDT with `DOMAIN_SEPARATOR()` on chain 1874 (read-only call).
const ONCHAIN_DOMAIN_SEPARATOR: Hex = "0xcdcfacb6b15c8238b4e5fbb47bdb83b7f83f50a531d264bf9763d2bd1d3d2a25";

describe("token domain", () => {
  it("reproduces the live track USDT DOMAIN_SEPARATOR", () => {
    const sep = hashDomain({
      domain: { ...tokenDomain(tokenCtx), chainId: 1874n },
      types: {
        EIP712Domain: [
          { name: "name", type: "string" },
          { name: "version", type: "string" },
          { name: "chainId", type: "uint256" },
          { name: "verifyingContract", type: "address" },
        ],
      },
    });
    expect(sep).toBe(ONCHAIN_DOMAIN_SEPARATOR);
  });
});

describe("authorizationWindow", () => {
  it("pay now is valid from the start, due mode from the due date; both end at expiry", () => {
    expect(authorizationWindow(baseInvoice, "now")).toEqual({ validAfter: 0n, validBefore: baseInvoice.expiry });
    expect(authorizationWindow(baseInvoice, "due")).toEqual({ validAfter: baseInvoice.dueDate, validBefore: baseInvoice.expiry });
  });
});

describe("receive authorization", () => {
  const typed = receiveAuthorizationTypedData({ from: buyer.address, settler, invoice: baseInvoice, invoiceHash: hash, mode: "now" }, tokenCtx);

  it("pays the settler the invoice amount with the invoice hash as nonce", () => {
    expect(typed.message).toEqual({
      from: buyer.address,
      to: settler,
      value: baseInvoice.amount,
      validAfter: 0n,
      validBefore: baseInvoice.expiry,
      nonce: hash,
    });
    expect(typed.domain).toEqual({ name: "Tether USD", version: "1", chainId: 1874, verifyingContract: TRACK_USDT });
  });

  it("round trips: the buyer signature recovers to the buyer", async () => {
    const auth = await signReceiveAuthorization(buyer, { settler, invoice: baseInvoice, invoiceHash: hash, mode: "now" }, tokenCtx);
    expect([27, 28]).toContain(auth.v);
    const sig = concat([auth.r, auth.s, auth.v === 27 ? "0x1b" : "0x1c"]);
    expect(await recoverTypedDataAddress({ ...typed, signature: sig })).toBe(buyer.address);
    expect(auth.mode).toBe("now");
    expect(auth.from).toBe(buyer.address);
  });

  it("due mode signs a different authorization (validAfter = due date)", async () => {
    const now = await signReceiveAuthorization(buyer, { settler, invoice: baseInvoice, invoiceHash: hash, mode: "now" }, tokenCtx);
    const due = await signReceiveAuthorization(buyer, { settler, invoice: baseInvoice, invoiceHash: hash, mode: "due" }, tokenCtx);
    expect(due.validAfter).toBe(baseInvoice.dueDate);
    expect(due.r).not.toBe(now.r);
  });

  it("matches a hand-rolled EIP-712 encoding", () => {
    const typeHash = keccak256(stringToHex("ReceiveWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"));
    const structHash = keccak256(
      encodeAbiParameters(parseAbiParameters("bytes32, address, address, uint256, uint256, uint256, bytes32"), [
        typeHash,
        buyer.address,
        settler,
        baseInvoice.amount,
        0n,
        baseInvoice.expiry,
        hash,
      ]),
    );
    const digest = keccak256(concat(["0x1901", ONCHAIN_DOMAIN_SEPARATOR, structHash]));
    // viem's own digest for the same typed data must equal the manual one built on the on-chain separator.
    expect(hashTypedData(typed)).toBe(digest);
  });
});

describe("cancel authorization", () => {
  it("signs CancelAuthorization(authorizer, nonce) in the token domain", async () => {
    const typed = cancelAuthorizationTypedData({ authorizer: buyer.address, nonce: hash }, tokenCtx);
    expect(typed.primaryType).toBe("CancelAuthorization");
    const { v, r, s } = await signCancelAuthorization(buyer, hash, tokenCtx);
    const sig = concat([r, s, v === 27 ? "0x1b" : "0x1c"]);
    expect(await recoverTypedDataAddress({ ...typed, signature: sig })).toBe(buyer.address);
  });
});

describe("splitSignature", () => {
  it("returns v as 27 or 28", async () => {
    const sig = await buyer.signTypedData(receiveAuthorizationTypedData({ from: buyer.address, settler, invoice: baseInvoice, invoiceHash: hash, mode: "now" }, tokenCtx));
    const { v, r, s } = splitSignature(sig);
    expect([27, 28]).toContain(v);
    expect(concat([r, s, v === 27 ? "0x1b" : "0x1c"])).toBe(sig);
  });
});

describe("refund authorization", () => {
  it("builds the nonce from the invoice hash and the amount refunded so far", async () => {
    const { refundNonce } = await import("../src/authorization.js");
    const h = ("0x" + "11".repeat(32)) as `0x${string}`;
    expect(refundNonce(h, 0n)).toMatch(/^0x[0-9a-f]{64}$/);
    expect(refundNonce(h, 0n)).not.toBe(refundNonce(h, 1n));
    expect(refundNonce(h, 5n)).toBe(refundNonce(h, 5n));
  });
  it("signs a receive authorization to the settler for the refund amount", async () => {
    const { signRefundAuthorization, refundNonce, receiveAuthorizationTypedData } = await import("../src/authorization.js");
    const { privateKeyToAccount } = await import("viem/accounts");
    const { recoverTypedDataAddress } = await import("viem");
    const acct = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
    const nonce = refundNonce(("0x" + "22".repeat(32)) as `0x${string}`, 0n);
    const settler = "0x0000000000000000000000000000000000001234" as const;
    const tctx = { chainId: 1874, token: "0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7" as const };
    const a = await signRefundAuthorization(acct, { settler, amount: 5_000n, nonce, validBefore: 2_000_000_000n }, tctx);
    expect(a.from).toBe(acct.address);
    expect([27, 28]).toContain(a.v);
    // Same shape as a payment authorization, so the token accepts it the same way.
    const typed = receiveAuthorizationTypedData({ from: acct.address, settler, invoice: { amount: 5_000n, dueDate: 0n, expiry: 2_000_000_000n }, invoiceHash: nonce, mode: "now" }, tctx);
    const sig = (`0x${a.r.slice(2)}${a.s.slice(2)}${a.v.toString(16)}`) as `0x${string}`;
    expect(await recoverTypedDataAddress({ ...typed, signature: sig })).toBe(acct.address);
  });
});
