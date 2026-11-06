import { describe, expect, it } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { setup } from "../../apps/server/test/appSetup.js";
import { PAYOUT, T0, merchant } from "../../apps/server/test/helpers.js";
import { createInvoice, invoiceStatus, TruceError } from "../src/index.js";

/** Routes the SDK's fetch calls into the server app without opening a port. */
function viaApp(app: ReturnType<typeof setup>["app"]): typeof fetch {
  return (async (url: string, init?: RequestInit) => {
    const res = await app.inject({ method: (init?.method ?? "GET") as "GET" | "POST", url: new URL(url).pathname, payload: init?.body ? JSON.parse(init.body as string) : undefined });
    return { ok: res.statusCode < 400, status: res.statusCode, json: async () => res.json() } as Response;
  }) as typeof fetch;
}

const opts = {
  apiBase: "http://truce.test/",
  domain: "northlight-design.example",
  merchantName: "Northlight Design Studio",
  clientName: "Beta Labs",
  lineItems: [{ description: "Brand identity (EXAMPLE DATA)", quantity: "1", unitPrice: "1250" }],
  example: true,
  payout: PAYOUT,
  now: Number(T0),
};

describe("createInvoice", () => {
  it("creates a signed invoice the server accepts and returns the pay link and hash", async () => {
    const { app } = setup();
    const out = await createInvoice({ ...opts, signer: merchant as never, fetch: viaApp(app) });
    expect(out.hash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(out.link).toBe(`http://localhost:5173/pay/${out.hash}`);
    expect(await invoiceStatus("http://truce.test", out.hash, viaApp(app))).toMatchObject({ status: "ISSUED" });
    const verify = await app.inject({ method: "GET", url: `/api/verify?hash=${out.hash}` });
    expect(verify.json().result).toBe("PASS");
  });

  it("registers a stranger-signed invoice but verification FAILS for the buyer", async () => {
    const { app } = setup();
    const stranger = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
    const out = await createInvoice({ ...opts, signer: stranger as never, fetch: viaApp(app) });
    // The server accepts any correctly signed invoice; the buyer-facing check is what fails.
    const verify = await app.inject({ method: "GET", url: `/api/verify?hash=${out.hash}` });
    expect(verify.json().result).toBe("FAIL");
  });

  it("rejects bad input before any request is made, and reports an unreachable server", async () => {
    const { app } = setup();
    await expect(createInvoice({ ...opts, lineItems: [], signer: merchant as never, fetch: viaApp(app) })).rejects.toThrow(/line item/);
    const down = (async () => { throw new TypeError("fetch failed"); }) as unknown as typeof fetch;
    await expect(createInvoice({ ...opts, signer: merchant as never, fetch: down })).rejects.toBeInstanceOf(TruceError);
  });

  it("maps a server error to a TruceError with its code", async () => {
    const { app } = setup();
    const f = viaApp(app);
    await createInvoice({ ...opts, invoiceId: "0x" + "ab".repeat(32) as `0x${string}`, signer: merchant as never, fetch: f });
    const again = createInvoice({ ...opts, invoiceId: "0x" + "ab".repeat(32) as `0x${string}`, signer: merchant as never, fetch: f });
    await expect(again).rejects.toMatchObject({ code: "DUPLICATE" });
  });
});
