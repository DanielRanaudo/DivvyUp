import { IS_SANDBOX } from "./config";
import { addDaysISO, todayISO } from "./chores";
import { groupCode, uid } from "./utils";
import type { Chore, Group, Member } from "./types";

/**
 * The demo housemates. Sandbox mode exists so the app can be shown, and
 * demonstrated against, without an account — and so the browser tests have a
 * house with enough people in it to split a bill badly.
 */
export function sandboxMembers(): Member[] {
  const demo = (name: string, venmo: string, zelle: string): Member => ({
    id: uid(),
    name,
    venmo,
    zelle,
    isTreasurer: false,
  });

  return [
    demo("Alex", "@alex-v", "(555) 201-4410"),
    demo("Jordan", "@jordanp", ""),
    demo("Sam", "@samwise", "(555) 330-8123"),
    demo("Riley", "", "(555) 774-2091"),
    demo("Casey", "@caseyg", ""),
    demo("Morgan", "", ""),
    demo("Taylor", "@taylork", "(555) 918-6620"),
    demo("Jamie", "@jamiej", ""),
    demo("Quinn", "@quinnr", "(555) 445-7712"),
  ];
}

/** One rotating chore and one fixed one, so both kinds are visible at once. */
export function sandboxChores(you: Member, others: Member[]): Chore[] {
  return [
    {
      id: uid(),
      name: "Take out trash",
      icon: "🗑️",
      everyDays: 2,
      nextDue: todayISO(),
      assignMode: "rotation",
      assigneeId: you.id,
      rotationIds: [you.id, others[0].id, others[1].id],
      rotationIndex: 0,
      history: [],
    },
    {
      id: uid(),
      name: "Wash the dishes",
      icon: "🍽️",
      everyDays: 1,
      nextDue: addDaysISO(todayISO(), 1),
      assignMode: "fixed",
      assigneeId: others[2].id,
      rotationIds: [],
      rotationIndex: 0,
      history: [],
    },
  ];
}

/**
 * A group held only in the browser, for demo mode and for anyone running
 * without Supabase configured.
 *
 * In sandbox mode it comes furnished — nine roommates and two chores — because
 * an empty house demonstrates nothing.
 */
export function localGroup(name: string, you: Member): Group {
  const others = IS_SANDBOX ? sandboxMembers() : [];
  return {
    id: uid(),
    name,
    code: groupCode(),
    members: [you, ...others],
    rent: null,
    utilities: [],
    expenses: [],
    payments: [],
    subgroups: [],
    chores: IS_SANDBOX ? sandboxChores(you, others) : [],
    periods: [],
    smartSettle: false,
    docsVersion: 0,
  };
}
