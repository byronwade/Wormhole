"use client";

import * as React from "react";
import { Archive, Check, Mail, Pin, Search, Trash2, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { GradientAvatar } from "@/components/ui/gradient-avatar";
import {
  useMessages,
  useMessagesActions,
  type Conversation,
  type ConversationFlag,
} from "@/lib/comms-store";

type Filter = "all" | "unread" | "starred";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "unread", label: "Unread" },
  { key: "starred", label: "Pinned" },
];

function formatRelative(at: number, now: number): string {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 60) return "now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

function matches(c: Conversation, q: string): boolean {
  const t = q.trim().toLowerCase();
  if (!t) return true;
  return (
    c.contact.name.toLowerCase().includes(t) ||
    c.contact.handle.toLowerCase().includes(t) ||
    c.lastMessage.toLowerCase().includes(t)
  );
}

function ConversationRow({
  c,
  now,
  active,
  selected,
  selectMode,
  onSelect,
  onToggleSelect,
}: {
  c: Conversation;
  now: number;
  active: boolean;
  selected: boolean;
  selectMode: boolean;
  onSelect: () => void;
  onToggleSelect: () => void;
}) {
  const { toggleFlag, archive, remove, markRead, markUnread } = useMessagesActions();
  const unread = c.unread > 0;
  const pinned = c.flags.includes("pinned");

  return (
    <div
      data-slot="conversation-row"
      data-active={active || undefined}
      className={cn(
        "group/row relative flex cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2 transition-colors",
        active ? "bg-accent" : "hover:bg-accent/60",
        !unread && !active && "opacity-70",
      )}
      onClick={onSelect}
    >
      <button
        type="button"
        aria-label={selected ? "Deselect conversation" : "Select conversation"}
        onClick={(e) => {
          e.stopPropagation();
          onToggleSelect();
        }}
        className={cn(
          "grid size-8 shrink-0 place-items-center rounded-full transition-opacity",
          selectMode || selected ? "opacity-100" : "opacity-0 group-hover/row:opacity-100",
        )}
      >
        {selected ? (
          <span className="grid size-6 place-items-center rounded-full bg-brand text-brand-foreground">
            <Check className="size-3.5" strokeWidth={3} />
          </span>
        ) : (
          <span className="size-6 rounded-full edge" />
        )}
      </button>

      {!selectMode && !selected ? (
        <GradientAvatar seed={c.contact.avatarSeed} size="md" className="-ml-8 group-hover/row:invisible" />
      ) : null}

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          {pinned ? <Pin className="size-3 shrink-0 text-muted-foreground" /> : null}
          <span className={cn("truncate text-[13px]", unread ? "font-semibold text-foreground" : "text-foreground")}>
            {c.contact.name}
          </span>
          <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">{formatRelative(c.updatedAt, now)}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <p className="min-w-0 flex-1 truncate text-[12px] text-muted-foreground">{c.lastMessage || "No messages yet"}</p>
          {unread ? <span role="img" aria-label={`${c.unread} unread`} className="size-2 shrink-0 rounded-full bg-brand" /> : null}
        </div>
      </div>

      {/* hover action pill */}
      <div className="absolute right-2 top-1.5 hidden items-center gap-0.5 rounded-full bg-card px-1 py-0.5 edge group-hover/row:flex">
        <RowAction label={pinned ? "Unpin" : "Pin"} onClick={() => toggleFlag(c.id, "pinned")}>
          <Pin className={cn("size-3.5", pinned && "fill-current")} />
        </RowAction>
        <RowAction label={unread ? "Mark read" : "Mark unread"} onClick={() => (unread ? markRead(c.id) : markUnread(c.id))}>
          <Mail className="size-3.5" />
        </RowAction>
        <RowAction label="Archive" onClick={() => archive(c.id)}>
          <Archive className="size-3.5" />
        </RowAction>
        <RowAction label="Delete" onClick={() => remove(c.id)}>
          <Trash2 className="size-3.5" />
        </RowAction>
      </div>
    </div>
  );
}

function RowAction({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="grid size-6 place-items-center rounded-full text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
    >
      {children}
    </button>
  );
}

/**
 * Conversation list for the Messages Cockpit — live search, All/Unread/Pinned
 * filters with counts, pinned section, bulk select + bulk actions, and rows with
 * hover actions. Reads/acts through `comms-store` (the swappable backend).
 */
