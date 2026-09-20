"use client";

import { useEffect, useRef, useState } from "react";
import { Archive, ArrowRight, CalendarDays, Check, CircleDollarSign, Cloud, CloudOff, MoreHorizontal, Plus, ReceiptText, RotateCcw, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import ExpenseDialog from "./expense-dialog";
import { Toaster } from "@/components/ui/sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EMPTY_STATE, eventBalances, eventPeople, eventSettlements, expensePayments, formatMoney, type AppState, type Event, type Expense, type Member, type Settlement, type SettledTransfer } from "@/lib/expense-types";

const today = () => new Date().toISOString().slice(0, 10);
const uid = () => crypto.randomUUID();
type SyncState = "loading" | "saved" | "saving" | "offline";
type WebTool = { name: string; title: string; description: string; inputSchema: object; annotations?: { readOnlyHint?: boolean; untrustedContentHint?: boolean }; execute: (input: unknown) => unknown | Promise<unknown> };
type WebModelContext = { registerTool: (tool: WebTool, options?: { signal?: AbortSignal }) => void | Promise<void> };

export default function ExpenseApp({ displayName }: { displayName: string }) {
  const [data, setData] = useState<AppState>(EMPTY_STATE);
  const [sync, setSync] = useState<SyncState>("loading");
  const [loadError, setLoadError] = useState("");
  const [needsDropbox, setNeedsDropbox] = useState(false);
  const versionRef = useRef("");
  const queueRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => { void loadState(); }, []);
  useEffect(() => {
    const context = (document as Document & { modelContext?: WebModelContext }).modelContext;
    if (!context?.registerTool || sync === "loading") return;
    const lifecycle = new AbortController();
    const summaryTool: WebTool = {
      name: "read_active_event_summary", title: "Consultar resumen del evento", description: "Devuelve el total y la liquidación pendiente del evento abierto.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute() {
        const current = data.events.find((event) => event.id === data.activeEventId) ?? data.events[0];
        if (!current) return { event: null };
        const names = Object.fromEntries(eventPeople(current).map((person) => [person.id, person.name]));
        return { event: current.name, totalCents: current.expenses.reduce((sum, expense) => sum + expense.amountCents, 0), settlements: eventSettlements(current).map((item) => ({ from: names[item.fromId], to: names[item.toId], amountCents: item.amountCents })) };
      },
    };
    void Promise.resolve(context.registerTool(summaryTool, { signal: lifecycle.signal })).catch(() => undefined);
    return () => lifecycle.abort();
  }, [data, sync]);

  async function loadState() {
    setSync("loading");
    try {
      const response = await fetch("/api/state", { cache: "no-store" });
      const body = await response.json();
      if (response.status === 401) { setNeedsDropbox(true); setSync("offline"); return; }
      if (!response.ok) throw new Error(body.error ?? "No se pudieron cargar los datos.");
      setNeedsDropbox(false);
      setData(body.state); versionRef.current = body.version; setLoadError(""); setSync("saved");
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "No se pudieron cargar los datos."); setSync("offline");
    }
  }
  function commit(next: AppState) {
    setData(next); setSync("saving");
    queueRef.current = queueRef.current.then(async () => {
      try {
        const response = await fetch("/api/state", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ state: next, version: versionRef.current }) });
        const body = await response.json();
        if (!response.ok) {
          if (response.status === 409) { setSync("offline"); toast.error("Hay cambios más recientes en otro dispositivo.", { description: "Tus cambios siguen visibles aquí. Recarga para ver la versión guardada." }); return; }
          throw new Error(body.error ?? "No se pudo guardar.");
        }
        versionRef.current = body.version; setSync("saved");
      } catch (error) { setSync("offline"); toast.error(error instanceof Error ? error.message : "No se pudo guardar el cambio."); }
    });
  }

  const active = data.events.find((event) => event.id === data.activeEventId) ?? data.events.find((event) => !event.archived) ?? data.events[0] ?? null;
  const activeEvents = data.events.filter((event) => !event.archived);
  const archivedEvents = data.events.filter((event) => event.archived);
  function updateActiveEvent(update: (event: Event) => Event) {
    if (!active) return;
    commit({ ...data, events: data.events.map((event) => event.id === active.id ? update(event) : event), activeEventId: active.id });
  }
  function archiveEvent(archived: boolean) {
    if (!active) return;
    const events = data.events.map((event) => event.id === active.id ? { ...event, archived } : event);
    const nextActive = archived ? events.find((event) => !event.archived && event.id !== active.id)?.id ?? active.id : active.id;
    commit({ events, activeEventId: nextActive });
  }
  function deleteEvent() {
    if (!active) return;
    const events = data.events.filter((event) => event.id !== active.id);
    commit({ events, activeEventId: events.find((event) => !event.archived)?.id ?? events[0]?.id ?? null });
  }

  if (sync === "loading") return <LoadingScreen />;
  if (needsDropbox) return <main className="grid min-h-dvh place-items-center bg-[#f4f7f5] p-6"><div className="max-w-sm rounded-3xl bg-white p-7 text-center shadow-lg"><Cloud className="mx-auto size-9 text-[#173f3a]" /><h1 className="mt-3 text-xl font-bold">Conecta Dropbox</h1><p className="mt-2 text-sm text-[#60736f]">Autoriza el acceso a la carpeta de esta aplicación para guardar y sincronizar tus cuentas.</p><Button asChild className="mt-5 bg-[#173f3a]"><a href="/api/auth/dropbox/start">Conectar Dropbox</a></Button></div></main>;
  if (loadError && !data.events.length) return <ErrorScreen message={loadError} retry={loadState} />;

  return <main className="min-h-dvh bg-[#f4f7f5] text-[#17332f]">
    <header className="sticky top-0 z-30 border-b border-[#173f3a]/10 bg-[#f4f7f5]/92 backdrop-blur-xl"><div className="mx-auto flex h-17 max-w-7xl items-center justify-between px-4 sm:px-7"><div className="flex items-center gap-3"><div className="grid size-10 place-items-center rounded-2xl bg-[#173f3a] text-[#f5be5b] shadow-sm"><CircleDollarSign className="size-6" /></div><div><p className="font-semibold leading-tight tracking-tight">Cuentas Compartidas</p><SyncLabel state={sync} /></div></div><div className="hidden text-right sm:block"><p className="text-sm font-medium">{displayName || "Tu cuenta"}</p><p className="text-xs text-[#60736f]">Datos privados y sincronizados</p></div></div></header>
    <div className="mx-auto grid max-w-7xl gap-6 px-4 py-5 sm:px-7 lg:grid-cols-[280px_minmax(0,1fr)] lg:py-8">
      <aside className="rounded-[26px] bg-[#173f3a] p-4 text-white shadow-[0_18px_50px_rgba(23,63,58,.14)] lg:min-h-[calc(100dvh-132px)]">
        <div className="flex items-center justify-between px-2 py-2"><p className="text-sm font-semibold text-white/70">MIS EVENTOS</p><NewEventDialog onCreate={(event) => commit({ events: [...data.events, event], activeEventId: event.id })} /></div>
        <EventButtons events={activeEvents} activeId={active?.id} select={(id) => commit({ ...data, activeEventId: id })} />
        {archivedEvents.length > 0 && <div className="mt-6 border-t border-white/10 pt-4"><p className="px-2 text-xs font-semibold uppercase tracking-wide text-white/45">Archivados</p><EventButtons events={archivedEvents} activeId={active?.id} select={(id) => commit({ ...data, activeEventId: id })} archived /></div>}
        {!data.events.length && <p className="px-2 py-8 text-sm leading-relaxed text-white/65">Crea tu primer evento para empezar a anotar gastos.</p>}
      </aside>
      <section className="min-w-0">{!active ? <EmptyHome onCreate={(event) => commit({ events: [event], activeEventId: event.id })} /> : <EventDashboard event={active} update={updateActiveEvent} onArchive={archiveEvent} onDelete={deleteEvent} />}</section>
    </div><Toaster position="top-center" richColors />
  </main>;
}

