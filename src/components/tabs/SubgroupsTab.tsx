"use client";

import { useState } from "react";
import { T, inputStyle, labelStyle, cardStyle, secTitle } from "@/lib/tokens";
import { roster } from "@/lib/roster";
import { uid } from "@/lib/utils";
import { evenSplit } from "@/lib/splits";
import type { Group, Member, Subgroup, SubgroupBill } from "@/lib/types";
import SubgroupCard, {
  type BillDraft,
} from "@/components/subgroups/SubgroupCard";
import ConfirmDialog from "@/components/ConfirmDialog";
import { usePendingDelete } from "@/hooks/usePendingDelete";

interface SubgroupsTabProps {
  group: Group;
  setGroup: (updater: (prev: Group) => Group) => void;
  currentUser: Member;
}

export default function SubgroupsTab({
  group,
  setGroup,
  currentUser,
}: SubgroupsTabProps) {
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");

  const subgroups = group.subgroups ?? [];
  const members = roster(group.members);

  const editSubgroups = (change: (subgroups: Subgroup[]) => Subgroup[]) =>
    setGroup((prev) => ({ ...prev, subgroups: change(prev.subgroups ?? []) }));

  const editOne = (subId: string, change: (sub: Subgroup) => Subgroup) =>
    editSubgroups((prev) => prev.map((s) => (s.id === subId ? change(s) : s)));

  const createSubgroup = () => {
    const name = newName.trim();
    if (!name) return;
    editSubgroups((prev) => [
      ...prev,
      { id: uid(), name, memberIds: [currentUser.id], bills: [] },
    ]);
    setNewName("");
    setShowCreate(false);
  };

  const toggleMembership = (subId: string) =>
    editOne(subId, (s) => ({
      ...s,
      memberIds: s.memberIds.includes(currentUser.id)
        ? s.memberIds.filter((id) => id !== currentUser.id)
        : [...s.memberIds, currentUser.id],
    }));

  const addBill = (subId: string, draft: BillDraft) =>
    editOne(subId, (s) => ({
      ...s,
      bills: [
        ...s.bills,
        {
          id: uid(),
          name: draft.name,
          amount: draft.amount,
          paidBy: draft.paidBy,
          paidByName: members.nameOf(draft.paidBy),
          recurring: draft.recurring,
          // Only this subgroup's members share it, which is the whole point.
          splits: evenSplit(draft.amount, s.memberIds),
          date: new Date().toISOString(),
        },
      ],
    }));

  const subgroupRemoval = usePendingDelete<Subgroup>((sub) =>
    editSubgroups((prev) => prev.filter((s) => s.id !== sub.id))
  );
  const billRemoval = usePendingDelete<{ subId: string; bill: SubgroupBill }>(
    ({ subId, bill }) =>
      editOne(subId, (s) => ({
        ...s,
        bills: s.bills.filter((b) => b.id !== bill.id),
      }))
  );

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 20,
        }}
      >
        <div>
          <h2 style={{ ...secTitle, marginBottom: 4 }}>Floors</h2>
          <p style={{ fontSize: 14, color: T.secondary, margin: 0 }}>
            Sub-groups with their own shared bills
          </p>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          style={{
            padding: "8px 16px",
            borderRadius: 20,
            border: "none",
            background: showCreate ? T.bg : T.blue,
            color: showCreate ? T.text : "#fff",
            fontFamily: T.font,
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          {showCreate ? "Cancel" : "+ New"}
        </button>
      </div>

      {showCreate && (
        <div style={{ ...cardStyle, marginBottom: 20 }}>
          <label style={labelStyle} htmlFor="subgroup-subgroup-name">
            Subgroup Name
          </label>
          <input
            id="subgroup-subgroup-name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="2nd Floor, Kitchen Crew, etc."
            style={{ ...inputStyle, marginBottom: 14 }}
          />
          <button
            onClick={createSubgroup}
            style={{
              width: "100%",
              padding: "12px 0",
              borderRadius: T.radiusSm,
              border: "none",
              background: newName.trim() ? T.blue : "#c7c7cc",
              color: "#fff",
              fontFamily: T.font,
              fontSize: 15,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Create Subgroup
          </button>
        </div>
      )}

      {subgroups.length === 0 && !showCreate && (
        <div
          style={{
            textAlign: "center",
            padding: 48,
            color: T.tertiary,
            fontSize: 15,
          }}
        >
          No subgroups yet
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {subgroups.map((sub) => (
          <SubgroupCard
            key={sub.id}
            subgroup={sub}
            roster={members}
            currentUser={currentUser}
            onToggleMembership={() => toggleMembership(sub.id)}
            onAddBill={(draft) => addBill(sub.id, draft)}
            onDeleteBill={(bill) => billRemoval.ask({ subId: sub.id, bill })}
            onDelete={() => subgroupRemoval.ask(sub)}
          />
        ))}
      </div>

      <ConfirmDialog
        open={subgroupRemoval.target !== null}
        title={`Delete ${subgroupRemoval.target?.name ?? "subgroup"}?`}
        message="The subgroup and its bills go together."
        details={
          subgroupRemoval.target
            ? [
                `${subgroupRemoval.target.bills?.length ?? 0} bill(s) are deleted with it.`,
                "Balances change for everyone who was sharing them.",
              ]
            : undefined
        }
        confirmLabel="Delete"
        destructive
        onConfirm={subgroupRemoval.confirm}
        onCancel={subgroupRemoval.cancel}
      />

      <ConfirmDialog
        open={billRemoval.target !== null}
        title={`Delete ${billRemoval.target?.bill.name ?? "bill"}?`}
        message="Everyone in the subgroup stops owing their share of it."
        confirmLabel="Delete"
        destructive
        onConfirm={billRemoval.confirm}
        onCancel={billRemoval.cancel}
      />
    </div>
  );
}
