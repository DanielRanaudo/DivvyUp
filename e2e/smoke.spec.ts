import { test, expect, type Page } from "@playwright/test";

// The path a household actually walks: someone fronts money, the treasurer
// approves it, the debt appears, it gets paid, and the payee confirms. If this
// breaks the app is not usable, whatever else still passes.
//
// Sandbox mode fills a new group with nine demo roommates and lets us change who
// we are viewing as, so one browser can play both the submitter and the
// treasurer with no auth and nothing to clean up afterwards.

const MEMBERS = 10; // "You" plus the nine sandbox roommates
const EXPENSE = 120;
const SHARE = EXPENSE / MEMBERS;
// How the app renders a date from this year, e.g. "Jul 27".
const TODAY = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
}).format(new Date());
// How it names the month being closed, e.g. "July 2026".
const MONTH = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric",
}).format(new Date());

async function createGroup(page: Page, name: string) {
  await page.goto("/");
  await page.getByRole("button", { name: "Start a Group" }).click();
  await page.getByPlaceholder('e.g. "4200 Walnut St"').fill(name);
  await page.getByRole("button", { name: "Create Group" }).click();
  await expect(page.getByRole("heading", { name: "divvyup" })).toBeVisible();
}

async function viewAs(page: Page, member: string) {
  await page.getByLabel("Viewing as").selectOption({ label: member });
}

function tabs(page: Page) {
  return page.locator(".nav-desktop-tabs");
}

async function openTab(page: Page, label: string) {
  // A tab with something waiting reads as "Expenses — needs attention", so the
  // name is matched from the start rather than exactly.
  await tabs(page)
    .getByRole("button", { name: new RegExp(`^${label}( —|$)`) })
    .click();
}

async function submitExpense(page: Page, description: string, amount: number) {
  await openTab(page, "Expenses");
  await page.getByRole("button", { name: "+ Submit" }).click();
  await page.getByPlaceholder("Toilet paper, etc.").fill(description);
  await page.getByPlaceholder("0.00").fill(String(amount));
  await page.getByRole("button", { name: "Submit for Approval" }).click();
}

