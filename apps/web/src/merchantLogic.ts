import type { Address } from "viem";
import { buildDomainFile, buildInvoice, parseUsdt, type InvoiceInput } from "@truce/invoice-lib";

export interface LineForm {
  description: string;
  quantity: string;
  unitPrice: string;
}

export interface InvoiceForm {
  clientName: string;
  lines: LineForm[];
  notes: string;
  /** yyyy-mm-dd in UTC, or empty for "on receipt". */
  dueDate: string;
  validDays: string;
  /** Only this wallet may pay; empty means anyone. */
  payer: string;
}

export interface MerchantSettings {
  domain: string;
  businessName: string;
  /** Empty means "same as the signing wallet". */
  payout: string;
}

export const EXAMPLE_SETTINGS: MerchantSettings = { domain: "northlight-design.example", businessName: "Northlight Design Studio", payout: "" };

export const EMPTY_FORM: InvoiceForm = {
  clientName: "",
  lines: [{ description: "", quantity: "1", unitPrice: "" }],
  notes: "",
  dueDate: "",
  validDays: "30",
  payer: "",
};

export const EXAMPLE_FORM: InvoiceForm = {
  clientName: "Beta Labs",
  lines: [{ description: "Brand identity (EXAMPLE DATA)", quantity: "1", unitPrice: "1250" }],
  notes: "EXAMPLE DATA. Net 30, time-compressed for the demo.",
  dueDate: "",
  validDays: "30",
  payer: "",
};

/** Total of the lines in base units, or undefined while a line is still incomplete or invalid. */
export function formTotal(lines: LineForm[]): bigint | undefined {
  try {
    let total = 0n;
    for (const l of lines) {
      if (!/^\d{1,6}$/.test(l.quantity.trim())) return undefined;
      total += parseUsdt(l.unitPrice) * BigInt(l.quantity);
    }
    return total;
  } catch {
    return undefined;
  }
}

/** "2026-12-01" -> unix seconds at 00:00 UTC; empty -> 0 (on receipt). */
export function dueDateToUnix(date: string): number {
  if (!date.trim()) return 0;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Enter the due date as year-month-day.");
  const ms = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(ms)) throw new Error("That due date is not a real date.");
  return Math.floor(ms / 1000);
}

export function formToInput(form: InvoiceForm, settings: MerchantSettings, merchant: Address, example: boolean, now?: number): InvoiceInput {
  const validDays = Number(form.validDays);
  return {
    merchant,
    payout: (settings.payout.trim() || undefined) as Address | undefined,
    domain: settings.domain,
    merchantName: settings.businessName,
    clientName: form.clientName,
    lineItems: form.lines,
    notes: form.notes,
    dueDate: dueDateToUnix(form.dueDate),
    validDays: Number.isFinite(validDays) ? validDays : NaN,
    payer: (form.payer.trim() || undefined) as Address | undefined,
    example,
    now,
  };
}

/** Throws a plain-language Error if the form cannot become an invoice. */
export function checkForm(form: InvoiceForm, settings: MerchantSettings, merchant: Address, example: boolean, now?: number) {
  return buildInvoice(formToInput(form, settings, merchant, example, now));
}

/** The text a merchant publishes at /.well-known/truce.json. */
export function domainFileText(settings: MerchantSettings, merchant: Address): string {
  const file = buildDomainFile({ name: settings.businessName || "Your business name", signingAddress: merchant, payoutAddresses: settings.payout.trim() ? [settings.payout.trim() as Address] : undefined });
  return JSON.stringify(file, null, 2) + "\n";
}

const KEY = "truce.merchant.settings";
export function loadSettings(storage: Pick<Storage, "getItem"> | undefined, fallback: MerchantSettings): MerchantSettings {
  try {
    const raw = storage?.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<MerchantSettings>) : {};
    return { domain: String(parsed.domain ?? fallback.domain), businessName: String(parsed.businessName ?? fallback.businessName), payout: String(parsed.payout ?? fallback.payout) };
  } catch {
    return fallback;
  }
}
export function saveSettings(storage: Pick<Storage, "setItem"> | undefined, s: MerchantSettings) {
  try {
    storage?.setItem(KEY, JSON.stringify(s));
  } catch {
    /* private mode: settings just are not remembered */
  }
}
