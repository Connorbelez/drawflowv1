"use client";

import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  CalendarClock,
  ChevronRight,
  Clock3,
  FileUp,
  Link2,
  MessageCircle,
  MoreHorizontal,
  Paperclip,
  UserRound,
  X,
} from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";

import {
  type PrototypeVariant,
  PrototypeVariantSwitcher,
} from "#/components/prototype/PrototypeVariantSwitcher.tsx";
import { Avatar, AvatarFallback } from "#/components/ui/avatar.tsx";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Card, CardPanel } from "#/components/ui/card.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { cn } from "#/lib/utils.ts";
import {
  CollaborationRichTextEditor,
  type CollaborationTagOption,
} from "../CollaborationRichTextEditor.tsx";

/**
 * PROTOTYPE — THROWAWAY.
 * Three Action Item interface directions, switchable with ?variant=A|B|C on
 * /prototype/action-items. It is deliberately local-only and read-only.
 */

export type ActionItemPrototypeVariant = "A" | "B" | "C";

const VARIANTS = [
  { key: "A", name: "Work order ledger" },
  { key: "B", name: "Mission control" },
  { key: "C", name: "Workfront board" },
] as const satisfies readonly PrototypeVariant[];

const items = [
  { assignee: "MK", age: "4d", due: "Due tomorrow", id: "waterproof", status: "in_progress", tags: ["Schedule", "Envelope"], title: "Confirm waterproofing inspection window", unread: 3 },
  { assignee: "AL", age: "2d", due: "Blocked · permit revision", id: "permit", status: "blocked", tags: ["Permit", "Blocked"], title: "Submit revised framing permit", unread: 1 },
  { assignee: "JT", age: "7d", due: "Due Aug 8", id: "allowance", status: "todo", tags: ["Budget"], title: "Select kitchen allowance package", unread: 0 },
] as const;

const briefTagOptions: CollaborationTagOption[] = [
  { eyebrow: "Builder", id: "maya-kim", initials: "MK", kind: "participant", label: "Maya Kim", summary: "Build manager" },
  { eyebrow: "Contractor", id: "alex-lee", initials: "AL", kind: "participant", label: "Alex Lee", summary: "Site superintendent" },
  { eyebrow: "Action Item", id: "permit", kind: "action_item", label: "Submit revised framing permit", summary: "Blocked" },
  { eyebrow: "Document", id: "inspection-checklist", kind: "document", label: "Inspection checklist.pdf", summary: "Current checklist" },
];

export function isActionItemPrototypeVariant(
  value: unknown
): value is ActionItemPrototypeVariant {
  return value === "A" || value === "B" || value === "C";
}

export function ActionItemExperiencePrototype({
  onVariantChange,
  variant,
}: {
  onVariantChange: (variant: string) => void;
  variant: ActionItemPrototypeVariant;
}) {
  const [selectedId, setSelectedId] = useState("waterproof");
  const [sheetOpen, setSheetOpen] = useState(true);
  const [sheetHistory, setSheetHistory] = useState(["waterproof"]);
  const [sheetHistoryIndex, setSheetHistoryIndex] = useState(0);
  const selected = items.find((item) => item.id === selectedId) ?? items[0];
  const selectInSheet = (id: string) => {
    setSelectedId(id);
    setSheetHistory((previous) => [
      ...previous.slice(0, sheetHistoryIndex + 1),
      id,
    ]);
    setSheetHistoryIndex((previous) => previous + 1);
    setSheetOpen(true);
  };
  const navigateSheetHistory = (offset: -1 | 1) => {
    const nextIndex = sheetHistoryIndex + offset;
    const nextId = sheetHistory[nextIndex];
    if (!nextId) return;
    setSheetHistoryIndex(nextIndex);
    setSelectedId(nextId);
  };

  return (
    <main className="min-h-svh bg-muted/30 px-3 py-4 pb-28 text-foreground sm:px-5 lg:px-7">
      <div className="mx-auto flex max-w-[1560px] flex-col gap-4">
        <PrototypeHeader variant={variant} />
        {variant === "A" ? <LedgerVariant item={selected} /> : null}
        {variant === "B" ? (
          <WorkbenchVariant
            canGoBack={sheetHistoryIndex > 0}
            canGoForward={sheetHistoryIndex < sheetHistory.length - 1}
            onClose={() => setSheetOpen(false)}
            onGoBack={() => navigateSheetHistory(-1)}
            onGoForward={() => navigateSheetHistory(1)}
            onSelect={selectInSheet}
            open={sheetOpen}
            selected={selected}
          />
        ) : null}
        {variant === "C" ? (
          <WorkfrontVariant onSelect={setSelectedId} selected={selected} />
        ) : null}
      </div>
      <PrototypeVariantSwitcher current={variant} onChange={onVariantChange} variants={VARIANTS} />
    </main>
  );
}

