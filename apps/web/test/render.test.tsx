import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { InvoiceDocWire } from "@truce/invoice-lib";
import type { InvoiceSummary, VerifyView } from "../src/api";
import { Checklist, ExampleTag, InvoiceCard, InvoiceTable, PinWarning, ScheduleStatus } from "../src/components";
import Merchant from "../src/pages/Merchant";

const ids = [
  "document_valid",
  "signature_valid",
  "domain_file_reachable",
  "merchant_matches_domain_file",
  "payout_in_domain_file",
  "domain_hash_matches",
  "chain_and_token_allowed",
  "not_expired",
  "memo_hash_matches_details",
  "payer_ok",
] as const;

const verdict = (failing: string[] = []): VerifyView => ({
  result: failing.length ? "FAIL" : "PASS",
  checks: ids.map((id) => ({ id, ok: !failing.includes(id), message: failing.includes(id) ? `${id} failed message` : `${id} ok message` })),
  onchain: { paid: false },
});

const doc = {
  version: 1,
  invoice: {
    invoiceId: "0x" + "00".repeat(32),
    merchant: "0x19d47570BA52E058bD6432009b2705F799b851Dc",
    payout: "0x19d47570BA52E058bD6432009b2705F799b851Dc",
    token: "0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7",
    amount: "1250000000",
    dueDate: "1767225600",
    expiry: "1767484800",
    payer: "0x0000000000000000000000000000000000000000",
    domainHash: "0x" + "11".repeat(32),
    memoHash: "0x" + "22".repeat(32),
  },
  signature: "0x" + "33".repeat(65),
  domain: "northlight-design.example",
  details: {
    merchantName: "Northlight Design Studio",
    clientName: "Beta Labs",
    lineItems: [{ description: "Brand identity", quantity: "1", unitPrice: "1250000000" }],
    notes: "Net 30",
    example: true,
  },
} as unknown as InvoiceDocWire;

describe("Checklist", () => {
  it("shows a big PASS with all ten checks ticked", () => {
    const html = renderToStaticMarkup(<Checklist verdict={verdict()} domain="northlight-design.example" />);
    expect(html).toContain("verdict pass");
    expect(html).toContain(">PASS<");
    expect(html).toContain("match what northlight-design.example published and signed");
    expect((html.match(/data-check=/g) ?? []).length).toBe(10);
    expect(html).not.toContain('class="bad"');
  });

  it("shows FAIL, says not to pay, and marks exactly the failing checks", () => {
    const html = renderToStaticMarkup(<Checklist verdict={verdict(["signature_valid", "payout_in_domain_file"])} />);
    expect(html).toContain("verdict fail");
    expect(html).toContain(">FAIL<");
    expect(html).toContain("Do not pay this invoice. 2 checks failed.");
    expect((html.match(/class="bad"/g) ?? []).length).toBe(2);
    expect(html).toContain("Payout wallet is on the merchant&#x27;s list");
    expect(html).toContain("payout_in_domain_file failed message");
  });

  it("uses the singular for one failed check", () => {
    expect(renderToStaticMarkup(<Checklist verdict={verdict(["not_expired"])} />)).toContain("1 check failed.");
  });
});

describe("InvoiceCard", () => {
  it("shows the amount, line items, dates and the full payout wallet", () => {
    const html = renderToStaticMarkup(<InvoiceCard doc={doc} />);
    expect(html).toContain("Northlight Design Studio");
    expect(html).toContain("billed to Beta Labs");
    expect(html).toContain("1,250.00 USDT");
    expect(html).toContain("Brand identity");
    expect(html).toContain("1 Jan 2026");
    expect(html).toContain("0x19d47570BA52E058bD6432009b2705F799b851Dc"); // full address, not shortened
  });

  it("says On receipt when there is no due date", () => {
    const d = { ...doc, invoice: { ...doc.invoice, dueDate: "0" } };
    expect(renderToStaticMarkup(<InvoiceCard doc={d} />)).toContain("On receipt");
  });

  it("escapes hostile text from the invoice instead of rendering it as markup", () => {
    const d = { ...doc, details: { ...doc.details, merchantName: "<img src=x onerror=alert(1)>" } };
    const html = renderToStaticMarkup(<InvoiceCard doc={d} />);
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });
});

describe("ExampleTag", () => {
  it("is labelled EXAMPLE DATA", () => {
    expect(renderToStaticMarkup(<ExampleTag />)).toContain("EXAMPLE DATA");
  });
});

describe("InvoiceTable", () => {
  const item = {
    hash: "0x" + "ab".repeat(32),
    invoiceId: "0x" + "00".repeat(32),
    merchantName: "Northlight Design Studio",
    clientName: "Beta Labs",
    amount: "1250000000",
    token: "0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7",
    dueDate: "0",
    expiry: "1767484800",
    status: "PAID",
    txHash: "0x" + "cd".repeat(32),
    createdAt: 1,
    example: true,
  } as unknown as InvoiceSummary;

  it("shows an empty state", () => {
    expect(renderToStaticMarkup(<InvoiceTable items={[]} explorerBase="https://x" />)).toContain("No invoices yet");
  });
  it("shows status, amount, example tag and an explorer link for a paid invoice", () => {
    const html = renderToStaticMarkup(<InvoiceTable items={[item]} explorerBase="https://explorer.example" />);
    expect(html).toContain("Beta Labs");
    expect(html).toContain("1,250.00 USDT");
    expect(html).toContain("On receipt");
    expect(html).toContain("pill pass");
    expect(html).toContain("EXAMPLE DATA");
    expect(html).toContain(`https://explorer.example/tx/${item.txHash}`);
  });
  it("has no transaction link while unpaid and escapes hostile client names", () => {
    const html = renderToStaticMarkup(<InvoiceTable items={[{ ...item, status: "ISSUED", txHash: undefined, clientName: "<script>x</script>" }]} explorerBase="https://e" />);
    expect(html).not.toContain("Transaction");
    expect(html).toContain("Awaiting payment");
    expect(html).not.toContain("<script>");
  });
});

