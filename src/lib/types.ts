export interface Member {
  id: string;
  name: string;
  venmo: string;
  isTreasurer: boolean;
}

export interface RentConfig {
  id: string;
  amount: number;
  splitType: "equal" | "percentage" | "custom";
  recurring: boolean;
  percentages: Record<string, string>;
  customs: Record<string, string>;
  splits: Record<string, number>;
}

export interface Utility {
  id: string;
  name: string;
  amount: number;
  recurring: boolean;
  splits: Record<string, number>;
  date: string;
}

export interface Expense {
  id: string;
  description: string;
  amount: number;
  submittedBy: string;
  submittedByName: string;
  status: "pending" | "approved" | "denied";
  splits?: Record<string, number>;
  images?: string[];
  date: string;
}

export interface Payment {
  id: string;
  fromId: string;
  fromName: string;
  toId: string;
  toName: string;
  amount: number;
  status: "pending" | "confirmed" | "rejected";
  date: string;
}

export interface SubgroupBill {
  id: string;
  name: string;
  amount: number;
  paidBy: string;
  paidByName: string;
  recurring: boolean;
  splits: Record<string, number>;
  date: string;
}

export interface Subgroup {
  id: string;
  name: string;
  memberIds: string[];
  bills: SubgroupBill[];
}

export interface ChoreCompletion {
  date: string;
  assigneeId: string;
  completedAt: string;
}

export interface Chore {
  id: string;
  name: string;
  icon: string;
  everyDays: number;
  nextDue: string;
  assignMode: "fixed" | "rotation";
  assigneeId: string;
  rotationIds: string[];
  rotationIndex: number;
  history: ChoreCompletion[];
}

export interface Group {
  id: string;
  name: string;
  code: string;
  members: Member[];
  rent: RentConfig | null;
  utilities: Utility[];
  expenses: Expense[];
  payments: Payment[];
  subgroups: Subgroup[];
  chores: Chore[];
  smartSettle: boolean;
}

export interface Charge {
  id: string;
  type: "rent" | "utility" | "expense" | "subgroup";
  description: string;
  amount: number;
  splits: Record<string, number>;
  recurring: boolean;
  paidBy?: string;
  submittedByName?: string;
  subgroupName?: string;
}

export interface Settlement {
  fromId: string;
  fromName: string;
  toId: string;
  toName: string;
  amount: number;
}

export interface Tab {
  id: string;
  label: string;
  badge?: number | null;
}