function PrototypeHeader({ variant }: { variant: ActionItemPrototypeVariant }) {
  const question =
    variant === "A"
      ? "Does a creator-owned work order make the brief, constraints, and audit trail unmistakable?"
      : variant === "B"
        ? "Can the board remain the control plane while the selected Action Item stays in view?"
        : "Does a construction-first readiness lens make the next executable work obvious?";
  return (
    <Frame>
      <FramePanel className="flex flex-col gap-4 p-4 lg:flex-row lg:items-end lg:justify-between lg:p-5">
        <div>
          <div className="flex flex-wrap gap-2"><Badge variant="warning">Throwaway prototype</Badge><Badge variant="outline">Backoffice · Active Build</Badge></div>
          <h1 className="mt-3 font-semibold text-2xl tracking-tight">Action Items · 1480 St. Clair Ave W</h1>
          <p className="mt-1 text-muted-foreground text-sm">The Build Overview remains unchanged. This compares only the Action Item experience.</p>
        </div>
        <div className="max-w-xl rounded-lg border border-dashed bg-muted/40 px-3 py-2"><p className="font-medium text-xs">Question this variant answers</p><p className="mt-1 text-muted-foreground text-sm">{question}</p></div>
      </FramePanel>
    </Frame>
  );
}

function LedgerVariant({ item }: { item: (typeof items)[number] }) {
  return <Frame><FramePanel className="p-0"><div className="border-b px-4 py-3 text-sm"><span className="font-semibold">Action Items</span><span className="ml-2 text-muted-foreground">Work order detail</span></div><div className="grid lg:grid-cols-[17rem_minmax(0,1fr)]"><ControlRail item={item} /><div className="min-w-0 p-4 sm:p-6"><DetailHeader item={item} /><Brief /><Activity /></div></div></FramePanel></Frame>;
}

function WorkbenchVariant({ canGoBack, canGoForward, onClose, onGoBack, onGoForward, onSelect, open, selected }: { canGoBack: boolean; canGoForward: boolean; onClose: () => void; onGoBack: () => void; onGoForward: () => void; onSelect: (id: string) => void; open: boolean; selected: (typeof items)[number] }) {
  return <div><Frame><FramePanel className="p-4"><Board onSelect={onSelect} selectedId={selected.id} /></FramePanel></Frame>{open ? <aside aria-label="Action Item detail sheet" className="pointer-events-none fixed inset-y-3 right-3 z-40 w-[min(34vw,30rem)] min-w-[24rem]"><Frame className="pointer-events-auto h-full shadow-2xl"><FramePanel className="h-full overflow-y-auto p-4"><div className="sticky top-0 z-10 -mx-4 -mt-4 mb-4 flex items-center justify-between border-b bg-background px-4 py-3"><div><p className="font-semibold text-sm">Action Item</p><p className="text-muted-foreground text-xs">Non-modal detail sheet</p></div><div className="flex items-center gap-1"><Button aria-label="Previous Action Item" disabled={!canGoBack} onClick={onGoBack} size="icon-sm" type="button" variant="ghost"><ArrowLeft /></Button><Button aria-label="Next Action Item" disabled={!canGoForward} onClick={onGoForward} size="icon-sm" type="button" variant="ghost"><ArrowRight /></Button><Button aria-label="Close Action Item detail" onClick={onClose} size="icon-sm" type="button" variant="ghost"><X /></Button></div></div><DetailHeader item={selected} compact /><Brief /><DependencyPanel onOpenActionItem={onSelect} /><Activity /></FramePanel></Frame></aside> : null}</div>;
}

function WorkfrontVariant({ onSelect, selected }: { onSelect: (id: string) => void; selected: (typeof items)[number] }) {
  return <div className="space-y-4"><Frame><FramePanel className="flex flex-wrap items-center gap-3 p-3"><Badge variant="warning">2 blocked</Badge><Badge variant="destructive">1 overdue</Badge><Badge variant="info">3 assigned to you</Badge><p className="text-muted-foreground text-sm">Readiness is a filter, not a status: show the work that can move today.</p></FramePanel></Frame><Frame><FramePanel className="p-4"><Board onSelect={onSelect} selectedId={selected.id} /></FramePanel></Frame><Frame><FramePanel className="p-4"><DetailHeader item={selected} /><div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_19rem]"><div><Brief /><Activity /></div><DependencyPanel /></div></FramePanel></Frame></div>;
}

