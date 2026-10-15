"use client";

import { useEffect, useRef, useState } from "react";
import { T, cardStyle } from "@/lib/tokens";
import { pillButton } from "@/components/profile/styles";

interface FeedStatus {
  active: boolean;
  error?: string;
}

interface FeedCreated extends FeedStatus {
  url?: string;
}

/** Manages the private iCalendar subscription without connecting an account. */
export default function CalendarFeedCard() {
  const [active, setActive] = useState(false);
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    let mounted = true;
    fetch("/api/calendar-feed", {
      signal: controller.signal,
      credentials: "same-origin",
      cache: "no-store",
    })
      .then(async (response) => {
        const payload = (await response.json()) as FeedStatus;
        if (!response.ok) throw new Error(payload.error || "Request failed");
        if (mounted) setActive(payload.active);
      })
      .catch((reason: unknown) => {
        if (mounted && (reason as Error).name !== "AbortError") {
          setError("Couldn't check your calendar feed. Try reloading.");
        }
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
      controller.abort();
    };
  }, []);

  const createLink = async () => {
    if (
      active &&
      !window.confirm(
        "Replace your calendar link? Your existing Google Calendar subscription will stop updating until you add the new link."
      )
    ) {
      return;
    }

    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/calendar-feed", {
        method: "POST",
        credentials: "same-origin",
      });
      const payload = (await response.json()) as FeedCreated;
      if (!response.ok || !payload.url) {
        throw new Error(payload.error || "Request failed");
      }
      setActive(true);
      setUrl(payload.url);
      setNotice(
        "Private link created. Add it to Google Calendar before leaving this page."
      );
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Couldn't create the calendar link."
      );
    } finally {
      setBusy(false);
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setNotice("Calendar link copied.");
    } catch {
      inputRef.current?.select();
      setNotice("Select and copy the calendar link shown below.");
    }
  };

  const disable = async () => {
    if (
      !window.confirm(
        "Disable this feed? Google will stop receiving updates. You should also remove the subscribed calendar in Google Calendar."
      )
    ) {
      return;
    }

    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/calendar-feed", {
        method: "DELETE",
        credentials: "same-origin",
      });
      if (!response.ok) {
        const payload = (await response.json()) as FeedStatus;
        throw new Error(payload.error || "Request failed");
      }
      setActive(false);
      setUrl("");
      setNotice("Calendar feed disabled.");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Couldn't disable the calendar feed."
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={cardStyle}>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 600 }}>Chore calendar</div>
          <p
            style={{
              margin: "4px 0 0",
              color: T.secondary,
              fontSize: 13,
              lineHeight: 1.45,
            }}
          >
            Subscribe once to see only chores assigned to you. No Google account
            connection is shared with DivvyUp.
          </p>
        </div>
        {!loading && (
          <span
            style={{
              borderRadius: 20,
              padding: "4px 9px",
              background: active ? "rgba(52,199,89,0.12)" : T.bg,
              color: active ? T.green : T.tertiary,
              fontSize: 11,
              fontWeight: 600,
              flexShrink: 0,
            }}
          >
            {active ? "Active" : "Off"}
          </span>
        )}
      </div>

      {loading ? (
        <p style={{ color: T.tertiary, fontSize: 13, margin: "16px 0 0" }}>
          Checking calendar feed…
        </p>
      ) : (
        <>
          {active && !url && (
            <p
              style={{
                color: T.secondary,
                fontSize: 13,
                lineHeight: 1.45,
                margin: "16px 0 0",
              }}
            >
              Your existing subscription will keep working. For security, the
              private link is shown only when it is created. Replace it if you
              need another copy.
            </p>
          )}

          {url && (
            <div style={{ marginTop: 16 }}>
              <label
                htmlFor="calendar-feed-url"
                style={{ fontSize: 12, fontWeight: 600, color: T.secondary }}
              >
                Private subscription URL
              </label>
              <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                <input
                  ref={inputRef}
                  id="calendar-feed-url"
                  readOnly
                  value={url}
                  onFocus={(event) => event.currentTarget.select()}
                  style={{
                    minWidth: 0,
                    flex: 1,
                    border: `1px solid ${T.border}`,
                    borderRadius: T.radiusSm,
                    padding: "9px 10px",
                    background: T.bg,
                    color: T.text,
                    fontFamily: "monospace",
                    fontSize: 12,
                  }}
                />
                <button
                  type="button"
                  onClick={() => void copyLink()}
                  style={{
                    ...pillButton,
                    background: "rgba(0,122,255,0.1)",
                    color: T.blue,
                  }}
                >
                  Copy
                </button>
              </div>
            </div>
          )}

          {active && (
            <div
              style={{
                marginTop: 16,
                padding: "12px 14px",
                borderRadius: T.radiusSm,
                background: T.bg,
                color: T.secondary,
                fontSize: 13,
                lineHeight: 1.55,
              }}
            >
              <strong style={{ color: T.text }}>Add it in Google Calendar</strong>
              <ol style={{ paddingLeft: 20, margin: "6px 0 0" }}>
                <li>On a computer, open Google Calendar.</li>
                <li>Next to “Other calendars,” click +, then “From URL.”</li>
                <li>Paste the private URL and choose “Add calendar.”</li>
              </ol>
              <div style={{ marginTop: 6 }}>
                Google controls refresh timing, so changes can take a while to
                appear.
              </div>
            </div>
          )}

          <p
            style={{
              color: T.tertiary,
              fontSize: 12,
              lineHeight: 1.45,
              margin: "12px 0 0",
            }}
          >
            Anyone with this private link can read your assigned chore names and
            dates. Replace or disable it if it is shared accidentally.
          </p>

          {notice && (
            <p role="status" style={{ color: T.green, fontSize: 13, margin: "12px 0 0" }}>
              {notice}
            </p>
          )}
          {error && (
            <p role="alert" style={{ color: T.red, fontSize: 13, margin: "12px 0 0" }}>
              {error}
            </p>
          )}

          <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
            <button
              type="button"
              disabled={busy}
              onClick={() => void createLink()}
              style={{
                ...pillButton,
                background: active ? T.bg : T.blue,
                color: active ? T.blue : "#fff",
                opacity: busy ? 0.6 : 1,
              }}
            >
              {busy
                ? "Working…"
                : active
                  ? "Replace private link"
                  : "Create calendar link"}
            </button>
            {active && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void disable()}
                style={{
                  ...pillButton,
                  background: T.bg,
                  color: T.red,
                  opacity: busy ? 0.6 : 1,
                }}
              >
                Disable
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

