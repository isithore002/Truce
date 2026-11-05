import type { FastifyInstance } from "fastify";
import type { Address, Hex } from "viem";
import { invoiceHash, parseInvoiceDoc, recoverMerchant, toWire, verifyInvoiceDoc } from "@truce/invoice-lib";
import { RateLimiter } from "../chain/limits.js";
import type { InvoiceRecord, InvoiceStatus } from "../shared/store.js";
import type { AppContext } from "./app.js";
import { ApiError } from "./errors.js";
import { AddressParam, HashParam, VerifyQuery } from "./schemas.js";

/** An unpaid invoice past its expiry reads as EXPIRED (computed on read, nothing is rewritten). */
export function effectiveStatus(rec: InvoiceRecord, now: number): InvoiceStatus {
  const expired = BigInt(rec.doc.invoice.expiry) < BigInt(now);
  return expired && (rec.status === "ISSUED" || rec.status === "SCHEDULED_OK" || rec.status === "AT_RISK" || rec.status === "FAILED") ? "EXPIRED" : rec.status;
}

export function summarize(rec: InvoiceRecord, now: number) {
  const inv = rec.doc.invoice;
  return {
    hash: rec.hash,
    invoiceId: inv.invoiceId,
    merchantName: rec.doc.details.merchantName,
    clientName: rec.doc.details.clientName,
    amount: inv.amount,
    token: inv.token,
    dueDate: inv.dueDate,
    expiry: inv.expiry,
    status: effectiveStatus(rec, now),
    txHash: rec.payment?.txHash,
    paidAt: rec.payment?.paidAt,
    createdAt: rec.createdAt,
    example: rec.doc.details.example,
  };
}

export function registerRoutes(app: FastifyInstance, ctx: AppContext) {
  const { chain, store } = ctx;
  // Verifying makes the server fetch a merchant domain, so it is rate limited per caller.
  const verifyLimiter = new RateLimiter(60, 60_000);

  app.get("/api/config", async () => ({ ...chain.config, exampleMode: ctx.exampleMode }));

  app.post("/api/invoices", async (req, reply) => {
    const parsed = parseInvoiceDoc(req.body);
    if (!parsed.ok) throw new ApiError("INVALID_DOCUMENT", parsed.error);
    const doc = parsed.value;
    const inv = doc.invoice;
    const signingCtx = { chainId: chain.config.chainId, verifyingContract: chain.config.settler };

    let signer: Address | undefined;
    try {
      signer = await recoverMerchant(inv, doc.signature, signingCtx);
    } catch {
      signer = undefined;
    }
    if (!signer || signer.toLowerCase() !== inv.merchant.toLowerCase()) {
      throw new ApiError("SIGNATURE_INVALID", "The signature does not match the merchant wallet in this invoice.");
    }
    if (!chain.config.tokens.some((t) => t.toLowerCase() === inv.token.toLowerCase())) {
      throw new ApiError("TOKEN_NOT_ALLOWED", "The payment contract does not accept this token.");
    }
    const now = ctx.now();
    if (BigInt(now) > inv.expiry) throw new ApiError("EXPIRED", "This invoice has already expired.");

    const hash = invoiceHash(inv, signingCtx);
    const created = await store.create({
      hash,
      doc: toWire(doc),
      status: "ISSUED",
      events: [{ at: now, type: "created" }],
      createdAt: now,
    });
    if (!created) throw new ApiError("DUPLICATE", "An invoice with this id and content already exists.", { hash });
    return reply.status(201).send({ hash, link: `${ctx.publicBaseUrl}/pay/${hash}` });
  });

  app.get("/api/invoices/:hash", async (req) => {
    const { hash } = HashParam.parse(req.params);
    const rec = await store.get(hash);
    if (!rec) throw new ApiError("NOT_FOUND", "No invoice with this hash.");
    return {
      doc: rec.doc,
      status: effectiveStatus(rec, ctx.now()),
      health: rec.health,
      payment: rec.payment,
      schedule: rec.auth && rec.auth.mode === "due" ? { validAfter: rec.auth.validAfter, validBefore: rec.auth.validBefore } : undefined,
      events: rec.events,
    };
  });

  /** The ten checks plus the on-chain status. A document that fails the checks is a normal 200 with result FAIL. */
  async function runVerify(rawDoc: unknown, buyer: string | undefined) {
    const out = await verifyInvoiceDoc(rawDoc, {
      chainId: chain.config.chainId,
      settler: chain.config.settler,
      allowedTokens: chain.config.tokens,
      now: BigInt(ctx.now()),
      resolveDomain: ctx.resolveDomain,
      buyer: buyer as Address | undefined,
    });
    let onchain: { paid: boolean; payer?: Address; refunded?: string; txHash?: string; unavailable?: boolean } = { paid: false };
    if (out.invoiceHash) {
      try {
        const st = await chain.onchainStatus(out.invoiceHash);
        onchain = { paid: st.paid, payer: st.payer, refunded: st.refunded.toString(), txHash: st.txHash };
      } catch {
        onchain = { paid: false, unavailable: true };
      }
    }
    return { result: out.result, checks: out.checks, invoiceHash: out.invoiceHash, domainFile: out.domainFile, onchain };
  }

  app.get("/api/verify", async (req) => {
    verifyLimiter.check(req.ip);
    const q = VerifyQuery.parse(req.query);
    if (!q.hash) throw new ApiError("INVALID_DOCUMENT", "Provide ?hash=, or POST the invoice document.");
    const rec = await store.get(q.hash.toLowerCase() as Hex);
    if (!rec) throw new ApiError("NOT_FOUND", "No invoice with this hash.");
    const result = await runVerify(rec.doc, q.buyer);
    // If someone paid straight on chain, bring our record in line.
    if (result.onchain.paid && rec.status !== "PAID") {
      await store.update(rec.hash, (r) => {
        r.status = "PAID";
        r.payment = { payer: result.onchain.payer as Address, paidAt: ctx.now(), txHash: result.onchain.txHash as Hex | undefined };
        r.events.push({ at: ctx.now(), type: "paid_onchain", txHash: result.onchain.txHash as Hex | undefined });
      });
    }
    return result;
  });

  app.post("/api/verify", async (req) => {
    verifyLimiter.check(req.ip);
    const q = VerifyQuery.parse(req.query);
    return runVerify(req.body, q.buyer);
  });

  app.get("/api/merchants/:address/invoices", async (req) => {
    const { address } = AddressParam.parse(req.params);
    const items = (await store.listByMerchant(address)).map((r) => summarize(r, ctx.now()));
    return { items };
  });
}

