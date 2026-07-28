import * as Sentry from "@sentry/nextjs";

export const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN ?? "";

/** Sentry only reports when a DSN is configured; local runs stay quiet. */
export const SENTRY_ENABLED = SENTRY_DSN !== "";

/**
 * Reports a caught error.
 *
 * `console.error` is kept alongside Sentry rather than replaced: it is the only
 * signal during development and when no DSN is set, and it keeps the browser
 * console useful when debugging a report someone sends in.
 */
export function reportError(
  message: string,
  error?: unknown,
  context?: Record<string, unknown>
): void {
  if (SENTRY_ENABLED) {
    Sentry.captureException(error ?? new Error(message), {
      extra: { message, ...context },
    });
  }

  if (context !== undefined) console.error(message, error, context);
  else if (error !== undefined) console.error(message, error);
  else console.error(message);
}

/**
 * Attaches the signed-in user to subsequent reports, so an error can be traced
 * to an account. Only the id is sent — never the email or payment handles.
 */
export function identifyForErrors(userId: string | null): void {
  if (!SENTRY_ENABLED) return;
  Sentry.setUser(userId ? { id: userId } : null);
}
