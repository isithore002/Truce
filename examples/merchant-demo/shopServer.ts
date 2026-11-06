// The fictional studio's website: one page, one button, one JSON route. Nothing in this file talks to Truce.
// The Truce integration is the createInvoice call in shop.ts, which is passed in as `makeInvoice`.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

export interface Product {
  id: string;
  name: string;
  /** USDT, as a decimal string. */
  price: string;
}

/** The studio's price list lives here on the server: the browser only sends an id, never a price. */
export const PRODUCTS: Product[] = [
  { id: "brand", name: "Brand identity", price: "0.01" },
  { id: "logo", name: "Logo refresh", price: "0.02" },
  { id: "audit", name: "Website audit", price: "0.05" },
];

export type MakeInvoice = (product: Product, clientName: string) => Promise<{ link: string; hash: string }>;

const MAX_BODY = 4096;

function readJson(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error("Request too large"));
        req.destroy();
      } else chunks.push(c);
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "null"));
      } catch {
        reject(new Error("Body is not valid JSON"));
      }
    });
    req.on("error", reject);
  });
}

function send(res: ServerResponse, status: number, body: unknown, type = "application/json") {
  res.writeHead(status, { "content-type": `${type}; charset=utf-8`, "cache-control": "no-store" });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
}

/** The only HTML the shop serves. Text is escaped through textContent; no user input is placed into markup. */
export function page(): string {
  const cards = PRODUCTS.map(
    (p) => `<article class="card"><h3>${p.name}</h3><p class="price">${p.price} USDT</p><button data-id="${p.id}">Invoice me</button></article>`,
  ).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Northlight Design Studio (EXAMPLE DATA)</title>
<style>
body{font:16px/1.5 system-ui,sans-serif;margin:0;background:#f4f1ea;color:#16302e}
.banner{background:#f2d36b;padding:8px 16px;text-align:center;font-weight:600}
main{max-width:760px;margin:0 auto;padding:32px 20px}
h1{margin:0 0 4px}.sub{color:#4b6663;margin:0 0 24px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px}
.card{background:#fff;border-radius:16px;padding:18px;box-shadow:0 1px 3px #0001}
.price{font-size:1.3rem;margin:.2rem 0 1rem}
label{display:block;margin:0 0 20px}input{font:inherit;padding:10px 12px;border:1px solid #b9c7c4;border-radius:10px;width:100%;box-sizing:border-box;max-width:320px}
button{font:inherit;background:#0f4c47;color:#fff;border:0;border-radius:999px;padding:10px 18px;cursor:pointer}
button:disabled{opacity:.5;cursor:wait}
#out{margin-top:24px;padding:16px;border-radius:12px;background:#e1efe6;display:none;overflow-wrap:anywhere}
#out.err{background:#f6dcd8}
small{color:#4b6663}
</style></head><body>
<div class="banner">EXAMPLE DATA &middot; a fictional studio on a test network</div>
<main>
<h1>Northlight Design Studio</h1>
<p class="sub">Pick a service and we send you an invoice you can check before you pay. This page is the studio's own site; the invoice is created by its server in a few lines of code.</p>
<label>Your company name<br><input id="client" value="Beta Labs" maxlength="60" autocomplete="off"></label>
<div class="grid">${cards}</div>
<div id="out" role="status" aria-live="polite"></div>
<p><small>Amounts are scaled down for the test network. Nothing here is a real sale.</small></p>
</main>
<script>
const out = document.getElementById('out');
document.querySelectorAll('button[data-id]').forEach((b) => b.addEventListener('click', async () => {
  b.disabled = true; out.style.display = 'block'; out.className = ''; out.textContent = 'Creating your invoice...';
  try {
    const r = await fetch('/invoice', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ productId: b.dataset.id, clientName: document.getElementById('client').value }) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'Something went wrong');
    out.textContent = 'Your invoice is ready: ';
    const a = document.createElement('a'); a.href = j.link; a.target = '_blank'; a.rel = 'noreferrer'; a.textContent = 'open it and check it before paying';
    out.append(a);
  } catch (e) { out.className = 'err'; out.textContent = e.message; }
  finally { b.disabled = false; }
}));
</script></body></html>`;
}

/** An HTTP server for the shop. `makeInvoice` is the only thing that knows about Truce. */
export function createShop(makeInvoice: MakeInvoice): Server {
  return createServer(async (req, res) => {
    const url = (req.url ?? "/").split("?")[0];
    if (req.method === "GET" && url === "/") return send(res, 200, page(), "text/html");
    if (req.method === "POST" && url === "/invoice") {
      let body: { productId?: unknown; clientName?: unknown } | null;
      try {
        body = (await readJson(req)) as typeof body;
      } catch (e) {
        return send(res, 400, { error: e instanceof Error ? e.message : "Bad request" });
      }
      const product = PRODUCTS.find((p) => p.id === body?.productId);
      if (!product) return send(res, 400, { error: "Unknown service" });
      const clientName = typeof body?.clientName === "string" ? body.clientName.trim() : "";
      if (!clientName || clientName.length > 60) return send(res, 400, { error: "Enter your company name (up to 60 characters)" });
      try {
        const { link, hash } = await makeInvoice(product, clientName);
        return send(res, 200, { link, hash });
      } catch (e) {
        return send(res, 502, { error: `Could not create the invoice: ${e instanceof Error ? e.message : "unknown error"}` });
      }
    }
    return send(res, 404, { error: "Not found" });
  });
}