describe("Merchant page", () => {
  it("asks to connect a wallet first and labels example mode", () => {
    const cfg = { chainId: 1874, settler: "0x0000000000000000000000000000000000001234", tokens: [], explorerBase: "https://e", exampleMode: true } as never;
    const html = renderToStaticMarkup(<Merchant config={cfg} />);
    expect(html).toContain("Connect your signing wallet");
    expect(html).toContain("EXAMPLE DATA");
  });
});

describe("PinWarning", () => {
  const inv = { merchant: "0x19d47570BA52E058bD6432009b2705F799b851Dc", payout: "0x9fc3a0b7d1e5c4e2a8b6f0d3c7e1b5a9d2f4e6c8" };
  const pin = { signingAddress: inv.merchant, payoutAddresses: ["0x19d47570BA52E058bD6432009b2705F799b851Dc"], pinnedAt: 1 };

  it("renders nothing when the wallets are new or unchanged", () => {
    expect(renderToStaticMarkup(<PinWarning pin={{ status: "new" }} domain="a.example" invoice={inv} />)).toBe("");
    expect(renderToStaticMarkup(<PinWarning pin={{ status: "same", pin }} domain="a.example" invoice={inv} />)).toBe("");
  });
  it("shows old and new wallets side by side and asks for confirmation", () => {
    const html = renderToStaticMarkup(
      <PinWarning pin={{ status: "changed", pin, signerChanged: false, payoutChanged: true }} domain="a.example" invoice={inv} ack={false} onAck={() => undefined} />,
    );
    expect(html).toContain("Payee changed since your last payment to a.example");
    expect(html).toContain("The payout wallet differs");
    expect(html).toContain(pin.payoutAddresses[0]);
    expect(html).toContain(inv.payout);
    expect(html).toContain("I have confirmed these new wallets");
  });
  it("names both wallets when both changed, and has no checkbox on the read-only verify page", () => {
    const html = renderToStaticMarkup(<PinWarning pin={{ status: "changed", pin, signerChanged: true, payoutChanged: true }} domain="a.example" invoice={inv} />);
    expect(html).toContain("Both the signing wallet and the payout wallet");
    expect(html).not.toContain("checkbox");
  });
});

describe("ScheduleStatus", () => {
  const due = "1800000600";
  it("shows when the payment will be collected, the health, the snapshot caveat and a cancel button", () => {
    const html = renderToStaticMarkup(<ScheduleStatus status="SCHEDULED_OK" collectAt={due} healthReason="NONE" nowSec={1800000000} canCancel onCancel={() => undefined} />);
    expect(html).toContain("Payment scheduled");
    expect(html).toContain("in 10 minutes");
    expect(html).toContain("snapshot, not a lock");
    expect(html).toContain("commitment, not locked funds");
    expect(html).toContain("Cancel my authorization");
  });
  it("warns when the buyer's balance is too low", () => {
    const html = renderToStaticMarkup(<ScheduleStatus status="AT_RISK" collectAt={due} healthReason="LOW_BALANCE" nowSec={1800000000} />);
    expect(html).toContain("At risk");
    expect(html).toContain("below the invoice amount");
    expect(html).toContain("at-risk");
    expect(html).not.toContain("Cancel my authorization");
  });
  it("shows a clear Failed state and a Cancelled state", () => {
    const failed = renderToStaticMarkup(<ScheduleStatus status="FAILED" healthReason="LOW_BALANCE" nowSec={1} />);
    expect(failed).toContain("Collection failed");
    expect(failed).toContain("Nothing was paid");
    expect(renderToStaticMarkup(<ScheduleStatus status="FAILED" nowSec={1} />)).toContain("payment window ended");
    expect(renderToStaticMarkup(<ScheduleStatus status="CANCELLED" nowSec={1} />)).toContain("can no longer be used");
  });
  it("renders nothing for an ordinary issued invoice", () => {
    expect(renderToStaticMarkup(<ScheduleStatus status="ISSUED" nowSec={1} />)).toBe("");
  });
});

describe("InvoiceTable with scheduled invoices", () => {
  const base = { hash: "0x" + "ab".repeat(32), clientName: "Beta Labs", amount: "1000000", dueDate: "1800000600", status: "AT_RISK", healthReason: "LOW_BALANCE", collectAt: "1800000600", example: false } as unknown as InvoiceSummary;
  it("shows the collection time, the risk reason, and Collect now only after the due time", () => {
    const early = renderToStaticMarkup(<InvoiceTable items={[base]} explorerBase="https://e" nowSec={1800000000} onCollect={() => undefined} />);
    expect(early).toContain("below the invoice amount");
    expect(early).toContain("Collects");
    expect(early).not.toContain("Collect now");
    const late = renderToStaticMarkup(<InvoiceTable items={[base]} explorerBase="https://e" nowSec={1800000700} onCollect={() => undefined} />);
    expect(late).toContain("Collect now");
  });
});
