import * as Sentry from "@sentry/nextjs";
import { SENTRY_DSN, SENTRY_ENABLED } from "@/lib/observability";

export function register(): void {
  if (!SENTRY_ENABLED) return;

  Sentry.init({
    dsn: SENTRY_DSN,
    environment: process.env.NODE_ENV,
    // Small app, low traffic: sample everything rather than guess at a rate.
    tracesSampleRate: 1,
    // Emails, Venmo usernames and Zelle numbers all pass through this app; none
    // of it belongs in an error report.
    sendDefaultPii: false,
  });
}

// Surfaces errors thrown while rendering server components or handling routes.
export const onRequestError = Sentry.captureRequestError;
