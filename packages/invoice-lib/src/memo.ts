import { keccak256, stringToHex, type Hex } from "viem";
import type { InvoiceDetails } from "./types.js";

type Json = string | boolean | null | Json[] | { [key: string]: Json };

function canonicalize(value: unknown): string {
  if (value === null || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonicalize).join(",") + "]";
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj)
      .filter((k) => obj[k] !== undefined)
      .sort();
    return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonicalize(obj[k])).join(",") + "}";
  }
  // Numbers are rejected on purpose: INTERFACES.md section 1 says all numbers are strings.
  throw new TypeError(`canonicalJson: unsupported value of type ${typeof value} (use strings for numbers)`);
}

/** Object keys sorted at every level, no whitespace, numbers must already be strings. */
export function canonicalJson(value: Json | InvoiceDetails): string {
  return canonicalize(value);
}

/** keccak256 of the UTF-8 bytes of the canonical JSON. */
export function memoHash(details: InvoiceDetails): Hex {
  return keccak256(stringToHex(canonicalJson(details)));
}
