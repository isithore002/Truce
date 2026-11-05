/** Token amounts: the allowlisted track USDT has 6 decimals. "1250000000" -> "1,250.00 USDT". */
export function formatUsdt(units: string | bigint): string {
  const n = typeof units === "bigint" ? units : BigInt(units);
  const whole = n / 1_000_000n;
  const frac = (n % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "").padEnd(2, "0");
  return `${whole.toLocaleString("en-US")}.${frac} USDT`;
}

export function formatDate(unix: string | number | bigint): string {
  return new Date(Number(unix) * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export function formatDateTime(unix: string | number | bigint): string {
  return new Date(Number(unix) * 1000).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }) + " UTC";
}

export function shortAddress(a: string): string {
  return a.length > 12 ? `${a.slice(0, 6)}...${a.slice(-4)}` : a;
}

export function shortHash(h: string): string {
  return h.length > 16 ? `${h.slice(0, 10)}...${h.slice(-6)}` : h;
}

/** The link a buyer is sent: the web app's pay page for an invoice hash. */
export function payLink(origin: string, hash: string): string {
  return `${origin.replace(/\/$/, "")}/pay/${hash}`;
}

/** Accepts a pay link, a bare 0x hash, or text containing one; returns the lowercase hash or undefined. */
export function extractHash(input: string): string | undefined {
  const m = input.match(/0x[0-9a-fA-F]{64}/);
  return m ? m[0].toLowerCase() : undefined;
}
