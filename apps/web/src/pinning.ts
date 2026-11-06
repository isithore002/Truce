/** Key pinning: after a first payment, this browser remembers which wallets a merchant's domain used. */
export interface Pin {
  signingAddress: string;
  payoutAddresses: string[];
  pinnedAt: number;
}

export type PinMap = Record<string, Pin>;

export type PinStatus =
  | { status: "new" }
  | { status: "same"; pin: Pin }
  | { status: "changed"; pin: Pin; signerChanged: boolean; payoutChanged: boolean };

const KEY = "truce.pins";
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const domainKey = (d: string) => d.trim().toLowerCase();

export function loadPins(storage: Pick<Storage, "getItem"> | undefined): PinMap {
  try {
    const raw = storage?.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : {};
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
    const out: PinMap = {};
    for (const [domain, v] of Object.entries(parsed as Record<string, Partial<Pin>>)) {
      if (typeof v?.signingAddress === "string" && Array.isArray(v.payoutAddresses) && v.payoutAddresses.every((p) => typeof p === "string")) {
        out[domain] = { signingAddress: v.signingAddress, payoutAddresses: v.payoutAddresses, pinnedAt: Number(v.pinnedAt) || 0 };
      }
    }
    return out;
  } catch {
    return {};
  }
}

export function checkPin(pins: PinMap, domain: string, invoice: { merchant: string; payout: string }): PinStatus {
  const pin = pins[domainKey(domain)];
  if (!pin) return { status: "new" };
  const signerChanged = !same(pin.signingAddress, invoice.merchant);
  const payoutChanged = !pin.payoutAddresses.some((p) => same(p, invoice.payout));
  return signerChanged || payoutChanged ? { status: "changed", pin, signerChanged, payoutChanged } : { status: "same", pin };
}

/** Call after a payment succeeded. A new signing wallet replaces the pin; a new payout wallet is added to it. */
export function recordPin(storage: Pick<Storage, "getItem" | "setItem"> | undefined, domain: string, invoice: { merchant: string; payout: string }, now: number): void {
  if (!storage) return;
  const pins = loadPins(storage);
  const key = domainKey(domain);
  const existing = pins[key];
  if (existing && same(existing.signingAddress, invoice.merchant)) {
    if (!existing.payoutAddresses.some((p) => same(p, invoice.payout))) existing.payoutAddresses.push(invoice.payout);
  } else {
    pins[key] = { signingAddress: invoice.merchant, payoutAddresses: [invoice.payout], pinnedAt: now };
  }
  try {
    storage.setItem(KEY, JSON.stringify(pins));
  } catch {
    /* private mode: the pin is simply not remembered */
  }
}