function Board({ onSelect, selectedId }: { onSelect: (id: string) => void; selectedId: string }) {
  const columns = [["To do", "todo"], ["In progress", "in_progress"], ["In review", "in_review"], ["Blocked", "blocked"], ["Done", "done"]] as const;
  return <><div className="mb-4 flex items-center justify-between"><div><p className="font-semibold text-sm">Workfront</p><p className="text-muted-foreground text-xs">Kanban is the default · List is remembered in browser state</p></div><Button size="sm" type="button">Add Action Item</Button></div><div className="grid min-w-[68rem] grid-cols-5 gap-3 overflow-x-auto">{columns.map(([label,status]) => <div key={status} className="rounded-xl border bg-muted/30 p-2"><p className="mb-2 px-1 font-medium text-xs">{label}</p><div className="space-y-2">{items.filter((item) => item.status === status).map((item) => <CompactCard item={item} key={item.id} onClick={() => onSelect(item.id)} selected={item.id === selectedId} />)}{status === "done" ? <div className="rounded-lg border border-dashed p-3 text-muted-foreground text-xs">No work completed today</div> : null}</div></div>)}</div></>;
}

function CompactCard({ item, onClick, selected }: { item: (typeof items)[number]; onClick: () => void; selected: boolean }) {
  return <button className={cn("w-full rounded-lg border bg-background p-3 text-left shadow-sm transition hover:border-foreground/30", selected && "ring-2 ring-primary/40")} onClick={onClick} type="button"><div className="flex justify-between gap-2"><p className="font-medium text-sm leading-5">{item.title}</p>{item.unread > 0 ? <Badge variant="info">{item.unread}</Badge> : null}</div><div className="mt-2 flex flex-wrap gap-1">{item.tags.map((tag) => <Badge key={tag} variant="outline">{tag}</Badge>)}</div><div className="mt-3 flex items-center justify-between text-muted-foreground text-xs"><span className="flex items-center gap-1"><Avatar className="size-5"><AvatarFallback>{item.assignee}</AvatarFallback></Avatar>{item.age}</span><span className={item.status === "blocked" ? "font-medium text-amber-700" : ""}>{item.due}</span></div></button>;
}

function DetailHeader({ compact = false, item }: { compact?: boolean; item: (typeof items)[number] }) {
  return <div className={cn("border-b pb-4", compact && "pb-3")}><div className="flex flex-wrap items-center gap-2"><Badge variant={item.status === "blocked" ? "warning" : "info"}>{item.status.replace("_", " ")}</Badge>{item.tags.map((tag) => <Badge key={tag} variant="outline">{tag}</Badge>)}<Button className="ml-auto" size="icon-sm" type="button" variant="ghost"><MoreHorizontal /></Button></div><h2 className="mt-3 font-semibold text-xl tracking-tight">{item.title}</h2><div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-muted-foreground text-sm"><span className="flex items-center gap-1"><UserRound className="size-4" />Assignee · {item.assignee}</span><span className="flex items-center gap-1"><Clock3 className="size-4" />Created {item.age} ago</span><span className="flex items-center gap-1"><CalendarClock className="size-4" />{item.due}</span></div>{item.status === "blocked" ? <div className="mt-3 flex gap-2 rounded-lg border border-amber-400/50 bg-amber-50 p-3 text-amber-950 text-sm"><AlertTriangle className="mt-0.5 size-4 shrink-0" />Permit revision is waiting on the architect’s stamped drawings.</div> : null}</div>;
}

