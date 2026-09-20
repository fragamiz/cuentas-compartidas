"use client";

import { useMemo, useRef, useState } from "react";
import { Pencil, Plus, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { activeMembers, expensePayments, formatMoney, splitByWeights, splitEqually, type Event, type Expense, type Guest, type ItemLine, type SpecialPart } from "@/lib/expense-types";

const categories = ["Comidas y bebidas", "Alojamiento", "Compras", "Combustible", "Peajes", "Aparcamiento", "Transporte", "Entradas y actividades", "Otros"];
const today = () => new Date().toISOString().slice(0, 10);
const uid = () => crypto.randomUUID();
const eurosToCents = (value: string) => Math.round(Number(value.replace(",", ".")) * 100);
const centsToInput = (value: number) => (value / 100).toFixed(2).replace(".", ",");

type SplitMode = "equal" | "shares" | "exact" | "items";
type SpecialDraft = { id: string; title: string; memberId: string; amount: string };
type ItemDraft = { id: string; title: string; memberId: string; amount: string };

function makeDraft(expense: Expense | undefined, event: Event) {
  if (!expense) {
    const date = today();
    const active = activeMembers(event, date);
    return {
      title: "", amount: "", date, category: categories[0], mode: "equal" as SplitMode,
      included: (active.length ? active : event.members).map((member) => member.id),
      values: {} as Record<string, string>, guests: [] as Guest[], specials: [] as SpecialDraft[], items: [] as ItemDraft[], payments: {} as Record<string, string>,
    };
  }
  const saved = expense.splitConfig;
  const included = saved?.included ?? Object.keys(expense.allocations);
  let mode: SplitMode = saved?.mode ?? "exact";
  if (!saved) {
    const amounts = included.map((id) => expense.allocations[id]);
    if (amounts.length && Math.max(...amounts) - Math.min(...amounts) <= 1) mode = "equal";
  }
  return {
    title: expense.title, amount: centsToInput(expense.amountCents), date: expense.date, category: expense.category, mode,
    included,
    values: saved ? Object.fromEntries(Object.entries(saved.values).map(([id, value]) => [id, mode === "exact" ? centsToInput(value) : String(value)])) : mode === "exact" ? Object.fromEntries(included.map((id) => [id, centsToInput(expense.allocations[id] ?? 0)])) : {},
    guests: expense.guests ?? [],
    specials: (saved?.specialParts ?? []).map((part) => ({ id: part.id, title: part.title, memberId: part.memberId, amount: centsToInput(part.amountCents) })),
    items: (saved?.items ?? []).map((item) => ({ id: item.id, title: item.title, memberId: item.memberId, amount: centsToInput(item.amountCents) })),
    payments: Object.fromEntries(Object.entries(expensePayments(expense)).map(([id, value]) => [id, centsToInput(value)])),
  };
}

export default function ExpenseDialog({ event, expense, onSave }: { event: Event; expense?: Expense; onSave: (expense: Expense) => void }) {
  const initial = makeDraft(expense, event);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(initial.title); const [amount, setAmount] = useState(initial.amount); const [date, setDate] = useState(initial.date); const [category, setCategory] = useState(initial.category);
  const [mode, setMode] = useState<SplitMode>(initial.mode); const [included, setIncluded] = useState(initial.included); const [values, setValues] = useState(initial.values);
  const [guests, setGuests] = useState(initial.guests); const [guestName, setGuestName] = useState(""); const [specials, setSpecials] = useState(initial.specials); const [items, setItems] = useState(initial.items); const [payments, setPayments] = useState(initial.payments);
  const paymentsTouched = useRef(Boolean(expense));

  const people = useMemo(() => [...event.members, ...guests], [event.members, guests]);
  const peopleById = useMemo(() => Object.fromEntries(people.map((person) => [person.id, person.name])), [people]);
  const totalCents = eurosToCents(amount);
  const specialParts: SpecialPart[] = specials.map((part) => ({ id: part.id, title: part.title.trim(), memberId: part.memberId, amountCents: eurosToCents(part.amount) }));
  const specialTotal = specialParts.reduce((sum, part) => sum + (Number.isFinite(part.amountCents) ? part.amountCents : 0), 0);
  const baseCents = totalCents - specialTotal;
  const itemLines: ItemLine[] = items.map((item) => ({ id: item.id, title: item.title.trim(), memberId: item.memberId, amountCents: eurosToCents(item.amount) }));
  const itemTotal = itemLines.reduce((sum, item) => sum + (Number.isFinite(item.amountCents) ? item.amountCents : 0), 0);
  const paymentValues = Object.fromEntries(Object.entries(payments).map(([id, value]) => [id, eurosToCents(value || "0")]).filter(([, value]) => value > 0));
  const paymentTotal = Object.values(paymentValues).reduce((sum, value) => sum + value, 0);

  const allocations = useMemo(() => {
    if (!(totalCents > 0)) return {} as Record<string, number>;
    if (mode === "items") {
      const result: Record<string, number> = {};
      itemLines.forEach((item) => { result[item.memberId] = (result[item.memberId] ?? 0) + item.amountCents; });
      return result;
    }
    if (baseCents < 0) return {} as Record<string, number>;
    let result: Record<string, number>;
    if (mode === "equal") result = splitEqually(baseCents, included);
    else if (mode === "shares") result = splitByWeights(baseCents, Object.fromEntries(included.map((id) => [id, Number(values[id] || 1)])));
    else result = Object.fromEntries(included.map((id) => [id, eurosToCents(values[id] || "0")]));
    specialParts.forEach((part) => { result[part.memberId] = (result[part.memberId] ?? 0) + part.amountCents; });
    return result;
  }, [totalCents, mode, baseCents, included, values, specials, items]);
  const allocationTotal = Object.values(allocations).reduce((sum, value) => sum + value, 0);

  function resetForm() {
    const next = makeDraft(expense, event);
    setTitle(next.title); setAmount(next.amount); setDate(next.date); setCategory(next.category); setMode(next.mode); setIncluded(next.included); setValues(next.values); setGuests(next.guests); setSpecials(next.specials); setItems(next.items); setPayments(next.payments); setGuestName(""); paymentsTouched.current = Boolean(expense);
  }
  function changeOpen(next: boolean) { if (next) resetForm(); setOpen(next); }
  function changeAmount(next: string) {
    setAmount(next);
    if (!paymentsTouched.current) {
      const defaultPayer = activeMembers(event, date)[0]?.id ?? event.members[0]?.id;
      if (defaultPayer) setPayments({ [defaultPayer]: next });
    }
  }
  function changeDate(next: string) {
    setDate(next);
    if (!expense) setIncluded([...activeMembers(event, next).map((member) => member.id), ...guests.map((guest) => guest.id)]);
  }
  function addGuest() {
    const name = guestName.trim();
    if (!name) return;
    const guest = { id: uid(), name };
    setGuests([...guests, guest]); setIncluded([...included, guest.id]); setGuestName("");
  }
  function removeGuest(id: string) {
    setGuests(guests.filter((guest) => guest.id !== id)); setIncluded(included.filter((personId) => personId !== id));
    const nextPayments = { ...payments }; delete nextPayments[id]; setPayments(nextPayments);
    setSpecials(specials.filter((part) => part.memberId !== id)); setItems(items.filter((item) => item.memberId !== id));
  }
  function submit() {
    if (!title.trim() || !(totalCents > 0)) return toast.error("Indica el concepto y el importe total.");
    if (paymentTotal !== totalCents) return toast.error(`Los pagos suman ${formatMoney(paymentTotal)} y deben sumar ${formatMoney(totalCents)}.`);
    if (mode === "items") {
      if (!items.length || itemLines.some((item) => !item.title || !item.memberId || !(item.amountCents > 0))) return toast.error("Completa todas las líneas del ticket.");
      if (itemTotal !== totalCents) return toast.error(`El desglose suma ${formatMoney(itemTotal)} y debe sumar ${formatMoney(totalCents)}.`);
    } else {
      if (!included.length) return toast.error("Selecciona al menos una persona para el reparto general.");
      if (specialParts.some((part) => !part.title || !part.memberId || !(part.amountCents > 0))) return toast.error("Completa todas las partes especiales.");
      if (baseCents < 0) return toast.error("Las partes especiales superan el importe total.");
      if (allocationTotal !== totalCents) return toast.error(`El reparto suma ${formatMoney(allocationTotal)} y debe sumar ${formatMoney(totalCents)}.`);
    }
    const valuesForStorage = mode === "exact" ? Object.fromEntries(included.map((id) => [id, eurosToCents(values[id] || "0")])) : mode === "shares" ? Object.fromEntries(included.map((id) => [id, Number(values[id] || 1)])) : {};
    const baseLabel = mode === "equal" ? "A partes iguales" : mode === "shares" ? "Por participaciones" : mode === "exact" ? "Importes exactos" : "Ticket desglosado";
    const splitLabel = mode !== "items" && specials.length ? `${baseLabel} + ${specials.length} ${specials.length === 1 ? "parte especial" : "partes especiales"}` : baseLabel;
    const payerId = Object.keys(paymentValues)[0] ?? expense?.payerId ?? event.members[0]?.id ?? "";
    onSave({
      id: expense?.id ?? uid(), title: title.trim(), amountCents: totalCents, date, category, payerId, payments: paymentValues, guests,
      allocations, splitLabel, splitConfig: { mode, included, values: valuesForStorage, specialParts: mode === "items" ? [] : specialParts, items: mode === "items" ? itemLines : [] },
    });
    setOpen(false);
  }

  return <Dialog open={open} onOpenChange={changeOpen}>
    <DialogTrigger asChild>{expense ? <Button variant="ghost" size="icon" aria-label={`Editar ${expense.title}`} className="text-[#48706a] hover:text-[#173f3a]"><Pencil /></Button> : <Button className="rounded-xl bg-[#173f3a] hover:bg-[#245b54]"><Plus /> Nuevo gasto</Button>}</DialogTrigger>
    <DialogContent className="max-h-[94dvh] overflow-y-auto rounded-3xl border-0 sm:max-w-2xl">
      <DialogHeader><DialogTitle>{expense ? "Editar gasto" : "Añadir gasto"}</DialogTitle><DialogDescription>Cada gasto conserva sus participantes y pagadores, aunque el grupo cambie después.</DialogDescription></DialogHeader>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Concepto"><Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Cena del sábado" /></Field>
        <Field label="Importe total"><MoneyInput value={amount} onChange={changeAmount} /></Field>
        <Field label="Categoría"><NativeSelect value={category} onChange={(event) => setCategory(event.target.value)} className="w-full">{categories.map((item) => <NativeSelectOption key={item}>{item}</NativeSelectOption>)}</NativeSelect></Field>
        <Field label="Fecha"><Input type="date" value={date} onChange={(event) => changeDate(event.target.value)} /></Field>
      </div>

      <Section title="Participantes temporales" description="Solo formarán parte de este gasto.">
        {guests.map((guest) => <div key={guest.id} className="mb-2 flex items-center justify-between rounded-xl bg-[#f4f7f5] px-3 py-2"><span className="font-medium">{guest.name}</span><Button variant="ghost" size="icon" onClick={() => removeGuest(guest.id)} aria-label={`Eliminar a ${guest.name}`}><X /></Button></div>)}
        <div className="flex gap-2"><Input value={guestName} onChange={(event) => setGuestName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") addGuest(); }} placeholder="Nombre del invitado" /><Button type="button" variant="outline" onClick={addGuest}><UserPlus /> Añadir</Button></div>
      </Section>

      <Section title="Quién pagó" description="Puede pagar una sola persona o varias. La suma debe coincidir con el total.">
        <div className="space-y-2">{people.map((person) => <div key={person.id} className="grid grid-cols-[1fr_120px] items-center gap-3 rounded-xl bg-[#f4f7f5] p-3"><PersonLabel name={person.name} temporary={guests.some((guest) => guest.id === person.id)} /><MoneyInput compact value={payments[person.id] ?? ""} onChange={(value) => { paymentsTouched.current = true; setPayments({ ...payments, [person.id]: value }); }} /></div>)}</div>
        <TotalCheck label="Total pagado" value={paymentTotal} expected={totalCents} />
      </Section>

      <Section title="A quién corresponde" description="Elige un reparto general o introduce cada línea del ticket.">
        <NativeSelect value={mode} onChange={(event) => setMode(event.target.value as SplitMode)} className="w-full">
          <NativeSelectOption value="equal">A partes iguales</NativeSelectOption><NativeSelectOption value="shares">Por participaciones</NativeSelectOption><NativeSelectOption value="exact">Importes exactos</NativeSelectOption><NativeSelectOption value="items">Desglosar el ticket</NativeSelectOption>
        </NativeSelect>
      </Section>

      {mode === "items" ? <Section title="Líneas del ticket" description="Introduce cada consumición y la persona a la que corresponde.">
        <div className="space-y-3">{items.map((item) => <div key={item.id} className="grid gap-2 rounded-xl bg-[#f4f7f5] p-3 sm:grid-cols-[1fr_105px_155px_auto]"><Input value={item.title} onChange={(event) => setItems(items.map((row) => row.id === item.id ? { ...row, title: event.target.value } : row))} placeholder="Bocadillo de fuet" /><MoneyInput compact value={item.amount} onChange={(value) => setItems(items.map((row) => row.id === item.id ? { ...row, amount: value } : row))} /><NativeSelect value={item.memberId} onChange={(event) => setItems(items.map((row) => row.id === item.id ? { ...row, memberId: event.target.value } : row))} className="w-full">{people.map((person) => <NativeSelectOption key={person.id} value={person.id}>{person.name}</NativeSelectOption>)}</NativeSelect><Button variant="ghost" size="icon" onClick={() => setItems(items.filter((row) => row.id !== item.id))} aria-label="Eliminar línea"><X /></Button></div>)}</div>
        <Button type="button" variant="outline" className="mt-3" onClick={() => setItems([...items, { id: uid(), title: "", amount: "", memberId: people[0]?.id ?? "" }])}><Plus /> Añadir consumición</Button>
        <TotalCheck label="Total del desglose" value={itemTotal} expected={totalCents} />
      </Section> : <>
        <Section title="Reparto general" description={specials.length ? `Se reparten ${formatMoney(Math.max(0, baseCents))}; las partes especiales suman ${formatMoney(specialTotal)}.` : "Selecciona las personas que participan en este gasto."}>
          <div className="space-y-2">{people.map((person) => { const checked = included.includes(person.id); return <div key={person.id} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-xl bg-[#f4f7f5] p-3"><Checkbox checked={checked} onCheckedChange={(value) => setIncluded(value ? [...included, person.id] : included.filter((id) => id !== person.id))} aria-label={`Incluir a ${person.name}`} /><PersonLabel name={person.name} temporary={guests.some((guest) => guest.id === person.id)} />{checked && mode !== "equal" ? <Input inputMode="decimal" className="h-9 w-24 text-right" value={values[person.id] ?? (mode === "shares" ? "1" : "")} onChange={(event) => setValues({ ...values, [person.id]: event.target.value })} placeholder={mode === "shares" ? "1" : "0,00"} /> : checked && totalCents > 0 ? <span className="text-sm font-semibold">{formatMoney(allocations[person.id] ?? 0)}</span> : null}</div>; })}</div>
        </Section>
        <Section title="Partes especiales" description="Consumos individuales o partes que una persona quiere asumir.">
          <div className="space-y-3">{specials.map((part) => <div key={part.id} className="grid gap-2 rounded-xl bg-[#f4f7f5] p-3 sm:grid-cols-[1fr_105px_155px_auto]"><Input value={part.title} onChange={(event) => setSpecials(specials.map((row) => row.id === part.id ? { ...row, title: event.target.value } : row))} placeholder="Vino" /><MoneyInput compact value={part.amount} onChange={(value) => setSpecials(specials.map((row) => row.id === part.id ? { ...row, amount: value } : row))} /><NativeSelect value={part.memberId} onChange={(event) => setSpecials(specials.map((row) => row.id === part.id ? { ...row, memberId: event.target.value } : row))} className="w-full">{people.map((person) => <NativeSelectOption key={person.id} value={person.id}>{person.name}</NativeSelectOption>)}</NativeSelect><Button variant="ghost" size="icon" onClick={() => setSpecials(specials.filter((row) => row.id !== part.id))} aria-label="Eliminar parte especial"><X /></Button></div>)}</div>
          <Button type="button" variant="outline" className="mt-3" onClick={() => setSpecials([...specials, { id: uid(), title: "", amount: "", memberId: people[0]?.id ?? "" }])}><Plus /> Añadir parte especial</Button>
          <TotalCheck label="Total asignado" value={allocationTotal} expected={totalCents} />
        </Section>
      </>}

      <DialogFooter><Button onClick={submit} className="bg-[#173f3a] hover:bg-[#245b54]">{expense ? "Guardar cambios" : "Guardar gasto"}</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div><Label className="mb-1.5 block">{label}</Label>{children}</div>; }
function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) { return <section className="rounded-2xl border border-[#173f3a]/12 p-3"><div className="mb-3"><h3 className="text-sm font-semibold">{title}</h3><p className="text-xs leading-relaxed text-[#61736f]">{description}</p></div>{children}</section>; }
function MoneyInput({ value, onChange, compact = false }: { value: string; onChange: (value: string) => void; compact?: boolean }) { return <div className="relative"><Input inputMode="decimal" value={value} onChange={(event) => onChange(event.target.value)} placeholder="0,00" className={`${compact ? "h-9" : "text-lg font-semibold"} pr-8 text-right`} /><span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-[#71817e]">€</span></div>; }
function PersonLabel({ name, temporary }: { name: string; temporary?: boolean }) { return <div className="min-w-0"><span className="font-medium">{name}</span>{temporary && <span className="ml-2 rounded-full bg-[#f5be5b]/35 px-2 py-0.5 text-[11px] font-semibold">Invitado</span>}</div>; }
function TotalCheck({ label, value, expected }: { label: string; value: number; expected: number }) { const matches = expected > 0 && value === expected; return <div className={`mt-3 flex items-center justify-between rounded-xl px-3 py-2 text-sm ${matches ? "bg-[#e5f3ee] text-[#19705f]" : "bg-[#fff4e2] text-[#9a5b0e]"}`}><span>{label}</span><strong>{formatMoney(value)} / {formatMoney(Number.isFinite(expected) ? expected : 0)}</strong></div>; }
