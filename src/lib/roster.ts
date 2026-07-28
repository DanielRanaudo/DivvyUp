import type { Member } from "./types";

/**
 * Members by id, plus the position each one holds in the list.
 *
 * Five components built this by hand, and the position matters as much as the
 * lookup: it picks the avatar's colour, so the same person has to be the same
 * colour everywhere.
 */
export interface Roster {
  byId: (id: string | null | undefined) => Member | undefined;
  /** Position in the group's member list; -1 when they've left. */
  indexOf: (id: string) => number;
  /** The member's name, or a placeholder for someone who has left. */
  nameOf: (id: string | null | undefined) => string;
}

export function roster(members: Member[]): Roster {
  const index = new Map<string, number>();
  members.forEach((m, i) => index.set(m.id, i));

  const byId = (id: string | null | undefined) => {
    if (!id) return undefined;
    const i = index.get(id);
    return i === undefined ? undefined : members[i];
  };

  return {
    byId,
    indexOf: (id) => index.get(id) ?? -1,
    nameOf: (id) => byId(id)?.name ?? "Former roommate",
  };
}