function ControlRail({ item }: { item: (typeof items)[number] }) { return <aside className="border-b bg-muted/20 p-4 lg:border-r lg:border-b-0"><p className="font-semibold text-sm">Control rail</p><div className="mt-4 space-y-4 text-sm"><Meta label="Owner" value="Backoffice · creator" /><Meta label="Assignee" value={item.assignee} /><Meta label="Age" value={`${item.age} old`} /><Meta label="Due" value={item.due} /><DependencyPanel /></div></aside>; }
function Meta({ label, value }: { label: string; value: string }) { return <div><p className="text-muted-foreground text-xs">{label}</p><p className="mt-1 font-medium">{value}</p></div>; }
function Brief() {
  const [value, setValue] = useState("<p>Coordinate the waterproofing inspection before the foundation wall backfill. Confirm the inspector window with the municipality and ensure the contractor has the revised site access plan.</p><ul><li>Reference the latest inspection checklist.</li><li>Attach confirmation or explain the blocker.</li></ul>");
  return <section className="mt-5"><div><p className="font-semibold text-sm">Brief</p><p className="text-muted-foreground text-xs">Creator-owned · edit directly when permitted · use @ to reference people, Action Items, and files</p></div><div className="mt-3 rounded-xl border border-transparent bg-muted/55 p-4 transition-colors focus-within:border-ring focus-within:bg-muted/75"><CollaborationRichTextEditor ariaLabel="Action Item brief" editorMinHeightClass="min-h-36" onChange={(nextValue) => setValue(nextValue)} placeholder="Describe the work…" tagOptions={briefTagOptions} value={value} /><div className="mt-3 flex flex-wrap gap-2"><Badge variant="outline"><Paperclip className="mr-1 size-3" />Inspection checklist.pdf</Badge><Button size="sm" type="button" variant="ghost"><FileUp className="mr-1 size-3" />Upload</Button></div></div></section>;
}
function Activity() { return <section className="mt-6"><div className="flex items-center justify-between"><div><p className="font-semibold text-sm">Field activity</p><p className="text-muted-foreground text-xs">Comments, threads, mentions, workflow events, and assets</p></div><Button size="sm" type="button">Comment</Button></div><div className="mt-3 space-y-3 border-l pl-4"><Event who="Maya Kim" text="Moved this to In progress and requested the inspection window." time="18m" /><Event who="Alex Lee" text="The revised plan is being stamped. I will attach it here." time="1h" reply /><Event who="System" text="Dependency cleared: excavation completed." time="Yesterday" /></div></section>; }
function Event({ reply, text, time, who }: { reply?: boolean; text: string; time: string; who: string }) { return <div className={cn("relative", reply && "ml-4")}><span className="absolute -left-[1.32rem] top-1.5 size-2 rounded-full bg-muted-foreground/50" /><div className="flex gap-2"><MessageCircle className="mt-0.5 size-4 text-muted-foreground" /><div><p className="text-sm"><span className="font-medium">{who}</span> <span className="text-muted-foreground">{text}</span></p><p className="mt-1 text-muted-foreground text-xs">{time}</p></div></div></div>; }
function DependencyPanel({ onOpenActionItem }: { onOpenActionItem?: (id: string) => void }) { return <section className="mt-5"><div><p className="font-semibold text-sm">Dependencies</p><p className="text-muted-foreground text-xs">Done remains gated until predecessors resolve</p></div><div className="mt-2 divide-y border-y"><DependencyDisclosure icon={<Link2 className="size-3.5" />} items={[{ id: "permit", title: "Submit revised framing permit" }, { id: "allowance", title: "Select kitchen allowance package" }, { id: "waterproof", title: "Confirm inspection window" }]} label="Depends on" onOpenActionItem={onOpenActionItem} /><DependencyDisclosure icon={<ChevronRight className="size-3.5" />} items={[{ id: "allowance", title: "Select kitchen allowance package" }, { id: "permit", title: "Submit revised framing permit" }]} label="Unblocks" onOpenActionItem={onOpenActionItem} /></div></section>; }

function DependencyDisclosure({ icon, items, label, onOpenActionItem }: { icon: ReactNode; items: Array<{ id: string; title: string }>; label: string; onOpenActionItem?: (id: string) => void }) {
  return <details className="group"><summary className="flex cursor-pointer list-none items-center gap-2 py-2.5 text-sm marker:content-none"><span className="shrink-0 text-muted-foreground">{icon}</span><span className="shrink-0 text-muted-foreground">{label}</span><span className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">{items.map((item, index) => <Badge className={cn("shrink-0", index > 0 && "group-open:hidden")} key={item.id} variant="outline">{item.title}</Badge>)}{items.length > 1 ? <span className="shrink-0 text-muted-foreground group-open:hidden">…</span> : null}</span><ChevronRight className="size-3.5 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" /></summary><div className="max-h-32 overflow-y-auto border-t pb-2 pt-1.5"><div className="space-y-1">{items.map((item) => <div className="flex min-w-0 items-center gap-2 px-1 py-2" key={item.id}><span className="min-w-0 flex-1 truncate text-sm">{item.title}</span><Button aria-label={`Open ${item.title}`} className="shrink-0" onClick={() => onOpenActionItem?.(item.id)} size="icon-sm" type="button" variant="ghost"><ArrowUpRight /></Button><Button className="shrink-0" size="sm" type="button" variant="ghost">Remove</Button></div>)}</div><Button className="mt-1" size="sm" type="button" variant="ghost">+ Add {label.toLowerCase()} item</Button></div></details>;
}