function EventButtons({ events, activeId, select, archived = false }: { events: Event[]; activeId?: string; select: (id: string) => void; archived?: boolean }) {
  return <div className="mt-2 flex gap-2 overflow-x-auto pb-1 lg:flex-col">{events.map((event) => { const total = event.expenses.reduce((sum, expense) => sum + expense.amountCents, 0); const selected = activeId === event.id; return <button key={event.id} onClick={() => select(event.id)} className={`min-w-[210px] rounded-2xl p-3 text-left transition lg:min-w-0 ${selected ? "bg-white text-[#173f3a] shadow-sm" : "bg-white/5 text-white hover:bg-white/10"} ${archived ? "opacity-75" : ""}`}><div className="flex items-start justify-between gap-3"><span className="font-semibold leading-snug">{event.name}</span>{selected && <Check className="mt-0.5 size-4 text-[#d89320]" />}</div><div className={`mt-2 flex items-center justify-between text-xs ${selected ? "text-[#60736f]" : "text-white/60"}`}><span>{event.members.length} personas</span><strong className={selected ? "text-[#173f3a]" : "text-white"}>{formatMoney(total)}</strong></div></button>; })}</div>;
}

function EventDashboard({ event, update, onArchive, onDelete }: { event: Event; update: (fn: (event: Event) => Event) => void; onArchive: (value: boolean) => void; onDelete: () => void }) {
  const balances = eventBalances(event); const settlements = eventSettlements(event); const people = eventPeople(event);
  const total = event.expenses.reduce((sum, expense) => sum + expense.amountCents, 0);
  const nameById = Object.fromEntries(people.map((person) => [person.id, person.name]));
  const regularIds = new Set(event.members.map((member) => member.id));
  return <>
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><div className="mb-2 flex items-center gap-2 text-sm text-[#60736f]"><CalendarDays className="size-4" />{new Date(`${event.date}T12:00:00`).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" })}{event.archived && <span className="rounded-full bg-[#dfe7e4] px-2 py-0.5 text-xs font-semibold">Archivado</span>}</div><h1 className="text-3xl font-bold tracking-[-.035em] text-[#173f3a] sm:text-4xl">{event.name}</h1></div><div className="flex flex-wrap gap-2"><MembersDialog event={event} update={update} /><ExpenseDialog event={event} onSave={(expense) => update((current) => ({ ...current, expenses: [expense, ...current.expenses] }))} /><EventActions event={event} onArchive={onArchive} onDelete={onDelete} /></div></div>
    <div className="mt-6 grid gap-3 sm:grid-cols-3"><Metric label="Gasto total" value={formatMoney(total)} strong /><Metric label="Movimientos" value={String(event.expenses.length)} /><Metric label="Participantes habituales" value={String(event.members.length)} /></div>
    <Tabs defaultValue="expenses" className="mt-7"><TabsList className="w-full justify-start overflow-x-auto rounded-xl bg-[#e4ebe8] p-1 sm:w-fit"><TabsTrigger value="expenses" className="px-4">Gastos</TabsTrigger><TabsTrigger value="balances" className="px-4">Saldos</TabsTrigger><TabsTrigger value="settle" className="px-4">Liquidación</TabsTrigger></TabsList>
      <TabsContent value="expenses" className="mt-4"><ExpenseList event={event} nameById={nameById} onEdit={(edited) => update((current) => ({ ...current, expenses: current.expenses.map((expense) => expense.id === edited.id ? edited : expense) }))} onDelete={(id) => update((current) => ({ ...current, expenses: current.expenses.filter((expense) => expense.id !== id) }))} /></TabsContent>
      <TabsContent value="balances" className="mt-4"><BalanceList people={people} balances={balances} regularIds={regularIds} /></TabsContent>
      <TabsContent value="settle" className="mt-4"><SettlementList settlements={settlements} completed={event.settledTransfers ?? []} nameById={nameById} regularIds={regularIds} hasExpenses={event.expenses.length > 0} onPaid={(settlement) => update((current) => ({ ...current, settledTransfers: [...(current.settledTransfers ?? []), { ...settlement, id: uid(), date: today() }] }))} /></TabsContent>
    </Tabs>
  </>;
}

function NewEventDialog({ onCreate }: { onCreate: (event: Event) => void }) {
  const [open, setOpen] = useState(false); const [name, setName] = useState(""); const [date, setDate] = useState(today()); const [members, setMembers] = useState("");
  function submit() { const names = members.split(/[,\n]/).map((value) => value.trim()).filter(Boolean); if (!name.trim() || names.length < 2) return toast.error("Indica un nombre y al menos dos participantes."); onCreate({ id: uid(), name: name.trim(), date, currency: "EUR", members: names.map((member) => ({ id: uid(), name: member, activeFrom: date })), expenses: [] }); setName(""); setMembers(""); setOpen(false); }
  return <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button size="sm" className="rounded-xl bg-[#f5be5b] text-[#173f3a] hover:bg-[#ffd071]"><Plus /> <span className="hidden sm:inline">Nuevo evento</span></Button></DialogTrigger><DialogContent className="rounded-3xl border-0 sm:max-w-md"><DialogHeader><DialogTitle>Crear un evento</DialogTitle><DialogDescription>La fecha será también el inicio de participación de los miembros iniciales.</DialogDescription></DialogHeader><div className="space-y-4"><Field label="Nombre"><Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Fin de semana en Teruel" /></Field><Field label="Fecha"><Input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></Field><Field label="Participantes"><textarea value={members} onChange={(event) => setMembers(event.target.value)} placeholder="Francisco, Ana, Carlos..." className="min-h-24 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-base outline-none focus:ring-2 focus:ring-[#2f7369]/30" /><p className="mt-1 text-xs text-[#71817e]">Sepáralos con comas o escribe uno por línea.</p></Field></div><DialogFooter><Button onClick={submit} className="bg-[#173f3a] hover:bg-[#245b54]">Crear evento</Button></DialogFooter></DialogContent></Dialog>;
}

function MembersDialog({ event, update }: { event: Event; update: (fn: (event: Event) => Event) => void }) {
  const [name, setName] = useState(""); const [from, setFrom] = useState(today()); const [open, setOpen] = useState(false);
  function updateMember(id: string, changes: Partial<Member>) { update((current) => ({ ...current, members: current.members.map((member) => member.id === id ? { ...member, ...changes } : member) })); }
  function add() { if (!name.trim()) return; update((current) => ({ ...current, members: [...current.members, { id: uid(), name: name.trim(), activeFrom: from }] })); setName(""); }
  return <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button variant="outline" className="rounded-xl border-[#173f3a]/15 bg-white"><Users /> Personas</Button></DialogTrigger><DialogContent className="max-h-[90dvh] overflow-y-auto rounded-3xl sm:max-w-xl"><DialogHeader><DialogTitle>Participantes habituales</DialogTitle><DialogDescription>Las fechas solo determinan quién aparece seleccionado en los gastos nuevos. No cambian los anteriores.</DialogDescription></DialogHeader><div className="space-y-3">{event.members.map((member) => <div className="rounded-xl bg-[#f0f4f2] p-3" key={member.id}><MemberName name={member.name} /><div className="mt-3 grid grid-cols-2 gap-3"><Field label="Participa desde"><Input type="date" value={member.activeFrom ?? ""} onChange={(event) => updateMember(member.id, { activeFrom: event.target.value || undefined })} /></Field><Field label="Participa hasta"><Input type="date" value={member.activeUntil ?? ""} onChange={(event) => updateMember(member.id, { activeUntil: event.target.value || undefined })} /></Field></div></div>)}</div><div className="rounded-xl border border-dashed border-[#173f3a]/20 p-3"><p className="mb-2 text-sm font-semibold">Incorporar otra persona</p><div className="grid gap-2 sm:grid-cols-[1fr_160px_auto]"><Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Nombre" /><Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /><Button onClick={add}>Añadir</Button></div></div></DialogContent></Dialog>;
}

function EventActions({ event, onArchive, onDelete }: { event: Event; onArchive: (value: boolean) => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  return <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button variant="outline" size="icon" className="rounded-xl border-[#173f3a]/15 bg-white" aria-label="Opciones del evento"><MoreHorizontal /></Button></DialogTrigger><DialogContent className="rounded-3xl sm:max-w-sm"><DialogHeader><DialogTitle>Opciones del evento</DialogTitle><DialogDescription>{event.name}</DialogDescription></DialogHeader><Button variant="outline" onClick={() => { onArchive(!event.archived); setOpen(false); }}>{event.archived ? <RotateCcw /> : <Archive />}{event.archived ? "Recuperar evento" : "Archivar evento"}</Button><AlertDialog><AlertDialogTrigger asChild><Button variant="destructive"><Trash2 /> Eliminar definitivamente</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>¿Eliminar “{event.name}”?</AlertDialogTitle><AlertDialogDescription>Se borrarán todos sus gastos, participantes y liquidaciones. Esta acción no se puede deshacer.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => { onDelete(); setOpen(false); }}>Eliminar evento</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></DialogContent></Dialog>;
}

function ExpenseList({ event, nameById, onEdit, onDelete }: { event: Event; nameById: Record<string, string>; onEdit: (expense: Expense) => void; onDelete: (id: string) => void }) {
  if (!event.expenses.length) return <InfoBox icon={<ReceiptText />} title="Todavía no hay gastos" text="Añade el primer pago cuando lo hagáis." />;
  return <div className="overflow-hidden rounded-[22px] border border-[#173f3a]/10 bg-white">{event.expenses.map((expense, index) => { const payers = Object.keys(expensePayments(expense)).map((id) => nameById[id]).filter(Boolean); return <div key={expense.id} className={`flex items-center gap-2 p-4 sm:gap-4 ${index ? "border-t border-[#173f3a]/8" : ""}`}><div className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#e6f0ed] text-[#2f7369]"><ReceiptText className="size-5" /></div><div className="min-w-0 flex-1"><p className="truncate font-semibold">{expense.title}</p><p className="truncate text-xs text-[#71817e]">{expense.category} · {payers.length > 1 ? "pagaron" : "pagó"} {payers.join(", ")} · {expense.splitLabel}</p></div><div className="text-right"><p className="font-bold tabular-nums">{formatMoney(expense.amountCents)}</p><p className="text-xs text-[#71817e]">{new Date(`${expense.date}T12:00:00`).toLocaleDateString("es-ES", { day: "numeric", month: "short" })}</p></div><div className="flex"><ExpenseDialog event={event} expense={expense} onSave={onEdit} /><Button variant="ghost" size="icon" aria-label={`Eliminar ${expense.title}`} onClick={() => { if (confirm(`¿Eliminar “${expense.title}”?`)) onDelete(expense.id); }} className="text-[#8a9693] hover:text-[#b1493f]"><Trash2 /></Button></div></div>; })}</div>;
}

function BalanceList({ people, balances, regularIds }: { people: ReturnType<typeof eventPeople>; balances: ReturnType<typeof eventBalances>; regularIds: Set<string> }) {
  return <div className="overflow-hidden rounded-[22px] border border-[#173f3a]/10 bg-white">{people.map((person, index) => { const value = balances[person.id] ?? { paid: 0, share: 0, net: 0 }; return <div key={person.id} className={`grid grid-cols-[1fr_auto] gap-4 p-4 sm:grid-cols-[1fr_120px_120px_135px] sm:items-center ${index ? "border-t border-[#173f3a]/8" : ""}`}><MemberName name={person.name} temporary={!regularIds.has(person.id)} /><SmallValue label="Pagó gastos" value={formatMoney(value.paid)} /><SmallValue label="Le corresponde" value={formatMoney(value.share)} /><div className="text-right"><p className={`font-bold ${value.net >= 0 ? "text-[#19705f]" : "text-[#b1493f]"}`}>{value.net > 0 ? "+" : ""}{formatMoney(value.net)}</p><p className="text-xs text-[#71817e]">{value.net > 0 ? "debe recibir" : value.net < 0 ? "debe pagar" : "saldado"}</p></div></div>; })}</div>;
}

function SettlementList({ settlements, completed, nameById, regularIds, hasExpenses, onPaid }: { settlements: Settlement[]; completed: SettledTransfer[]; nameById: Record<string, string>; regularIds: Set<string>; hasExpenses: boolean; onPaid: (settlement: Settlement) => void }) {
  if (!hasExpenses) return <InfoBox icon={<ReceiptText />} title="Añade algún gasto" text="La liquidación aparecerá cuando haya movimientos." />;
  return <div className="space-y-7">
    <section><h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-[#60736f]">Transferencias pendientes</h3>{settlements.length ? <div className="space-y-3">{settlements.map((item, index) => <div key={`${item.fromId}-${item.toId}-${index}`} className="rounded-[22px] border border-[#173f3a]/10 bg-white p-4"><div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3"><div><p className="font-semibold">{nameById[item.fromId]}{!regularIds.has(item.fromId) && <span className="ml-2 text-xs text-[#9a6a19]">Invitado</span>}</p><p className="text-xs text-[#71817e]">paga</p></div><div className="flex flex-col items-center"><strong className="text-lg text-[#b36b15]">{formatMoney(item.amountCents)}</strong><ArrowRight className="size-4 text-[#8a9693]" /></div><div className="text-right"><p className="font-semibold">{nameById[item.toId]}{!regularIds.has(item.toId) && <span className="ml-2 text-xs text-[#9a6a19]">Invitado</span>}</p><p className="text-xs text-[#71817e]">recibe</p></div></div><Button size="sm" variant="outline" className="mt-3 w-full" onClick={() => onPaid(item)}><Check /> Marcar transferencia como pagada</Button></div>)}</div> : <InfoBox icon={<Check />} title="Todo está saldado" text="No quedan transferencias pendientes." />}</section>
    {completed.length > 0 && <section><h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-[#60736f]">Transferencias realizadas</h3><div className="overflow-hidden rounded-[22px] border border-[#173f3a]/10 bg-white">{[...completed].reverse().map((item, index) => <div key={item.id} className={`grid grid-cols-[1fr_auto_1fr] items-center gap-3 p-4 ${index ? "border-t border-[#173f3a]/8" : ""}`}><div><p className="font-semibold">{nameById[item.fromId] ?? "Participante"}</p><p className="text-xs text-[#71817e]">pagó</p></div><div className="flex flex-col items-center"><strong className="text-[#19705f]">{formatMoney(item.amountCents)}</strong><Check className="size-4 text-[#19705f]" /></div><div className="text-right"><p className="font-semibold">{nameById[item.toId] ?? "Participante"}</p><p className="text-xs text-[#71817e]">{new Date(`${item.date}T12:00:00`).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" })}</p></div></div>)}</div></section>}
  </div>;
}

function EmptyHome({ onCreate }: { onCreate: (event: Event) => void }) { return <div className="grid min-h-[62dvh] place-items-center rounded-[28px] border border-dashed border-[#173f3a]/20 bg-white/60 p-8 text-center"><div className="max-w-md"><div className="mx-auto grid size-16 place-items-center rounded-[22px] bg-[#e3efeb] text-[#2f7369]"><ReceiptText className="size-8" /></div><h1 className="mt-5 text-3xl font-bold tracking-tight">Empecemos por el grupo</h1><p className="mt-2 leading-relaxed text-[#60736f]">Crea una comida, un viaje o una escapada y añade a las personas que compartirán los gastos.</p><div className="mt-6 inline-flex"><NewEventDialog onCreate={onCreate} /></div></div></div>; }
function LoadingScreen() { return <main className="grid min-h-dvh place-items-center bg-[#f4f7f5] text-[#173f3a]"><div className="text-center"><div className="mx-auto size-9 animate-spin rounded-full border-4 border-[#d7e3df] border-t-[#2f7369]" /><p className="mt-4 font-medium">Sincronizando tus cuentas…</p></div></main>; }
function ErrorScreen({ message, retry }: { message: string; retry: () => void }) { return <main className="grid min-h-dvh place-items-center bg-[#f4f7f5] p-6"><div className="max-w-sm rounded-3xl bg-white p-7 text-center shadow-lg"><CloudOff className="mx-auto size-9 text-[#b1493f]" /><h1 className="mt-3 text-xl font-bold">No hemos podido conectar</h1><p className="mt-2 text-sm text-[#60736f]">{message}</p><Button onClick={retry} className="mt-5 bg-[#173f3a]">Volver a intentar</Button></div></main>; }
function SyncLabel({ state }: { state: SyncState }) { return <p className="mt-0.5 flex items-center gap-1 text-xs text-[#60736f]">{state === "offline" ? <CloudOff className="size-3" /> : <Cloud className="size-3" />}{state === "saved" ? "Sincronizado" : state === "saving" ? "Guardando…" : state === "offline" ? "Sin conexión" : "Cargando…"}</p>; }
function Metric({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) { return <div className={`rounded-[22px] p-5 ${strong ? "bg-[#f5be5b] text-[#173f3a]" : "border border-[#173f3a]/10 bg-white"}`}><p className="text-sm opacity-65">{label}</p><p className="mt-1 text-2xl font-bold tracking-tight">{value}</p></div>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div><Label className="mb-1.5 block">{label}</Label>{children}</div>; }
function MemberName({ name, temporary = false }: { name: string; temporary?: boolean }) { return <div className="flex min-w-0 items-center gap-3"><span className={`grid size-9 shrink-0 place-items-center rounded-full text-sm font-bold ${temporary ? "bg-[#f5be5b] text-[#173f3a]" : "bg-[#173f3a] text-white"}`}>{name.slice(0, 1).toUpperCase()}</span><span className="truncate font-semibold">{name}{temporary && <span className="ml-2 text-xs font-medium text-[#9a6a19]">Invitado</span>}</span></div>; }
function SmallValue({ label, value }: { label: string; value: string }) { return <div className="hidden sm:block"><p className="text-xs text-[#71817e]">{label}</p><p className="font-semibold tabular-nums">{value}</p></div>; }
function InfoBox({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) { return <div className="rounded-[24px] border border-[#173f3a]/10 bg-white px-6 py-12 text-center"><div className="mx-auto grid size-11 place-items-center rounded-full bg-[#e5f0ed] text-[#2f7369]">{icon}</div><h2 className="mt-3 font-semibold">{title}</h2><p className="mt-1 text-sm text-[#71817e]">{text}</p></div>; }
