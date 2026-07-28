"use client";

import { useMemo, useState } from "react";
import { T, cardStyle, secTitle } from "@/lib/tokens";
import { USE_BACKEND } from "@/lib/config";
import { createClient } from "@/lib/supabase/client";
import { useReceiptUrls } from "@/hooks/useReceiptUrls";
import Modal from "@/components/Modal";
import ConfirmDialog from "@/components/ConfirmDialog";
import SplitExpenseDialog from "@/components/SplitExpenseDialog";
import ExpenseForm, {
  type ExpenseFields,
} from "@/components/expenses/ExpenseForm";
import ExpenseRow, { RowButton } from "@/components/expenses/ExpenseRow";
import ReceiptPreview from "@/components/expenses/ReceiptPreview";
import {
  describeSplit,
  draftFromExpense,
  type SplitDraft,
} from "@/lib/expenseSplits";
import {
  addExpense,
  approveEvenly,
  approveExpense,
  denyExpense,
  editExpense,
  mayDelete,
  mayEdit,
  removeExpense,
  reopenExpense,
} from "@/lib/expenses";
import { stillOpen } from "@/lib/periods";
import { useTruncatedList } from "@/hooks/useTruncatedList";
import { usePendingDelete } from "@/hooks/usePendingDelete";
import ShowMoreRow from "@/components/ShowMoreRow";
import { formatDate } from "@/lib/format";
import type { Expense, Group, Member } from "@/lib/types";

interface ExpensesTabProps {
  group: Group;
  setGroup: (updater: (prev: Group) => Group) => void;
  currentUser: Member;
  isTreasurer: boolean;
}

/** Which form, if any, is open. */
type FormState =
  { kind: "closed" } | { kind: "new" } | { kind: "edit"; id: string };

