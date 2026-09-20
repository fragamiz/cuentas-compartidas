export type Member = {
  id: string;
  name: string;
  activeFrom?: string;
  activeUntil?: string;
};

export type Guest = { id: string; name: string };
export type SpecialPart = { id: string; title: string; memberId: string; amountCents: number };
export type ItemLine = { id: string; title: string; memberId: string; amountCents: number };
export type SettledTransfer = { id: string; fromId: string; toId: string; amountCents: number; date: string };

export type ExpenseSplitConfig = {
  mode: "equal" | "shares" | "exact" | "items";
  included: string[];
  values: Record<string, number>;
  specialParts: SpecialPart[];
  items?: ItemLine[];
};

export type Expense = {
  id: string;
  title: string;
  category: string;
  date: string;
  amountCents: number;
  payerId: string;
  payments?: Record<string, number>;
  guests?: Guest[];
  allocations: Record<string, number>;
  splitLabel: string;
  splitConfig?: ExpenseSplitConfig;
};

export type Event = {
  id: string;
  name: string;
  date: string;
  currency: "EUR";
  archived?: boolean;
  settledTransfers?: SettledTransfer[];
  members: Member[];
  expenses: Expense[];
};

export type AppState = { events: Event[]; activeEventId: string | null };
export const EMPTY_STATE: AppState = { events: [], activeEventId: null };

export function formatMoney(cents: number) {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(cents / 100);
}

export function activeMembers(event: Event, date: string) {
  return event.members.filter((member) => (!member.activeFrom || member.activeFrom <= date) && (!member.activeUntil || member.activeUntil >= date));
}

export function expensePayments(expense: Expense) {
  return expense.payments && Object.keys(expense.payments).length
    ? expense.payments
    : { [expense.payerId]: expense.amountCents };
}

export function eventPeople(event: Event) {
  const people = new Map<string, Member & { temporary?: boolean }>();
  event.members.forEach((member) => people.set(member.id, member));
  event.expenses.forEach((expense) => {
    expense.guests?.forEach((guest) => people.set(guest.id, { ...guest, temporary: true }));
  });
  return [...people.values()];
}

export function eventBalances(event: Event) {
  const balances: Record<string, { paid: number; share: number; net: number }> = {};
  for (const person of eventPeople(event)) balances[person.id] = { paid: 0, share: 0, net: 0 };
  for (const expense of event.expenses) {
    for (const [personId, cents] of Object.entries(expensePayments(expense))) {
      if (!balances[personId]) balances[personId] = { paid: 0, share: 0, net: 0 };
      balances[personId].paid += cents;
    }
    for (const [personId, cents] of Object.entries(expense.allocations)) {
      if (!balances[personId]) balances[personId] = { paid: 0, share: 0, net: 0 };
      balances[personId].share += cents;
    }
  }
  for (const balance of Object.values(balances)) balance.net = balance.paid - balance.share;
  for (const transfer of event.settledTransfers ?? []) {
    if (balances[transfer.fromId]) balances[transfer.fromId].net += transfer.amountCents;
    if (balances[transfer.toId]) balances[transfer.toId].net -= transfer.amountCents;
  }
  return balances;
}

export type Settlement = { fromId: string; toId: string; amountCents: number };
export function eventSettlements(event: Event): Settlement[] {
  const balances = eventBalances(event);
  const debtors = Object.entries(balances).filter(([, value]) => value.net < 0).map(([id, value]) => ({ id, cents: -value.net })).sort((a, b) => b.cents - a.cents);
  const creditors = Object.entries(balances).filter(([, value]) => value.net > 0).map(([id, value]) => ({ id, cents: value.net })).sort((a, b) => b.cents - a.cents);
  const result: Settlement[] = [];
  let debtor = 0;
  let creditor = 0;
  while (debtor < debtors.length && creditor < creditors.length) {
    const amount = Math.min(debtors[debtor].cents, creditors[creditor].cents);
    if (amount > 0) result.push({ fromId: debtors[debtor].id, toId: creditors[creditor].id, amountCents: amount });
    debtors[debtor].cents -= amount;
    creditors[creditor].cents -= amount;
    if (debtors[debtor].cents === 0) debtor++;
    if (creditors[creditor].cents === 0) creditor++;
  }
  return result;
}

export function splitEqually(totalCents: number, memberIds: string[]) {
  const result: Record<string, number> = {};
  if (!memberIds.length) return result;
  const base = Math.floor(totalCents / memberIds.length);
  let remainder = totalCents - base * memberIds.length;
  memberIds.forEach((id) => {
    result[id] = base + (remainder > 0 ? 1 : 0);
    if (remainder > 0) remainder--;
  });
  return result;
}

export function splitByWeights(totalCents: number, weights: Record<string, number>) {
  const entries = Object.entries(weights).filter(([, value]) => value > 0);
  const totalWeight = entries.reduce((sum, [, value]) => sum + value, 0);
  if (!totalWeight) return {};
  const raw = entries.map(([id, weight]) => ({ id, exact: (totalCents * weight) / totalWeight }));
  const result: Record<string, number> = Object.fromEntries(raw.map(({ id, exact }) => [id, Math.floor(exact)]));
  const remainder = totalCents - Object.values(result).reduce((sum, value) => sum + value, 0);
  raw.sort((a, b) => (b.exact % 1) - (a.exact % 1));
  for (let i = 0; i < remainder; i++) result[raw[i % raw.length].id]++;
  return result;
}
