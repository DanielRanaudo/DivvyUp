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

export function groupCode(): string {
  return Math.random().toString(36).substr(2, 6).toUpperCase();
}

export function getInitials(name: string): string {
  return name.slice(0, 2).toUpperCase();
}