export default function ExpensesTab({
  group,
  setGroup,
  currentUser,
  isTreasurer,
}: ExpensesTabProps) {
  const [supabase] = useState(() =>
    USE_BACKEND && typeof window !== "undefined" ? createClient() : null
  );
  const [form, setForm] = useState<FormState>({ kind: "closed" });
  const [images, setImages] = useState<string[]>([]);
  const [viewImage, setViewImage] = useState<string | null>(null);
  const [splitting, setSplitting] = useState<Expense | null>(null);
  // Reopening an expense clears its splits so it stops moving balances, which
  // would also lose the treasurer's answer to "who owed what". Keeping it here
  // lets a re-split start from that instead of from an even split.
  const [priorDrafts, setPriorDrafts] = useState<Record<string, SplitDraft>>(
    {}
  );

  // A closed month's expenses live in the archive on the Settle tab.
  const expenses = useMemo(() => stillOpen(group.expenses), [group.expenses]);
  const pending = expenses.filter((e) => e.status === "pending");
  const approved = expenses.filter((e) => e.status === "approved");
  const denied = expenses.filter((e) => e.status === "denied");
  // Newest first, and only a screenful at a time: a busy month can run long.
  const approvedList = useTruncatedList([...approved].reverse());
  const memberIds = useMemo(
    () => group.members.map((m) => m.id),
    [group.members]
  );
  const editing =
    form.kind === "edit"
      ? (expenses.find((e) => e.id === form.id) ?? null)
      : null;

  // Every receipt on screen, including any just attached to the open form, so
  // they can all be signed in a single round trip.
  const receiptRefs = useMemo(() => {
    const refs = new Set(images);
    expenses.forEach((e) => e.images?.forEach((ref) => refs.add(ref)));
    return [...refs];
  }, [expenses, images]);
  const receiptUrls = useReceiptUrls(supabase, receiptRefs);

  const closeForm = () => {
    setForm({ kind: "closed" });
    setImages([]);
  };

  const startEdit = (e: Expense) => {
    setImages(e.images ?? []);
    setForm({ kind: "edit", id: e.id });
  };

  const submit = (fields: ExpenseFields) => {
    setGroup((prev) => addExpense(prev, fields, currentUser));
    closeForm();
  };

  const forgetPriorDraft = (id: string) =>
    setPriorDrafts((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });

  const saveEdit = (id: string, fields: ExpenseFields) => {
    setGroup((prev) => editExpense(prev, id, fields));
    // Shares typed against the old total wouldn't add up to the new one.
    forgetPriorDraft(id);
    closeForm();
  };

  const removal = usePendingDelete<Expense>((expense) => {
    setGroup((prev) => removeExpense(prev, expense.id));
    if (form.kind === "edit" && form.id === expense.id) closeForm();
  });

  const rowControls = (e: Expense) => (
    <>
      {mayEdit(e, currentUser, isTreasurer) && (
        <RowButton label={`Edit ${e.description}`} onClick={() => startEdit(e)}>
          Edit
        </RowButton>
      )}
      {mayDelete(e, currentUser, isTreasurer) && (
        <RowButton
          label={`Delete ${e.description}`}
          tone="danger"
          onClick={() => removal.ask(e)}
        >
          ×
        </RowButton>
      )}
    </>
  );

  const undoButton = (e: Expense, label: string) => (
    <RowButton
      label={`${label} ${e.description}`}
      onClick={() => {
        // Has to happen before the reopen, which is what discards the splits.
        if (e.splits) {
          const draft = draftFromExpense(e, memberIds);
          setPriorDrafts((prev) => ({ ...prev, [e.id]: draft }));
        }
        setGroup((prev) => reopenExpense(prev, e.id));
      }}
    >
      Undo
    </RowButton>
  );

  const doomed = removal.target;

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
          <h2 style={{ ...secTitle, marginBottom: 4 }}>Expenses</h2>
          <p style={{ fontSize: 14, color: T.secondary, margin: 0 }}>
            Requires treasurer approval
          </p>
        </div>
        <button
          onClick={() =>
            form.kind === "closed" ? setForm({ kind: "new" }) : closeForm()
          }
          style={{
            padding: "8px 16px",
            borderRadius: 20,
            border: "none",
            background: form.kind === "closed" ? T.blue : T.bg,
            color: form.kind === "closed" ? "#fff" : T.text,
            fontFamily: T.font,
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          {form.kind === "closed" ? "+ Submit" : "Cancel"}
        </button>
      </div>

      {form.kind === "new" && (
        <ExpenseForm
          groupId={group.id}
          supabase={supabase}
          images={images}
          onImagesChange={setImages}
          receiptUrls={receiptUrls}
          onViewReceipt={setViewImage}
          submitLabel="Submit for Approval"
          onSubmit={submit}
        />
      )}

      {editing && (
        <ExpenseForm
          key={editing.id}
          groupId={group.id}
          supabase={supabase}
          images={images}
          onImagesChange={setImages}
          receiptUrls={receiptUrls}
          onViewReceipt={setViewImage}
          heading={`Editing "${editing.description}"`}
          initialDescription={editing.description}
          initialAmount={String(editing.amount)}
          submitLabel="Save Changes"
          onSubmit={(fields) => saveEdit(editing.id, fields)}
          onCancel={closeForm}
        />
      )}

      <Section
        title={`Pending · ${pending.length}`}
        color={T.orange}
        show={pending.length > 0}
      >
        {pending.map((e, i) => (
          <ExpenseRow
            key={e.id}
            expense={e}
            meta={`by ${e.submittedByName} · ${formatDate(e.date)}`}
            iconBackground="rgba(255,149,0,0.1)"
            receiptUrls={receiptUrls}
            onViewReceipt={setViewImage}
            divider={i < pending.length - 1}
            actions={
              <>
                {rowControls(e)}
                {isTreasurer && (
                  <>
                    <RowButton
                      label={`Choose how to split ${e.description}`}
                      onClick={() => setSplitting(e)}
                    >
                      <span style={{ color: T.blue }}>Split</span>
                    </RowButton>
                    <RowButton
                      label={`Approve ${e.description}, split evenly`}
                      tone="confirm"
                      onClick={() =>
                        setGroup((prev) => approveEvenly(prev, e.id))
                      }
                    >
                      ✓
                    </RowButton>
                    <RowButton
                      label={`Deny ${e.description}`}
                      onClick={() =>
                        setGroup((prev) => denyExpense(prev, e.id))
                      }
                    >
                      ✗
                    </RowButton>
                  </>
                )}
              </>
            }
          />
        ))}
      </Section>

      <Section title="Approved" color={T.green} show={approved.length > 0}>
        {approvedList.visible.map((e, i) => (
          <ExpenseRow
            key={e.id}
            expense={e}
            meta={`by ${e.submittedByName} · ${formatDate(
              e.date
            )} · ${describeSplit(e.splits, group.members)}`}
            iconBackground="rgba(88,86,214,0.08)"
            receiptUrls={receiptUrls}
            onViewReceipt={setViewImage}
            divider={i < approvedList.visible.length - 1}
            actions={
              isTreasurer ? (
                <>
                  {undoButton(e, "Undo approval of")}
                  {rowControls(e)}
                </>
              ) : undefined
            }
          />
        ))}
        <ShowMoreRow
          hidden={approvedList.hidden}
          label="expenses"
          onClick={approvedList.showMore}
        />
      </Section>

      <Section title="Denied" color={T.secondary} show={denied.length > 0}>
        {[...denied].reverse().map((e, i) => (
          <ExpenseRow
            key={e.id}
            expense={e}
            meta={`by ${e.submittedByName} · ${formatDate(e.date)} · not approved`}
            iconBackground={T.bg}
            receiptUrls={receiptUrls}
            onViewReceipt={setViewImage}
            divider={i < denied.length - 1}
            actions={
              isTreasurer ? (
                <>
                  {undoButton(e, "Put back in the queue:")}
                  {rowControls(e)}
                </>
              ) : undefined
            }
          />
        ))}
      </Section>

      {expenses.length === 0 && form.kind === "closed" && (
        <div
          style={{
            textAlign: "center",
            padding: 48,
            color: T.tertiary,
            fontSize: 15,
          }}
        >
          No expenses yet
        </div>
      )}

      <SplitExpenseDialog
        key={splitting?.id ?? "none"}
        expense={splitting}
        members={group.members}
        initialDraft={splitting ? priorDrafts[splitting.id] : undefined}
        onCancel={() => setSplitting(null)}
        onApprove={(splits, mode) => {
          if (splitting) {
            setGroup((prev) =>
              approveExpense(prev, splitting.id, splits, mode)
            );
          }
          setSplitting(null);
        }}
      />

      <ConfirmDialog
        open={doomed !== null}
        title="Delete this expense?"
        message={
          doomed ? `"${doomed.description}" will be removed for everyone.` : ""
        }
        details={
          doomed?.status === "approved"
            ? ["The balances it created disappear with it."]
            : undefined
        }
        confirmLabel="Delete"
        destructive
        onConfirm={removal.confirm}
        onCancel={removal.cancel}
      />

      <Modal
        open={viewImage !== null}
        onClose={() => setViewImage(null)}
        title="Receipt"
        hideTitle
        fullBleed
      >
        {viewImage && (
          <ReceiptPreview receiptRef={viewImage} url={receiptUrls[viewImage]} />
        )}
      </Modal>
    </div>
  );
}

interface SectionProps {
  title: string;
  color: string;
  show: boolean;
  children: React.ReactNode;
}

/** A heading and the card of rows beneath it. */
function Section({ title, color, show, children }: SectionProps) {
  if (!show) return null;
  return (
    <div style={{ marginBottom: 24 }}>
      <h3
        style={{
          fontSize: 13,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          marginBottom: 10,
          color,
        }}
      >
        {title}
      </h3>
      <div style={{ ...cardStyle, padding: 0, overflow: "hidden" }}>
        {children}
      </div>
    </div>
  );
}
