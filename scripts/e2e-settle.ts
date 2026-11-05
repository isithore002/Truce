// Checkpoint C1: settle ONE real invoice in the track USDT on Whitechain Sepolia, then show that the
// same buyer authorization cannot be used with a swapped payout. It drives the real chain module
// (apps/server/src/chain/viem.ts), so a pass here also exercises the relayer code path.
//
//   npm run e2e                    full run: attack attempt (rejected, nothing sent), then the real payment
//   npm run e2e -- --attack-only   only the swapped-payout attempt (sends nothing)
//
// Env (see .env.example): MERCHANT_PK, PAYER_PK, RELAYER_PK. Optional: PAYOUT_ADDRESS, AMOUNT_UNITS,
// SETTLER_ADDRESS, RPC_URL. Throwaway testnet keys only. Keys are never printed.
// The script refuses to run unless the RPC reports chain id 1874.

import { randomBytes } from "node:crypto";
import { createPublicClient, defineChain, formatUnits, getAddress, hashDomain, http, pad, toHex, type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import {
  TRACK_USDT,
  domainHash,
  invoiceHash,
  memoHash,
  signInvoice,
  signReceiveAuthorization,
  tokenDomain,
  type Invoice,
  type InvoiceDetails,
  type InvoiceDoc,
} from "@truce/invoice-lib";
import { loadChainConfig, settlerAbi } from "../apps/server/src/chain/config.ts";
import { ChainError } from "../apps/server/src/chain/errors.ts";
import { ViemChain } from "../apps/server/src/chain/viem.ts";

const CHAIN_ID = 1874;
const ATTACK_ONLY = process.argv.includes("--attack-only");

const erc20Abi = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "DOMAIN_SEPARATOR", stateMutability: "view", inputs: [], outputs: [{ type: "bytes32" }] },
] as const;

function need(name: string): Hex {
  const v = process.env[name];
  if (!v || !/^0x[0-9a-fA-F]{64}$/.test(v)) throw new Error(`${name} is missing or not a 32-byte hex private key (see .env.example)`);
  return v as Hex;
}

const usdt = (n: bigint) => `${formatUnits(n, 6)} USDT`;

