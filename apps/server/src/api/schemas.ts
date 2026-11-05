import { getAddress, type Address, type Hex } from "viem";
import { z } from "zod";

export const HashParam = z.object({
  hash: z
    .string()
    .regex(/^0x[0-9a-fA-F]{64}$/, "hash must be 32 bytes of hex")
    .transform((h) => h.toLowerCase() as Hex),
});

export const AddressParam = z.object({
  address: z.string().transform((a, ctx): Address => {
    try {
      return getAddress(a);
    } catch {
      ctx.addIssue({ code: "custom", message: "address is not valid" });
      return z.NEVER;
    }
  }),
});

const uintString = z.string().regex(/^\d{1,78}$/, "must be a decimal string");
const bytes32 = z.string().regex(/^0x[0-9a-fA-F]{64}$/, "must be 32 bytes of hex");

/** Buyer authorization as sent by the web app (docs/INTERFACES.md section 4). */
export const AuthorizeBody = z.object({
  mode: z.enum(["now", "due"]),
  from: z.string().transform((a, ctx): Address => {
    try {
      return getAddress(a);
    } catch {
      ctx.addIssue({ code: "custom", message: "from is not a valid address" });
      return z.NEVER;
    }
  }),
  validAfter: uintString,
  validBefore: uintString,
  v: z.number().int().refine((v) => v === 27 || v === 28, "v must be 27 or 28"),
  r: bytes32,
  s: bytes32,
});

export const VerifyQuery = z.object({
  hash: z.string().regex(/^0x[0-9a-fA-F]{64}$/, "hash must be 32 bytes of hex").optional(),
  buyer: z.string().regex(/^0x[0-9a-fA-F]{40}$/, "buyer must be an address").optional(),
});
