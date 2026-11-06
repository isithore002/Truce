// Live check of capped refunds on Whitechain Sepolia: settle 0.01 USDT, refund 0.005 to the original payer
// (signed by the payout wallet, relayed), then show that a refund above the remaining amount is rejected.
//
//   npm run e2e:refund        needs MERCHANT_PK (= payout wallet), PAYER_PK, RELAYER_PK in .env. Throwaway testnet keys only.
// Spends about 0.01 USDT (0.005 comes back to the buyer) and a little WBT. Refuses any chain but 1874. Keys are never printed.

import { randomBytes } from "node:crypto";
import { createPublicClient, createWalletClient, defineChain, formatUnits, http, pad, toHex, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  TRACK_USDT,
  domainHash,
  invoiceHash,
  memoHash,
  refundNonce,
  signInvoice,
  signReceiveAuthorization,
  signRefundAuthorization,
  type Invoice,
  type InvoiceDetails,
  type InvoiceDoc,
} from "@truce/invoice-lib";
import { loadChainConfig, settlerAbi } from "../apps/server/src/chain/config.ts";
import { ViemChain } from "../apps/server/src/chain/viem.ts";

const erc20Abi = [{ type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: [{ type: "uint256" }] }] as const;
const need = (n: string): Hex => {
  const v = process.env[n];
  if (!v || !/^0x[0-9a-fA-F]{64}$/.test(v)) throw new Error(`${n} is missing or not a 32-byte hex private key`);
  return v as Hex;
};
const usdt = (n: bigint) => `${formatUnits(n, 6)} USDT`;

async function main() {
  const cfg = loadChainConfig();
  const chain = new ViemChain(cfg);
  const net = defineChain({ id: 1874, name: "Whitechain Sepolia", nativeCurrency: { name: "WBT", symbol: "WBT", decimals: 18 }, rpcUrls: { default: { http: [cfg.rpcUrl] } } });
  const pub = createPublicClient({ chain: net, transport: http(cfg.rpcUrl) });
  if ((await pub.getChainId()) !== 1874) throw new Error("Refusing to run: RPC is not chain 1874.");

  const merchant = privateKeyToAccount(need("MERCHANT_PK"));
  const payer = privateKeyToAccount(need("PAYER_PK"));
  const relayer = privateKeyToAccount(cfg.relayerKey);
  const wallet = createWalletClient({ account: relayer, chain: net, transport: http(cfg.rpcUrl) });
  const settler = cfg.settler;
  const amount = 10_000n;
  const refundAmount = 5_000n;
  const bal = (a: Address) => pub.readContract({ address: TRACK_USDT, abi: erc20Abi, functionName: "balanceOf", args: [a] });

  const details: InvoiceDetails = {
    merchantName: "Northlight Design Studio",
    clientName: "Beta Labs",
    lineItems: [{ description: "Brand identity (EXAMPLE DATA)", quantity: "1", unitPrice: amount.toString() }],
    notes: "EXAMPLE DATA. Refund check.",
    example: true,
  };
  const now = BigInt(Math.floor(Date.now() / 1000));
  const invoice: Invoice = {
    invoiceId: pad(toHex(randomBytes(16)), { size: 32 }),
    merchant: merchant.address,
    payout: merchant.address,
    token: TRACK_USDT,
    amount,
    dueDate: now,
    expiry: now + 86_400n,
    payer: "0x0000000000000000000000000000000000000000",
    domainHash: domainHash("northlight-design.example"),
    memoHash: memoHash(details),
  };
  const ctx = { chainId: 1874, verifyingContract: settler };
  const hash = invoiceHash(invoice, ctx);
  const doc: InvoiceDoc = { version: 1, invoice, signature: await signInvoice(merchant, invoice, ctx), domain: "northlight-design.example", details };
  const auth = await signReceiveAuthorization(payer, { settler, invoice, invoiceHash: hash, mode: "now" }, { chainId: 1874, token: TRACK_USDT });

  console.log(`InvoiceSettler ${settler}\nSettling ${usdt(amount)}...`);
  const paid = await chain.settle(doc, auth);
  console.log(`  paid: ${cfg.explorerBase}/tx/${paid.txHash}`);

  const nonce = refundNonce(hash, 0n);
  const onchainNonce = (await pub.readContract({ address: settler, abi: settlerAbi, functionName: "refundNonce", args: [hash] })) as Hex;
  if (nonce !== onchainNonce) throw new Error(`Refund nonce mismatch: library ${nonce} vs contract ${onchainNonce}`);

  const payerBefore = await bal(payer.address);
  const merchantBefore = await bal(merchant.address);
  const m = await signRefundAuthorization(merchant, { settler, amount: refundAmount, nonce, validBefore: now + 3_600n }, { chainId: 1874, token: TRACK_USDT });
  const args = [hash, refundAmount, { from: m.from, validAfter: m.validAfter, validBefore: m.validBefore, v: m.v, r: m.r, s: m.s }] as const;
  console.log(`\nRefunding ${usdt(refundAmount)} to the original payer (signed by the payout wallet, relayed)...`);
  const { request } = await pub.simulateContract({ account: relayer, address: settler, abi: settlerAbi, functionName: "refund", args });
  const refundTx = await wallet.writeContract(request);
  const receipt = await pub.waitForTransactionReceipt({ hash: refundTx });
  if (receipt.status !== "success") throw new Error("Refund transaction reverted.");
  console.log(`  refunded: ${cfg.explorerBase}/tx/${refundTx}`);

  const [payerAfter, merchantAfter, settlerBal, p] = await Promise.all([
    bal(payer.address),
    bal(merchant.address),
    bal(settler),
    pub.readContract({ address: settler, abi: settlerAbi, functionName: "payments", args: [hash] }) as Promise<[Address, Address, bigint, bigint, bigint]>,
  ]);
  console.log(`  buyer ${usdt(payerBefore)} -> ${usdt(payerAfter)} | merchant ${usdt(merchantBefore)} -> ${usdt(merchantAfter)} | contract holds ${usdt(settlerBal)} | refunded so far ${usdt(p[3])}`);
  if (payerAfter - payerBefore !== refundAmount || merchantBefore - merchantAfter !== refundAmount || settlerBal !== 0n || p[3] !== refundAmount) throw new Error("Post-conditions failed.");

  // The cap: only 0.005 is left, so 0.006 must be rejected without sending anything.
  const tooMuch = refundAmount + 1_000n;
  const m2 = await signRefundAuthorization(merchant, { settler, amount: tooMuch, nonce: refundNonce(hash, refundAmount), validBefore: now + 3_600n }, { chainId: 1874, token: TRACK_USDT });
  try {
    await pub.simulateContract({ account: relayer, address: settler, abi: settlerAbi, functionName: "refund", args: [hash, tooMuch, { from: m2.from, validAfter: m2.validAfter, validBefore: m2.validBefore, v: m2.v, r: m2.r, s: m2.s }] });
    throw new Error("UNEXPECTED: an over-cap refund simulated successfully.");
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("UNEXPECTED")) throw e;
    console.log(`\nCAP: a refund of ${usdt(tooMuch)} (more than the ${usdt(amount - refundAmount)} left) is rejected by the contract. Nothing was sent.`);
  }
  console.log("\nOK: refund went only to the original payer, within the cap.");
}

main().catch((e) => {
  console.error(`\nFAILED: ${e instanceof Error ? e.message : e}`);
  const cause = e instanceof Error ? (e.cause as { shortMessage?: string; message?: string } | undefined) : undefined;
  if (cause) console.error(`  cause: ${cause.shortMessage ?? cause.message}`);
  process.exit(1);
});