async function main() {
  const cfg = loadChainConfig();
  const chain = new ViemChain(cfg);
  const pub = createPublicClient({
    chain: defineChain({ id: CHAIN_ID, name: "Whitechain Sepolia", nativeCurrency: { name: "WBT", symbol: "WBT", decimals: 18 }, rpcUrls: { default: { http: [cfg.rpcUrl] } } }),
    transport: http(cfg.rpcUrl),
  });
  const cid = await pub.getChainId();
  if (cid !== CHAIN_ID) throw new Error(`Refusing to run: RPC chain id is ${cid}, expected ${CHAIN_ID} (Whitechain Sepolia).`);

  const merchant = privateKeyToAccount(need("MERCHANT_PK"));
  const payer = privateKeyToAccount(need("PAYER_PK"));
  const relayer = privateKeyToAccount(cfg.relayerKey);
  const settler = cfg.settler;
  const payout = getAddress(process.env.PAYOUT_ADDRESS || merchant.address);
  const amount = BigInt(process.env.AMOUNT_UNITS || "10000"); // 0.01 USDT, so reruns are cheap

  console.log(`Chain ${cid} OK via ${cfg.rpcUrl}`);
  console.log(`InvoiceSettler ${settler}`);
  console.log(`merchant ${merchant.address} | payout ${payout} | buyer ${payer.address} | relayer ${relayer.address}\n`);

  // Pre-flight: is there anything to pay with, and anything to pay gas with?
  const [buyerBal, relayerWbt, tokenSep] = await Promise.all([
    pub.readContract({ address: TRACK_USDT, abi: erc20Abi, functionName: "balanceOf", args: [payer.address] }),
    pub.getBalance({ address: relayer.address }),
    pub.readContract({ address: TRACK_USDT, abi: erc20Abi, functionName: "DOMAIN_SEPARATOR" }),
  ]);
  const localSep = hashDomain({
    domain: { ...tokenDomain({ chainId: CHAIN_ID, token: TRACK_USDT }), chainId: BigInt(CHAIN_ID) },
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
    token: TRACK_USDT,
    amount,
    dueDate: now,
    expiry: now + 86_400n,
    payer: "0x0000000000000000000000000000000000000000",
    domainHash: domainHash("northlight-design.example"),
    memoHash: memoHash(details),
  };
  const ctx = { chainId: CHAIN_ID, verifyingContract: settler };
  const hash = invoiceHash(invoice, ctx);
  const doc: InvoiceDoc = { version: 1, invoice, signature: await signInvoice(merchant, invoice, ctx), domain: "northlight-design.example", details };

  // The deployed contract must agree with the TypeScript library about the hash.
  const onchainHash = (await pub.readContract({ address: settler, abi: settlerAbi, functionName: "hashInvoice", args: [invoice] })) as Hex;
  if (onchainHash !== hash) throw new Error(`Hash mismatch: library ${hash} vs contract ${onchainHash}. Wrong contract address or stale ABI.`);
  console.log(`invoice hash ${hash} (matches the contract)\n`);

  // The buyer signs ONE EIP-3009 authorization: to = InvoiceSettler, nonce = invoice hash.
  const auth = await signReceiveAuthorization(payer, { settler, invoice, invoiceHash: hash, mode: "now" }, { chainId: CHAIN_ID, token: TRACK_USDT });

  // ---- 1. The attack: same buyer authorization, payout swapped to the attacker ----
  const attacker: Address = privateKeyToAccount(generatePrivateKey()).address;
  console.log(`ATTACK: swap the payout to ${attacker} and settle with the buyer's authorization...`);
  try {
    await chain.settle({ ...doc, invoice: { ...invoice, payout: attacker } }, auth);
    throw new Error("UNEXPECTED: the swapped-payout settlement was sent. Do not continue.");
  } catch (e) {
    if (!(e instanceof ChainError)) throw e;
    console.log(`  rejected on chain (simulation): ${e.code}${e.details?.contractError ? ` / ${String(e.details.contractError)}` : ""}. Nothing was sent.\n`);
  }

  if (ATTACK_ONLY) return;

  // ---- 2. The honest payment ----
  const payoutBefore = await pub.readContract({ address: TRACK_USDT, abi: erc20Abi, functionName: "balanceOf", args: [payout] });
  console.log("PAY: the relayer simulates, then sends settle() and pays the gas in WBT...");
  const { txHash } = await chain.settle(doc, auth);
  console.log(`  sent ${txHash}`);
  const receipt = await pub.getTransactionReceipt({ hash: txHash });

  const status = await chain.onchainStatus(hash);
  const [rPayer, rPayout, rAmount, , rPaidAt] = (await pub.readContract({ address: settler, abi: settlerAbi, functionName: "payments", args: [hash] })) as [Address, Address, bigint, bigint, bigint];
  const payoutAfter = await pub.readContract({ address: TRACK_USDT, abi: erc20Abi, functionName: "balanceOf", args: [payout] });

  console.log(`\nSETTLED in block ${receipt.blockNumber}`);
  console.log(`  transaction  ${cfg.explorerBase}/tx/${txHash}`);
  console.log(`  contract     ${cfg.explorerBase}/address/${settler}`);
  console.log(`  chain module reports paid=${status.paid}${status.txHash ? `, tx ${status.txHash}` : ""}`);
  console.log(`  payments(hash): payer ${rPayer} | payout ${rPayout} | ${usdt(rAmount)} | paidAt ${rPaidAt}`);
  console.log(`  payout wallet balance: ${usdt(payoutBefore)} -> ${usdt(payoutAfter)} (change ${usdt(payoutAfter - payoutBefore)})`);
  if (!status.paid || payoutAfter - payoutBefore !== amount || rPayout !== payout) throw new Error("Post-conditions failed: payout did not receive exactly the signed amount.");
  console.log("\nOK: paid exactly the signed amount to exactly the signed payout.");
}

main().catch((e) => {
  console.error(`\nFAILED: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