export function ConversationList({ onSelect, className }: { onSelect?: (id: string) => void; className?: string }) {
  const { conversations, activeId } = useMessages();
  const { setActive, bulk, toggleFlag } = useMessagesActions();
  const [query, setQuery] = React.useState("");
  const [filter, setFilter] = React.useState<Filter>("all");
  const [selected, setSelected] = React.useState<Set<string>>(() => new Set());

  const now = React.useMemo(
    () => conversations.reduce((m, c) => Math.max(m, c.updatedAt), 0),
    [conversations],
  );
  const counts = React.useMemo(
    () => ({
      all: conversations.length,
      unread: conversations.filter((c) => c.unread > 0).length,
      starred: conversations.filter((c) => c.flags.includes("pinned")).length,
    }),
    [conversations],
  );
  const visible = React.useMemo(
    () =>
      conversations.filter((c) => {
        if (!matches(c, query)) return false;
        if (filter === "unread") return c.unread > 0;
        if (filter === "starred") return c.flags.includes("pinned");
        return !c.flags.includes("archived");
      }),
    [conversations, query, filter],
  );
  const pinned = visible.filter((c) => c.flags.includes("pinned"));
  const rest = visible.filter((c) => !c.flags.includes("pinned"));

  const selectMode = selected.size > 0;
  const toggleSelect = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const clearSelection = () => setSelected(new Set());
  const runBulk = (kind: "read" | "star" | "archive" | "delete") => {
    const ids = [...selected];
    if (kind === "read") bulk(ids, "read");
    else if (kind === "archive") bulk(ids, "archive");
    else if (kind === "delete") bulk(ids, "remove");
    else ids.forEach((id) => toggleFlag(id, "pinned"));
    clearSelection();
  };

  const select = (id: string) => {
    setActive(id);
    onSelect?.(id);
  };

  return (
    <div data-slot="conversation-list" className={cn("flex h-full min-h-0 flex-col gap-2 p-2", className)}>
      {/* search */}
      <label className="flex h-9 items-center gap-2 rounded-xl bg-muted px-3 text-[13px] text-muted-foreground edge">
        <Search className="size-4 shrink-0" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search conversations…"
          aria-label="Search conversations"
          className="w-full bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
        />
      </label>

      {/* filters */}
      <div className="flex items-center gap-1">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            aria-pressed={filter === f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              "flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-medium transition-colors",
              filter === f.key ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/60",
            )}
          >
            {f.label}
            <span className="tabular-nums opacity-60">{counts[f.key]}</span>
          </button>
        ))}
      </div>

      {/* bulk bar */}
      {selectMode ? (
        <div data-slot="bulk-bar" className="flex items-center gap-1 rounded-xl bg-accent px-2 py-1.5 text-[12px]">
          <span className="font-medium">{selected.size} selected</span>
          <div className="ml-auto flex items-center gap-0.5">
            <BulkBtn label="Mark read" onClick={() => runBulk("read")}><Mail className="size-3.5" /></BulkBtn>
            <BulkBtn label="Pin" onClick={() => runBulk("star")}><Pin className="size-3.5" /></BulkBtn>
            <BulkBtn label="Archive" onClick={() => runBulk("archive")}><Archive className="size-3.5" /></BulkBtn>
            <BulkBtn label="Delete" onClick={() => runBulk("delete")}><Trash2 className="size-3.5" /></BulkBtn>
            <BulkBtn label="Clear selection" onClick={clearSelection}><X className="size-3.5" /></BulkBtn>
          </div>
        </div>
      ) : null}

      {/* list */}
      <div className="min-h-0 flex-1 overflow-auto">
        {visible.length === 0 ? (
          <p className="px-3 py-8 text-center text-[13px] text-muted-foreground">No conversations match.</p>
        ) : (
          <>
            {pinned.length > 0 ? (
              <>
                <SectionHeader label="Pinned" count={pinned.length} />
                {pinned.map((c) => (
                  <ConversationRow key={c.id} c={c} now={now} active={c.id === activeId} selected={selected.has(c.id)} selectMode={selectMode} onSelect={() => select(c.id)} onToggleSelect={() => toggleSelect(c.id)} />
                ))}
              </>
            ) : null}
            {rest.length > 0 && pinned.length > 0 ? <SectionHeader label="All conversations" count={rest.length} /> : null}
            {rest.map((c) => (
              <ConversationRow key={c.id} c={c} now={now} active={c.id === activeId} selected={selected.has(c.id)} selectMode={selectMode} onSelect={() => select(c.id)} onToggleSelect={() => toggleSelect(c.id)} />
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function SectionHeader({ label, count }: { label: string; count: number }) {
  return (
    <div className="px-2.5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
      {label} <span className="text-muted-foreground/50">{count}</span>
    </div>
  );
}

function BulkBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="grid size-7 place-items-center rounded-full text-muted-foreground outline-none transition-colors hover:bg-background hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
    >
      {children}
    </button>
  );
}

export default ConversationList;