test("a fronted expense becomes a debt, gets paid, and is confirmed", async ({
  page,
}) => {
  await createGroup(page, "Playwright House");

  // Alex fronts the money for something the whole house uses.
  await viewAs(page, "Alex");
  await submitExpense(page, "Paper towels", EXPENSE);

  await expect(page.getByRole("heading", { name: "Pending · 1" })).toBeVisible();
  await expect(page.getByText(`by Alex · ${TODAY}`)).toBeVisible();

  // A plain member has no approve control at all.
  await expect(
    page.getByRole("button", { name: "Approve Paper towels" })
  ).toHaveCount(0);

  await viewAs(page, "You (Treasurer)");
  await page
    .getByRole("button", { name: "Approve Paper towels, split evenly" })
    .click();

  await expect(page.getByRole("heading", { name: "Approved" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Pending · 1" })).toBeHidden();
  // Split evenly across everyone, including Alex.
  await expect(page.getByText(`${SHARE.toFixed(2)}/person`)).toBeVisible();

  // So the treasurer now owes Alex one share.
  await openTab(page, "Settle");
  await expect(page.getByRole("heading", { name: "You Owe" })).toBeVisible();
  await page.getByRole("button", { name: "I Paid This" }).click();
  await expect(page.getByText("Waiting for Alex to confirm")).toBeVisible();

  // Alex gets the notification, and can act on it from the Settle tab as well
  // as the dashboard — that is where you go to chase what you're owed.
  await viewAs(page, "Alex");
  await openTab(page, "Home");
  await expect(page.getByText("You paid you")).toBeVisible();

  await openTab(page, "Settle");
  await expect(
    page.getByRole("heading", { name: "Waiting on You" })
  ).toBeVisible();
  await page.getByRole("button", { name: "Confirm" }).click();

  // A confirmed payment cancels the debt, so it leaves the settlement list and
  // turns up in the history instead.
  await expect(page.getByRole("heading", { name: "History" })).toBeVisible();
  await expect(page.getByText(`Confirmed · ${TODAY}`)).toBeVisible();
  await expect(page.getByText("Waiting for")).toHaveCount(0);
});

test("an expense can be split between only the people who shared it", async ({
  page,
}) => {
  await createGroup(page, "Split House");
  await viewAs(page, "Alex");
  await submitExpense(page, "Pizza", 90);

  await viewAs(page, "You (Treasurer)");
  await page.getByRole("button", { name: "Choose how to split Pizza" }).click();

  const dialog = page.getByRole("dialog");

  // An empty set of typed amounts is a state Approve has to refuse.
  await dialog.getByRole("button", { name: "Amounts" }).click();
  await expect(dialog.getByText("Enter what each person owes")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Approve" })).toBeDisabled();

  // Quinn wasn't there, so the other nine cover it. Clicking the label is what
  // a person does; the checkbox itself is visually hidden behind the drawn box.
  await dialog.getByRole("button", { name: "Some of us" }).click();
  await dialog.locator("label", { hasText: "Quinn" }).click();
  await expect(
    dialog.getByRole("checkbox", { name: "Quinn" })
  ).not.toBeChecked();
  await expect(dialog.getByText("ready to approve")).toBeVisible();
  await dialog.getByRole("button", { name: "Approve" }).click();

  await expect(page.getByText("$10.00 each, 9 of 10")).toBeVisible();

  // Reopening drops the shares so a pending expense moves nobody's balance, but
  // splitting it again should pick up where the treasurer left off rather than
  // making them exclude Quinn a second time.
  await page.getByRole("button", { name: "Undo approval of Pizza" }).click();
  await page.getByRole("button", { name: "Choose how to split Pizza" }).click();
  await expect(
    dialog.getByRole("button", { name: "Some of us", pressed: true })
  ).toBeVisible();
  await expect(
    dialog.getByRole("checkbox", { name: "Quinn" })
  ).not.toBeChecked();
});

test("a mistyped expense can be corrected, unapproved and deleted", async ({
  page,
}) => {
  await createGroup(page, "Edit House");
  await submitExpense(page, "Groceris", 50);

  await page.getByRole("button", { name: "Edit Groceris" }).click();
  await page.getByPlaceholder("Toilet paper, etc.").fill("Groceries");
  await page.getByPlaceholder("0.00").fill("60");
  await page.getByRole("button", { name: "Save Changes" }).click();
  await expect(page.getByText("Groceries")).toBeVisible();
  await expect(page.getByText("$60.00")).toBeVisible();

  // An approval is a decision, not a one-way door.
  await page
    .getByRole("button", { name: "Approve Groceries, split evenly" })
    .click();
  await expect(page.getByRole("heading", { name: "Approved" })).toBeVisible();
  await page
    .getByRole("button", { name: "Undo approval of Groceries" })
    .click();
  await expect(page.getByRole("heading", { name: "Pending · 1" })).toBeVisible();

  await page.getByRole("button", { name: "Delete Groceries" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete", exact: true })
    .click();
  await expect(page.getByText("No expenses yet")).toBeVisible();
});

test("only the treasurer sees the rent and bills tabs", async ({ page }) => {
  await createGroup(page, "Permissions House");

  await expect(tabs(page).getByRole("button", { name: "Rent" })).toBeVisible();

  await viewAs(page, "Jordan");
  await expect(tabs(page).getByRole("button", { name: "Rent" })).toHaveCount(0);
  await expect(tabs(page).getByRole("button", { name: "Bills" })).toHaveCount(0);
});

test("the tab you are looking at is in the URL, and back returns to it", async ({
  page,
}) => {
  await createGroup(page, "Routing House");
  await expect(page).toHaveURL(/screen=app/);

  await openTab(page, "Settle");
  await expect(page).toHaveURL(/tab=settle/);

  await openTab(page, "Expenses");
  await expect(page).toHaveURL(/tab=expenses/);

  await page.goBack();
  await expect(page).toHaveURL(/tab=settle/);
  await expect(page.getByRole("heading", { name: "Settle Up" })).toBeVisible();
});

test("closing the month files it away but keeps the debt", async ({ page }) => {
  await createGroup(page, "Close House");
  await viewAs(page, "Alex");
  await submitExpense(page, "Paper towels", EXPENSE);

  await viewAs(page, "You (Treasurer)");
  await page
    .getByRole("button", { name: "Approve Paper towels, split evenly" })
    .click();

  await openTab(page, "Settle");
  await expect(page.getByRole("heading", { name: "You Owe" })).toBeVisible();

  await page.getByRole("button", { name: `Close ${MONTH}` }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Close the month" })
    .click();

  // The expense is filed away, but the share it created is still owed.
  await expect(
    page.getByRole("heading", { name: "Past Months" })
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "You Owe" })).toBeVisible();
  // Everyone but Alex still owes Alex their share of it.
  await expect(page.getByText(`$${SHARE.toFixed(2)}`)).toHaveCount(
    MEMBERS - 1
  );

  await openTab(page, "Expenses");
  await expect(page.getByText("No expenses yet")).toBeVisible();

  // The archive still has it.
  await openTab(page, "Settle");
  await page.getByRole("button", { name: new RegExp(`^${MONTH}`) }).click();
  await expect(page.getByText("Paper towels")).toBeVisible();
});

test("the treasurer can hand the role to someone else", async ({ page }) => {
  await createGroup(page, "Handover House");
  await openTab(page, "Group");

  await page.getByRole("button", { name: "Make Jordan treasurer" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Hand over" })
    .click();
  await expect(page.getByText("Jordan is now the treasurer")).toBeVisible();

  // You keep your place in the house, but not the powers that came with it.
  await expect(tabs(page).getByRole("button", { name: "Rent" })).toHaveCount(0);
  await viewAs(page, "Jordan (Treasurer)");
  await expect(tabs(page).getByRole("button", { name: "Rent" })).toBeVisible();
});

test("a new group has an invite code to share", async ({ page }) => {
  await createGroup(page, "Invite House");
  await openTab(page, "Group");
  await expect(page.getByText("Invite Code")).toBeVisible();
});

test("the month downloads as a spreadsheet", async ({ page }) => {
  await createGroup(page, "Ledger House");
  await viewAs(page, "Alex");
  await submitExpense(page, "Paper towels", EXPENSE);

  await viewAs(page, "You (Treasurer)");
  await page
    .getByRole("button", { name: "Approve Paper towels, split evenly" })
    .click();

  await openTab(page, "Settle");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Export this month" }).click(),
  ]);

  expect(download.suggestedFilename()).toBe("Ledger-House-open.csv");

  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  const csv = Buffer.concat(chunks).toString("utf8");

  expect(csv.split("\r\n")[0]).toBe(
    "Date,Type,Description,Amount,Paid by,Owed by,Status"
  );
  expect(csv).toContain("Expense,Paper towels,120.00,Alex");
  expect(csv).toContain(`Alex ${SHARE.toFixed(2)}`);
});

test("the rent form can be filled by name alone", async ({ page }) => {
  await createGroup(page, "Label House");
  await openTab(page, "Rent");

  // Every field answers to its visible label, which is what a screen reader
  // reads out and what a keyboard user lands on.
  await page.getByLabel("Total Monthly Rent").fill("3000");
  await expect(
    page.getByRole("group", { name: "Split Method" })
  ).toBeVisible();
  // The checkbox used to be a div, unreachable without a mouse.
  const recurring = page.getByRole("checkbox", { name: "Recurring monthly" });
  await recurring.focus();
  await page.keyboard.press("Space");
  await expect(recurring).not.toBeChecked();

  await page.getByRole("button", { name: "Save Rent" }).click();

  await expect(page.getByText("Saved ✓")).toBeVisible();
});

test("a bill is not deleted on the first click", async ({ page }) => {
  await createGroup(page, "Careful House");
  await openTab(page, "Bills");
  await page.getByRole("button", { name: "+ Add" }).click();
  await page.getByLabel("Name").fill("Internet");
  await page.getByLabel("Amount").fill("80");
  await page.getByRole("button", { name: "Add Utility" }).click();

  await page.getByRole("button", { name: "Delete Internet" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();

  // Backing out leaves the bill alone.
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByText("Internet")).toBeVisible();

  await page.getByRole("button", { name: "Delete Internet" }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByText("Internet")).toHaveCount(0);
});
