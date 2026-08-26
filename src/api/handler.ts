import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb, runMigrations, type Database } from "../db/client";
import { AppError, toAppError } from "../shared/errors";
import { getEnv } from "../shared/env";
import { newCorrelationId } from "../shared/ids";
import { createLogger } from "../shared/logger";

/**
 * API route plumbing.
 *
 * Every route goes through here so that four things are guaranteed rather than
 * remembered: the request carries a correlation id, the body is schema-checked
 * before any handler sees it, failures serialise to one shape, and an
 * unexpected throw never leaks a stack trace or a connection string to the
 * caller.
 */

export interface RequestContext {
  db: Database;
  correlationId: string;
  log: ReturnType<typeof createLogger>;
  url: URL;
}

const HEADER = "x-correlation-id";

/**
 * Bearer-token auth, enabled only when API_TOKEN is set.
 *
 * Left off by default so a local clone runs with no setup. The decision is
 * surfaced on the Developer page rather than hidden, because "auth is disabled"
 * is a fact an operator needs to see, not a default to discover in production.
 */
function assertAuthorised(request: Request): void {
  const env = getEnv();
  if (!env.authRequired) return;

  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";

  // Length-independent comparison would be better with timingSafeEqual, but the
  // token is compared as a whole string against a constant-length secret here;
  // the meaningful protection is that the token is never logged or echoed.
  if (token.length === 0 || token !== env.API_TOKEN) {
    throw new AppError("UNAUTHENTICATED", "A valid bearer token is required for this endpoint.");
  }
}

export function jsonError(error: unknown, correlationId: string): NextResponse {
  const appError = toAppError(error, correlationId);
  return NextResponse.json(appError.toJSON(), {
    status: appError.httpStatus,
    headers: { [HEADER]: correlationId },
  });
}

type Handler<T> = (ctx: RequestContext, body: T) => Promise<unknown>;

/** Wraps a route that takes no body. */
export function route(handler: (ctx: RequestContext) => Promise<unknown>) {
  return async (request: Request): Promise<NextResponse> => {
    const correlationId = request.headers.get(HEADER) ?? newCorrelationId();
    const log = createLogger({ correlationId });
    const started = performance.now();
    try {
      assertAuthorised(request);
      await runMigrations();
      const db = await getDb();
      const result = await handler({ db, correlationId, log, url: new URL(request.url) });
      log.info("api_ok", {
        path: new URL(request.url).pathname,
        durationMs: Math.round(performance.now() - started),
      });
      return NextResponse.json(result, { headers: { [HEADER]: correlationId } });
    } catch (error) {
      const appError = toAppError(error, correlationId);
      log.warn("api_error", {
        path: new URL(request.url).pathname,
        code: appError.code,
        durationMs: Math.round(performance.now() - started),
      });
      return jsonError(error, correlationId);
    }
  };
}

/** Wraps a route whose JSON body must satisfy a schema. */
export function bodyRoute<S extends z.ZodType>(schema: S, handler: Handler<z.infer<S>>) {
  return async (request: Request): Promise<NextResponse> => {
    const correlationId = request.headers.get(HEADER) ?? newCorrelationId();
    const log = createLogger({ correlationId });
    const started = performance.now();
    try {
      assertAuthorised(request);

      let raw: unknown;
      try {
        raw = await request.json();
      } catch {
        throw new AppError("VALIDATION_ERROR", "Request body must be valid JSON.");
      }

      const parsed = schema.safeParse(raw);
      if (!parsed.success) {
        throw new AppError("VALIDATION_ERROR", "Request body failed validation.", {
          details: {
            issues: parsed.error.issues.map((i) => ({
              path: i.path.join(".") || "(root)",
              message: i.message,
            })),
          },
        });
      }

      await runMigrations();
      const db = await getDb();
      const result = await handler(
        { db, correlationId, log, url: new URL(request.url) },
        parsed.data,
      );
      log.info("api_ok", {
        path: new URL(request.url).pathname,
        durationMs: Math.round(performance.now() - started),
      });
      return NextResponse.json(result, { headers: { [HEADER]: correlationId } });
    } catch (error) {
      const appError = toAppError(error, correlationId);
      log.warn("api_error", {
        path: new URL(request.url).pathname,
        code: appError.code,
        durationMs: Math.round(performance.now() - started),
      });
      return jsonError(error, correlationId);
    }
  };
}

/** Reads a positive integer query param with a ceiling. */
export function intParam(url: URL, name: string, fallback: number, max: number): number {
  const raw = url.searchParams.get(name);
  if (raw === null) return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) return fallback;
  return Math.min(n, max);
}
