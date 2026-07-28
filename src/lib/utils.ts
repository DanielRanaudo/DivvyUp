export function uid(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  // Fallback: RFC4122-ish v4 uuid so ids stay valid for the database.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Invite codes are Crockford base32: I, L, O and U are omitted so a code can be
 * read aloud without ambiguity. Must stay in step with `generate_group_code()`
 * in the database, which is what issues the codes for real groups.
 */
export const INVITE_CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const INVITE_CODE_LENGTH = 10;

export function groupCode(): string {
  const bytes = new Uint8Array(INVITE_CODE_LENGTH);
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.getRandomValues === "function"
  ) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = (Math.random() * 256) | 0;
    }
  }
  // 32 divides 256 evenly, so the modulo introduces no bias.
  return Array.from(
    bytes,
    (b) => INVITE_CODE_ALPHABET[b % INVITE_CODE_ALPHABET.length]
  ).join("");
}

/**
 * Cleans up a code a roommate typed or pasted: strips whitespace and any
 * separators they added, and folds the letters Crockford treats as digits.
 * Worth doing on the client because the server throttles wrong codes.
 */
export function normalizeInviteCode(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[IL]/g, "1")
    .replace(/O/g, "0")
    .replace(new RegExp(`[^${INVITE_CODE_ALPHABET}]`, "g"), "")
    .slice(0, INVITE_CODE_LENGTH);
}

export function getInitials(name: string): string {
  return name.slice(0, 2).toUpperCase();
}

/**
 * Rejects with `message` if `promise` hasn't settled within `ms`.
 *
 * A dropped connection leaves `fetch` pending instead of failing it, so a
 * request made while the network is flaky can stay unresolved for as long as
 * the tab is open. Anything gating the screen on such a request never gets to
 * fail, and the app sits on a loading state with nothing logged to explain it.
 */
export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message: string
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise,
    new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error(message)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}
