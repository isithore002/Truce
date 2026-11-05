// Checkpoint C1: settle ONE real invoice in the track USDT on Whitechain Sepolia, then show that the
// same buyer authorization cannot be used with a swapped payout.
//
//   npm run e2e                 full run: attack attempt (simulated, nothing sent), then the real payment
//   npm run e2e -- --attack-only   only the swapped-payout attempt (sends nothing)
//
// Env (see .env.example): MERCHANT_PK, PAYER_PK, RELAYER_PK. Optional: PAYOUT_ADDRESS, AMOUNT_UNITS,
// SETTLER_ADDRESS, RPC_URL. Throwaway testnet keys only. Keys are never printed.
// The script refuses to run unless the RPC reports chain id 1874.

import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import {
  BaseError,
  ContractFunctionRevertedError,
  createPublicClient,
  createWalletClient,
  defineChain,
  formatUnits,
  getAddress,
  hashDomain,
  pad,
  parseEventLogs,
  parseSignature,
  http,
  toHex,
  type Abi,
  type Address,
  type Hex,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { domainHash, invoiceHash, memoHash, signInvoice, type Invoice, type InvoiceDetails } from "@truce/invoice-lib";

const CHAIN_ID = 1874;
const RPC = process.env.RPC_URL || "https://rpc.testnet.whitechain.io";
const EXPLORER = "https://explorer.testnet.whitechain.io";
const TOKEN: Address = getAddress("0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7"); // track USDT
const ATTACK_ONLY = process.argv.includes("--attack-only");

const root = new URL("..", import.meta.url);
const settlerAbi = JSON.parse(readFileSync(new URL("contracts/abi/InvoiceSettler.json", root), "utf8")) as Abi;

const chain = defineChain({
  id: CHAIN_ID,
  name: "Whitechain Sepolia",
  nativeCurrency: { name: "WBT", symbol: "WBT", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
});
const pub = createPublicClient({ chain, transport: http(RPC) });

const erc20Abi = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "DOMAIN_SEPARATOR", stateMutability: "view", inputs: [], outputs: [{ type: "bytes32" }] },
] as const;

