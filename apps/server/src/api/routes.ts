import type { FastifyInstance } from "fastify";
import type { Address, Hex } from "viem";
import { invoiceHash, parseInvoiceDoc, recoverMerchant, toWire, verifyInvoiceDoc } from "@truce/invoice-lib";
import { RateLimiter } from "../chain/limits.js";
import type { AppContext } from "./app.js";
import { ApiError } from "./errors.js";
import { ChainError } from "../chain/errors.js";
import { invoicesToCsv } from "./csv.js";
import { AddressParam, AuthorizeBody, HashParam, VerifyQuery } from "./schemas.js";
import { effectiveStatus, summarize } from "./status.js";

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

  app.get("/api/merchants/:address/export.csv", async (req, reply) => {
    const { address } = AddressParam.parse(req.params);
    const csv = invoicesToCsv(await store.listByMerchant(address), { now: ctx.now(), explorerBase: chain.config.explorerBase });
    return reply
      .header("content-type", "text/csv; charset=utf-8")
      .header("content-disposition", `attachment; filename="truce-invoices-${address.slice(2, 10).toLowerCase()}.csv"`)
      .send(csv);
  });

  // ---- pay now: the buyer signed once; the relayer submits and pays the gas ----
  const settling = new Set<string>();

  app.post("/api/invoices/:hash/authorize", async (req, reply) => {
    const { hash } = HashParam.parse(req.params);
    const body = AuthorizeBody.parse(req.body);
    const rec = await store.get(hash);
    if (!rec) throw new ApiError("NOT_FOUND", "No invoice with this hash.");
    if (body.mode === "due") {
      throw new ApiError("NOT_IMPLEMENTED", "Paying on the due date is not available yet. Please pay now instead.");
    }
    const status = effectiveStatus(rec, ctx.now());
    if (status === "PAID") throw new ApiError("ALREADY_PAID", "This invoice has already been paid.");
    if (status === "EXPIRED") throw new ApiError("EXPIRED", "This invoice has expired and can no longer be paid.", undefined, 410);
    if (settling.has(hash)) throw new ApiError("DUPLICATE", "A payment for this invoice is already in progress.");

    const parsed = parseInvoiceDoc(rec.doc);
    if (!parsed.ok) throw new ApiError("INTERNAL", "The stored invoice is damaged.");
    const auth = { mode: body.mode, from: body.from, validAfter: BigInt(body.validAfter), validBefore: BigInt(body.validBefore), v: body.v, r: body.r as Hex, s: body.s as Hex };

    settling.add(hash);
    await store.update(hash, (r) => {
      r.auth = { ...body, r: body.r as Hex, s: body.s as Hex };
      r.events.push({ at: ctx.now(), type: "authorized", detail: body.from });
    });

    type Outcome = { status: "PAID" | "PENDING"; txHash?: Hex };
    const work: Promise<Outcome> = (async () => {
      try {
        const { txHash } = await chain.settle(parsed.value, auth, { clientKey: req.ip });
        await store.update(hash, (r) => {
          r.status = "PAID";
          r.payment = { payer: auth.from, paidAt: ctx.now(), txHash };
          r.events.push({ at: ctx.now(), type: "paid", txHash });
        });
        return { status: "PAID", txHash };
      } catch (e) {
        if (e instanceof ChainError && e.code === "PENDING") {
          const txHash = e.details?.txHash as Hex | undefined;
          await store.update(hash, (r) => {
            r.events.push({ at: ctx.now(), type: "pending", txHash });
          });
          return { status: "PENDING", txHash };
        }
        const code = e instanceof ChainError ? e.code : "INTERNAL";
        await store.update(hash, (r) => {
          r.events.push({ at: ctx.now(), type: "settle_failed", detail: code });
        });
        throw e;
      } finally {
        settling.delete(hash);
      }
    })();
    work.catch(() => {}); // if we already answered 202, a late failure is only recorded, not re-thrown

    let timer: NodeJS.Timeout | undefined;
    const waited = await Promise.race([
      work,
      new Promise<"timeout">((resolve) => {
        timer = setTimeout(() => resolve("timeout"), ctx.authorizeWaitMs);
      }),
    ]).finally(() => clearTimeout(timer));

    if (waited === "timeout") return reply.status(202).send({ status: "PENDING" });
    return reply.status(waited.status === "PAID" ? 200 : 202).send(waited);
  });

  app.get("/healthz", async (_req, reply) => {
    try {
      const st = await chain.status();
      return {
        ok: true,
        mode: st.mode,
        rpc: { chainId: st.chainId, blockNumber: st.blockNumber?.toString(), lagSeconds: st.lagSeconds },
        relayer: st.relayer ? { address: st.relayer.address, wbtBalance: st.relayer.wbtBalance.toString() } : undefined,
        store: { invoices: await store.count() },
      };
    } catch {
      return reply.status(503).send({ ok: false, error: "The chain RPC is not reachable.", store: { invoices: await store.count() } });
    }
  });
}

