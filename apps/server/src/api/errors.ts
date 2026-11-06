import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";
import { ChainError } from "../chain/errors.js";

/** Error codes from docs/design/C-TECHNICAL.md section 3. */
export type ApiErrorCode =
  | "INVALID_DOCUMENT"
  | "SIGNATURE_INVALID"
  | "TOKEN_NOT_ALLOWED"
  | "EXPIRED"
  | "DUPLICATE"
  | "NOT_FOUND"
  | "AUTH_INVALID"
  | "WRONG_PAYER"
  | "SIMULATION_FAILED"
  | "INSUFFICIENT_BALANCE"
  | "ALREADY_PAID"
  | "NOT_PAID"
  | "REFUND_EXCEEDS_PAID"
  | "RELAYER_BUDGET_EXHAUSTED"
  | "RATE_LIMITED"
  | "NOT_IMPLEMENTED"
  | "INTERNAL";

const STATUS: Record<ApiErrorCode, number> = {
  INVALID_DOCUMENT: 400,
  SIGNATURE_INVALID: 422,
  TOKEN_NOT_ALLOWED: 422,
  EXPIRED: 422,
  DUPLICATE: 409,
  NOT_FOUND: 404,
  AUTH_INVALID: 422,
  WRONG_PAYER: 403,
  SIMULATION_FAILED: 422,
  INSUFFICIENT_BALANCE: 422,
  ALREADY_PAID: 409,
  NOT_PAID: 409,
  REFUND_EXCEEDS_PAID: 422,
  RELAYER_BUDGET_EXHAUSTED: 503,
  RATE_LIMITED: 429,
  NOT_IMPLEMENTED: 501,
  INTERNAL: 500,
};

export class ApiError extends Error {
  readonly status: number;
  constructor(
    readonly code: ApiErrorCode,
    message: string,
    readonly details?: Record<string, unknown>,
    status?: number,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status ?? STATUS[code];
  }
}

/** `{ error: { code, message, details? } }` for every failure. Never leaks stack traces, RPC URLs or keys. */
export function errorBody(code: string, message: string, details?: Record<string, unknown>) {
  return { error: { code, message, ...(details ? { details } : {}) } };
}

export function errorHandler(err: FastifyError | Error, req: FastifyRequest, reply: FastifyReply) {
  if (err instanceof ApiError) return reply.status(err.status).send(errorBody(err.code, err.message, err.details));
  if (err instanceof ChainError) {
    const code = err.code === "PENDING" ? "INTERNAL" : (err.code as ApiErrorCode);
    if (err.code === "INTERNAL") req.log.error({ err: err.cause ?? err }, "chain error");
    return reply.status(STATUS[code] ?? 500).send(errorBody(code, err.message, err.details));
  }
  if (err instanceof ZodError) {
    const first = err.issues[0];
    const where = first?.path.length ? `${first.path.join(".")}: ` : "";
    return reply.status(400).send(errorBody("INVALID_DOCUMENT", `${where}${first?.message ?? "invalid request"}`));
  }
  const fe = err as FastifyError;
  if (fe.statusCode && fe.statusCode >= 400 && fe.statusCode < 500) {
    const message = fe.statusCode === 413 ? "The request body is too large." : "The request could not be understood.";
    return reply.status(fe.statusCode).send(errorBody("INVALID_DOCUMENT", message));
  }
  req.log.error({ err }, "unhandled error");
  return reply.status(500).send(errorBody("INTERNAL", "Something went wrong on our side."));
}