const RECEIVE_TYPES = {
  ReceiveWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;

function need(name: string): Hex {
  const v = process.env[name];
  if (!v || !/^0x[0-9a-fA-F]{64}$/.test(v)) throw new Error(`${name} is missing or not a 32-byte hex private key (see .env.example)`);
  return v as Hex;
}

function settlerAddress(): Address {
  if (process.env.SETTLER_ADDRESS) return getAddress(process.env.SETTLER_ADDRESS);
  const file = new URL("deployments/whitechain-sepolia.json", root);
  if (!existsSync(file)) throw new Error("No SETTLER_ADDRESS and no deployments/whitechain-sepolia.json: deploy first.");
  return getAddress(JSON.parse(readFileSync(file, "utf8")).address);
}

function revertName(e: unknown): string {
  if (e instanceof BaseError) {
    const r = e.walk((x) => x instanceof ContractFunctionRevertedError);
    if (r instanceof ContractFunctionRevertedError) return r.data?.errorName ?? r.reason ?? r.shortMessage;
    return e.shortMessage;
  }
  return String(e);
}

const usdt = (n: bigint) => `${formatUnits(n, 6)} USDT`;

async function main() {
  const cid = await pub.getChainId();
  if (cid !== CHAIN_ID) throw new Error(`Refusing to run: RPC chain id is ${cid}, expected ${CHAIN_ID} (Whitechain Sepolia).`);

  const merchant = privateKeyToAccount(need("MERCHANT_PK"));
  const payer = privateKeyToAccount(need("PAYER_PK"));
  const relayer = privateKeyToAccount(need("RELAYER_PK"));
  const settler = settlerAddress();
  const payout = getAddress(process.env.PAYOUT_ADDRESS || merchant.address);
  const amount = BigInt(process.env.AMOUNT_UNITS || "10000"); // 0.01 USDT, so reruns are cheap

  console.log(`Chain ${cid} OK via ${RPC}`);
  console.log(`InvoiceSettler ${settler}`);
  console.log(`merchant ${merchant.address} | payout ${payout} | buyer ${payer.address} | relayer ${relayer.address}\n`);

  // Pre-flight: is there anything to pay with, and anything to pay gas with?
  const [buyerBal, relayerWbt, tokenSep] = await Promise.all([
    pub.readContract({ address: TOKEN, abi: erc20Abi, functionName: "balanceOf", args: [payer.address] }),
    pub.getBalance({ address: relayer.address }),
    pub.readContract({ address: TOKEN, abi: erc20Abi, functionName: "DOMAIN_SEPARATOR" }),
  ]);
  const tokenDomain = { name: "Tether USD", version: "1", chainId: CHAIN_ID, verifyingContract: TOKEN } as const;
  const localSep = hashDomain({
    domain: tokenDomain,
    types: {
      EIP712Domain: [
        { name: "name", type: "string" },
        { name: "version", type: "string" },
        { name: "chainId", type: "uint256" },
        { name: "verifyingContract", type: "address" },
      ],
    },
  });
  if (localSep.toLowerCase() !== tokenSep.toLowerCase()) throw new Error("Token EIP-712 domain mismatch: our domain does not match the token's DOMAIN_SEPARATOR.");
  console.log(`buyer balance ${usdt(buyerBal)} | relayer ${formatUnits(relayerWbt, 18)} WBT`);
  if (buyerBal < amount) throw new Error(`Buyer needs at least ${usdt(amount)} (swap WBT to USDT on YetiTrade).`);
  if (relayerWbt === 0n && !ATTACK_ONLY) throw new Error("Relayer has no WBT for gas (faucet: https://faucet.testnet.whitechain.io).");

  // The merchant builds and signs the invoice (example data, clearly labelled).
  const details: InvoiceDetails = {
    merchantName: "Northlight Design Studio",
    clientName: "Beta Labs",
    lineItems: [{ description: "Brand identity (EXAMPLE DATA)", quantity: "1", unitPrice: amount.toString() }],
    notes: "EXAMPLE DATA. Net 30, time-compressed for the demo.",
    example: true,
  };
  const now = BigInt(Math.floor(Date.now() / 1000));
  const invoice: Invoice = {
    invoiceId: pad(toHex(randomBytes(16)), { size: 32 }),
    merchant: merchant.address,
    payout,
    token: TOKEN,
    amount,
    dueDate: now,
    expiry: now + 86_400n,
    payer: "0x0000000000000000000000000000000000000000",
    domainHash: domainHash("northlight-design.example"),
    memoHash: memoHash(details),
  };
  const ctx = { chainId: CHAIN_ID, verifyingContract: settler };
  const hash = invoiceHash(invoice, ctx);
  const merchantSig = await signInvoice(merchant, invoice, ctx);

  // The deployed contract must agree with the TypeScript library about the hash.
  const onchainHash = (await pub.readContract({ address: settler, abi: settlerAbi, functionName: "hashInvoice", args: [invoice] })) as Hex;
  if (onchainHash !== hash) throw new Error(`Hash mismatch: library ${hash} vs contract ${onchainHash}. Wrong contract address or stale ABI.`);
  console.log(`invoice hash ${hash} (matches the contract)\n`);

  // The buyer signs ONE EIP-3009 authorization: to = InvoiceSettler, nonce = invoice hash.
  const message = { from: payer.address, to: settler, value: amount, validAfter: 0n, validBefore: invoice.expiry, nonce: hash };
  const sig = parseSignature(await payer.signTypedData({ domain: tokenDomain, types: RECEIVE_TYPES, primaryType: "ReceiveWithAuthorization", message }));
  const auth = { from: payer.address, validAfter: 0n, validBefore: invoice.expiry, v: Number(sig.v ?? 27n + BigInt(sig.yParity)), r: sig.r, s: sig.s };

  // ---- 1. The attack: same buyer authorization, payout swapped to the attacker ----
  const attacker = privateKeyToAccount(generatePrivateKey()).address;
  const swapped: Invoice = { ...invoice, payout: attacker };
  console.log(`ATTACK: swap the payout to ${attacker} and settle with the buyer's authorization...`);
  try {
    await pub.simulateContract({ account: relayer, address: settler, abi: settlerAbi, functionName: "settle", args: [swapped, merchantSig, auth] });
    throw new Error("UNEXPECTED: the swapped-payout settlement would succeed. Do not continue.");
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("UNEXPECTED")) throw e;
    console.log(`  rejected on chain (simulation): ${revertName(e)}. Nothing was sent.\n`);
  }

  if (ATTACK_ONLY) return;

  // ---- 2. The honest payment ----
  const payoutBefore = await pub.readContract({ address: TOKEN, abi: erc20Abi, functionName: "balanceOf", args: [payout] });
  console.log("PAY: simulate, then the relayer sends settle() and pays the gas in WBT...");
  const { request } = await pub.simulateContract({ account: relayer, address: settler, abi: settlerAbi, functionName: "settle", args: [invoice, merchantSig, auth] });
  const wallet = createWalletClient({ account: relayer, chain, transport: http(RPC) });
  const txHash = await wallet.writeContract(request);
  console.log(`  sent ${txHash}`);
  const receipt = await pub.waitForTransactionReceipt({ hash: txHash, timeout: 90_000 });
  if (receipt.status !== "success") throw new Error(`settle reverted on chain: ${EXPLORER}/tx/${txHash}`);

  const paid = parseEventLogs({ abi: settlerAbi, eventName: "InvoicePaid", logs: receipt.logs });
  const [rPayer, rPayout, rAmount, , rPaidAt] = (await pub.readContract({ address: settler, abi: settlerAbi, functionName: "payments", args: [hash] })) as [Address, Address, bigint, bigint, bigint];
  const payoutAfter = await pub.readContract({ address: TOKEN, abi: erc20Abi, functionName: "balanceOf", args: [payout] });

  console.log(`\nSETTLED in block ${receipt.blockNumber}`);
  console.log(`  transaction  ${EXPLORER}/tx/${txHash}`);
  console.log(`  contract     ${EXPLORER}/address/${settler}`);
  console.log(`  InvoicePaid events in receipt: ${paid.length}`);
  console.log(`  payments(hash): payer ${rPayer} | payout ${rPayout} | ${usdt(rAmount)} | paidAt ${rPaidAt}`);
  console.log(`  payout wallet balance: ${usdt(payoutBefore)} -> ${usdt(payoutAfter)} (change ${usdt(payoutAfter - payoutBefore)})`);
  if (payoutAfter - payoutBefore !== amount || rPayout !== payout) throw new Error("Post-conditions failed: payout did not receive exactly the signed amount.");
  console.log("\nOK: paid exactly the signed amount to exactly the signed payout.");
}

main().catch((e) => {
  console.error(`\nFAILED: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
