"use client";

import * as React from "react";
import { Check, ChevronRight, ChevronsLeftRight, Info, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { useChromeMorph } from "@/lib/use-chrome-morph";

const useIsoLayoutEffect =
  typeof window !== "undefined" ? React.useLayoutEffect : React.useEffect;

const EASE = "cubic-bezier(.22,1,.36,1)";

/**
 * A single navigable item in the dock. Mirrors a route/tab but stays generic —
 * the dock never knows about routing; the consumer wires `onSelect`/`href` and
 * the active/badge state.
 */
export interface MorphDockItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  onSelect?: () => void;
  href?: string;
  active?: boolean;
  core?: boolean;
  pinned?: boolean;
  badge?: number;
  /** Group key — a separator seam is drawn between adjacent items of differing groups. */
  group?: string;
}

/**
 * A toolbar action in the trailing two-tone "tool zone". Like a nav item, but it
 * reads as a tool (primary actions are brand-filled) rather than a destination.
 */
export interface MorphDockAction {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  onSelect?: () => void;
  href?: string;
  /** Accented (brand-filled) primary action. */
  primary?: boolean;
  /** Group key — a separator seam is drawn between adjacent actions of differing groups. */
  group?: string;
}

export type MorphDockStatusTone = "success" | "error" | "info";

/** A save/validation outcome the panel blooms into (success/error/info). */
export interface MorphDockStatus {
  tone: MorphDockStatusTone;
  title: string;
  message?: string;
}

export type MorphDockPlacement = "top" | "bottom" | "left" | "right";

/** Where, along the dock, the panel blooms from. */
export type MorphDockOrigin = "start" | "center" | "end";
export type MorphDockTone = "dock" | "surface";

export interface MorphDockProps {
  items: MorphDockItem[];
  expandable?: boolean;
  cluster?: React.ReactNode;
  action?: {
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    onSelect?: () => void;
  };
  /** Trailing two-tone tool zone (`bg-dock-tool`) — a combined nav + toolbar pill. */
  tools?: MorphDockAction[];
  /** Leading breadcrumb trail; the last crumb is the current page. */
  breadcrumb?: { label: string; href?: string }[];
  /**
   * A save/validation outcome the panel blooms into. Success/info auto-dismiss
   * after `statusDismissMs`; errors persist until dismissed.
   */
  status?: MorphDockStatus | null;
  /** Called when the status is dismissed (auto for success/info, or via its close). */
  onStatusDismiss?: () => void;
  /** Auto-dismiss delay (ms) for success/info status. Default 4000. Errors never auto-dismiss. */
  statusDismissMs?: number;
  /** Dark dock pill (default) or light surface — drives every token. */
  tone?: MorphDockTone;
  navLabel?: string;
  className?: string;

  /** Controlled morph — when open, the dock blooms into `children`. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** The panel the dock morphs into (a search, form, flow…). */
  children?: React.ReactNode;
  /** Title shown in the panel header (with the close / drag / save chrome). */
  panelTitle?: React.ReactNode;
  /** Renders a Save button in the panel header when provided. */
  onSave?: () => void;
  /** Open-panel width in px. Default 360. */
  panelWidth?: number;
  /** Open-panel height in px. Omit to size to content (bloom-down). */
  panelHeight?: number;
  growHeight?: boolean;
  /** Which way the panel blooms from the bar. Default "bottom". */
  placement?: MorphDockPlacement;
  /**
   * Where along the dock the panel grows from. A left-aligned dock blooms from
   * its `"start"`; a centered dock should bloom from `"center"` so it expands
   * symmetrically out of the middle. Default "start".
   */
  origin?: MorphDockOrigin;
  /** Detach the open panel and drag it free by its header (the dock pill stays). */
  draggable?: boolean;
  /** Show a corner grip to resize the open panel. */
  resizable?: boolean;
  /**
   * Drop the resting pill background/shadow — the items float bare until a panel
   * blooms (the bloomed panel keeps its surface). A "ghost" / no-pill dock.
   */
  bare?: boolean;
}

/** Every surface token is keyed by tone, so a light `surface` reads correctly. */
const TONES: Record<
  MorphDockTone,
  {
    shell: string;
    panel: string;
    idle: string;
    active: string;
    ring: string;
    action: string;
    title: string;
    close: string;
    badgeRing: string;
    pill: string;
    stroke: string;
    seam: string;
    tool: string;
    toolPrimary: string;
    toolQuiet: string;
    crumb: string;
    statusInfo: string;
  }
> = {
  dock: {
    shell: "bg-dock text-dock-foreground edge",
    panel: "bg-dock text-dock-foreground edge",
    idle: "text-dock-foreground hover:bg-dock-active hover:text-dock-active-foreground",
    active: "bg-dock-active text-dock-active-foreground",
    ring: "focus-visible:ring-white/30",
    action: "bg-dock-active text-dock-active-foreground",
    title: "text-dock-active-foreground",
    close: "text-dock-foreground hover:bg-dock-active hover:text-dock-active-foreground",
    badgeRing: "ring-dock",
    pill: "bg-dock-muted group-hover:bg-dock-active",
    stroke: "stroke-dock-foreground/55 group-hover/grip:stroke-dock-foreground",
    seam: "bg-dock-muted",
    tool: "bg-dock-tool",
    toolPrimary: "bg-brand text-brand-foreground",
    toolQuiet: "text-dock-foreground hover:bg-dock-active hover:text-dock-active-foreground",
    crumb: "text-dock-foreground/60",
    statusInfo: "bg-dock-active text-dock-active-foreground",
  },
  surface: {
    shell: "bg-card text-foreground edge",
    panel: "bg-card text-foreground edge",
    idle: "text-muted-foreground hover:bg-accent hover:text-foreground",
    active: "bg-accent text-foreground",
    ring: "focus-visible:ring-ring",
    action: "bg-accent text-foreground",
    title: "text-foreground",
    close: "text-muted-foreground hover:bg-accent hover:text-foreground",
    badgeRing: "ring-card",
    pill: "bg-muted group-hover:bg-accent",
    stroke: "stroke-muted-foreground/80 group-hover/grip:stroke-foreground",
    seam: "bg-border",
    tool: "bg-muted/60",
    toolPrimary: "bg-brand text-brand-foreground",
    toolQuiet: "text-muted-foreground hover:bg-accent hover:text-foreground",
    crumb: "text-muted-foreground",
    statusInfo: "bg-muted text-foreground",
  },
};

/**
 * Resize grip placement — the arc lives on the panel corner that faces the open
 * space (the bloom direction), exactly like SignalRoute's notifications panel:
 * top-right when the panel blooms up, bottom-right when it blooms down. `sx`/`sy`
 * flip the drag math so dragging *toward* the open space always grows the panel.
 */
const GRIP: Record<
  MorphDockPlacement,
  { pos: string; rotate: string; cursor: string; sx: number; sy: number }
> = {
  bottom: {
    pos: "bottom-0 right-0 translate-x-[calc(50%+3px)] translate-y-[calc(50%+3px)]",
    rotate: "rotate-90",
    cursor: "cursor-nwse-resize",
    sx: 1,
    sy: 1,
  },
  top: {
    pos: "top-0 right-0 translate-x-[calc(50%+3px)] -translate-y-[calc(50%+3px)]",
    rotate: "",
    cursor: "cursor-nesw-resize",
    sx: 1,
    sy: -1,
  },
  right: {
    pos: "bottom-0 right-0 translate-x-[calc(50%+3px)] translate-y-[calc(50%+3px)]",
    rotate: "rotate-90",
    cursor: "cursor-nwse-resize",
    sx: 1,
    sy: 1,
  },
  left: {
    pos: "bottom-0 left-0 -translate-x-[calc(50%+3px)] translate-y-[calc(50%+3px)]",
    rotate: "rotate-180",
    cursor: "cursor-nesw-resize",
    sx: -1,
    sy: 1,
  },
};

/** Which edge of the dock the panel pins to along the bloom direction. */
const MAIN_ANCHOR: Record<MorphDockPlacement, string> = {
  bottom: "top-0",
  top: "bottom-0",
  right: "left-0",
  left: "right-0",
};

/**
 * Cross-axis anchor: pins the panel to the start/center/end of the dock so the
 * morph grows from that point. A centered dock uses `"center"`, which pins the
 * panel to the bar's midpoint and lets it expand symmetrically in both directions.
 */
function crossAnchor(placement: MorphDockPlacement, origin: MorphDockOrigin): string {
  const horizontal = placement === "bottom" || placement === "top";
  if (horizontal) {
    if (origin === "center") return "left-1/2 -translate-x-1/2";
    if (origin === "end") return "right-0";
    return "left-0";
  }
  if (origin === "center") return "top-1/2 -translate-y-1/2";
  if (origin === "end") return "bottom-0";
  return "top-0";
}

function isVisible(item: MorphDockItem, expanded: boolean): boolean {
  return expanded || !!item.core || !!item.pinned || !!item.active;
}

const PILL =
  "relative flex size-8 shrink-0 items-center justify-center rounded-full outline-none transition-colors focus-visible:ring-2";

/** A thin vertical divider drawn between groups of items/actions. */
const SEAM = "mx-0.5 h-5 w-px shrink-0 self-center";

function DockItem({
  item,
  collapsed,
  t,
}: {
  item: MorphDockItem;
  collapsed: boolean;
  t: (typeof TONES)[MorphDockTone];
}) {
  const Icon = item.icon;
  const hasBadge = typeof item.badge === "number" && item.badge > 0;

  const inner = (
    <>
      <Icon className="size-4 shrink-0" />
      <span className="sr-only">{item.label}</span>
      {hasBadge ? (
        <span
          aria-hidden
          className={cn("absolute right-1 top-1 size-2 rounded-full bg-brand ring-2", t.badgeRing)}
        />
      ) : null}
    </>
  );

  const className = cn(PILL, t.ring, item.active ? t.active : t.idle);
  const onClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    item.onSelect?.();
  };

  const content =
    item.href !== undefined ? (
      <a
        href={item.href}
        title={item.label}
        aria-label={item.label}
        aria-current={item.active ? "page" : undefined}
        onClick={onClick}
        className={className}
      >
        {inner}
      </a>
    ) : (
      <button
        type="button"
        title={item.label}
        aria-label={item.label}
        aria-current={item.active ? "page" : undefined}
        onClick={onClick}
        className={className}
      >
        {inner}
      </button>
    );

  return (
    <div
      className={cn(
        "flex shrink-0 items-center overflow-hidden",
        "transition-[width,opacity,transform] duration-300 ease-[cubic-bezier(.22,1,.36,1)] motion-reduce:transition-none",
        collapsed ? "w-0 scale-50 opacity-0" : "w-8 scale-100 opacity-100",
      )}
      aria-hidden={collapsed}
    >
      {content}
    </div>
  );
}

/** A single action in the trailing two-tone tool zone (quiet, or brand `primary`). */
function ToolAction({
  action,
  t,
}: {
  action: MorphDockAction;
  t: (typeof TONES)[MorphDockTone];
}) {
  const Icon = action.icon;
  const cls = cn(
    "flex h-8 shrink-0 items-center gap-2 rounded-full px-3 text-[13px] font-semibold outline-none transition-colors focus-visible:ring-2",
    t.ring,
    action.primary ? t.toolPrimary : t.toolQuiet,
  );
  const inner = (
    <>
      <Icon className="size-4 shrink-0" />
      {action.label}
    </>
  );
  return action.href !== undefined ? (
    <a href={action.href} aria-label={action.label} className={cls}>
      {inner}
    </a>
  ) : (
    <button
      type="button"
      aria-label={action.label}
      onClick={(e) => {
        e.stopPropagation();
        action.onSelect?.();
      }}
      className={cls}
    >
      {inner}
    </button>
  );
}

/** The tone-styled status body the panel blooms into (success / error / info). */
function StatusBody({
  status,
  t,
  onClose,
}: {
  status: MorphDockStatus;
  t: (typeof TONES)[MorphDockTone];
  onClose: () => void;
}) {
  return (
    <div className="flex w-full items-start gap-3 p-3.5">
      <span
        className={cn(
          "mt-0.5 grid size-9 shrink-0 place-items-center rounded-full",
          status.tone === "success" && "bg-brand text-brand-foreground",
          status.tone === "error" && "bg-destructive text-destructive-foreground",
          status.tone === "info" && t.statusInfo,
        )}
      >
        {status.tone === "error" ? (
          <X className="size-4.5" strokeWidth={2.75} />
        ) : status.tone === "info" ? (
          <Info className="size-4.5" strokeWidth={2.5} />
        ) : (
          <Check className="size-4.5" strokeWidth={3} />
        )}
      </span>

      <div className="min-w-0 flex-1 pt-0.5">
        <div className={cn("text-[13px] font-semibold", t.title)}>{status.title}</div>
        {status.message ? (
          <p className={cn("mt-0.5 text-[12px] leading-snug", t.crumb)}>{status.message}</p>
        ) : null}
      </div>

      <button
        type="button"
        onClick={onClose}
        aria-label="Dismiss"
        className={cn(
          "-mr-0.5 -mt-0.5 grid size-6 shrink-0 place-items-center rounded-lg transition-colors",
          t.close,
        )}
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}

/**
 * Config-driven morphing navigation dock. The item row morphs compact ↔ full,
 * and a consumer `children` panel **blooms out of the pill** via the shared
 * `useChromeMorph` hook, then shrinks cleanly back. The panel can bloom in any
 * direction (`placement`), **detach + drag free** (`draggable` — the dock pill
 * stays put once you drag the panel away), and resize from a corner grip
 * (`resizable`); a header carries the drag handle, an optional title, an
 * optional Save (`onSave`), and a close button. Every token is tone-keyed (dark
 * `dock` or light `surface`); reduced-motion, Esc, and click-away handled.
 */
export function MorphDock({
  items,
  expandable = true,
  cluster,
  action,
  tools,
  breadcrumb,
  status,
  onStatusDismiss,
  statusDismissMs = 4000,
  tone = "dock",
  navLabel = "Primary",
  className,
  open: openProp,
  onOpenChange,
  children,
  panelTitle,
  onSave,
  panelWidth = 360,
  panelHeight,
  growHeight = true,
  placement = "bottom",
  origin = "start",
  draggable = false,
  resizable = false,
  bare = false,
}: MorphDockProps) {
  const t = TONES[tone];
  const [expanded, setExpanded] = React.useState(false);
  const [openUncontrolled, setOpenUncontrolled] = React.useState(false);
  const open = openProp ?? openUncontrolled;
  const setOpen = React.useCallback(
    (v: boolean) => {
      setOpenUncontrolled(v);
      onOpenChange?.(v);
    },
    [onOpenChange],
  );

  // Has the panel been dragged free of the dock? While detached the pill returns.
  const [detached, setDetached] = React.useState(false);
  const [size, setSize] = React.useState<{ w: number; h: number } | null>(null);
  // The morph box carries the panel surface (bg/border/shadow) so a SOLID box
  // blooms out of the pill — no flash of empty space while content fades in.
  // Held on through the close shrink, then dropped so nothing shows at rest.
  const [surfaceOn, setSurfaceOn] = React.useState(false);

  const rootRef = React.useRef<HTMLDivElement>(null);
  const dragWrapRef = React.useRef<HTMLDivElement>(null);
  const morphRef = React.useRef<HTMLDivElement>(null);
  const barRef = React.useRef<HTMLDivElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const dragRef = React.useRef({ x: 0, y: 0 });

  const hasStatus = status != null;
  // The overlay exists for consumer children OR a status bloom.
  const hasPanel = children != null || hasStatus;
  const morphOpen = (open && children != null) || hasStatus;
  // A status has no persistent `children` to keep the overlay mounted, so on
  // dismiss it would vanish instantly. Retain the last status and render it
  // while the close shrink plays (tracked by `surfaceOn`), so it animates home.
  const lastStatusRef = React.useRef(status);
  if (status != null) lastStatusRef.current = status;
  const overlayStatus = status ?? (surfaceOn ? lastStatusRef.current : null);
  // Keep the overlay (and morph element) mounted through the close shrink.
  const showOverlay = children != null || morphOpen || surfaceOn;
  // The panel sits over the pill (pill faded) only when open AND not torn off.
  const inPlace = morphOpen && !detached;
  // The status body carries its own dismiss, so it never renders the drag/save header.
  const hasHeader = overlayStatus == null && (draggable || panelTitle != null || onSave != null);

  const panelW = size?.w ?? panelWidth;
  const panelH = size?.h ?? panelHeight;

  // The panel blooms OUT of the pill's box (and shrinks back into it).
  const barBox = React.useCallback(
    () => (barRef.current ? { w: barRef.current.offsetWidth, h: barRef.current.offsetHeight } : null),
    [],
  );

  useChromeMorph({
    morphRef,
    panelRef,
    open: morphOpen,
    growHeight,
    width: () => panelW,
    height: panelH != null ? () => panelH : undefined,
    collapsedFrom: barBox,
    deps: [open, hasPanel, panelW, panelH],
  });

  // The hook fades the panel IN on open; on close fade it OUT fast (faster than
  // the box shrink) so the content never reads as text/colour clipping inward —
  // the box then collapses as a clean surface. Also fly a dragged panel home.
  useIsoLayoutEffect(() => {
    if (morphOpen) return;
    if (panelRef.current) {
      panelRef.current.style.transitionDelay = "0ms";
      panelRef.current.style.opacity = "0";
    }
    const wrap = dragWrapRef.current;
    if (wrap && (dragRef.current.x !== 0 || dragRef.current.y !== 0)) {
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      wrap.style.transition = reduce ? "none" : `transform 240ms ${EASE}`;
      wrap.style.transform = "";
      dragRef.current = { x: 0, y: 0 };
    }
  });

  React.useEffect(() => {
    if (!open) {
      setSize(null);
      setDetached(false);
    }
  }, [open]);

  // Paint the surface as soon as the box opens; hold it through the close shrink
  // (matches the 220ms morph) so the solid box visibly collapses back into the pill.
  React.useEffect(() => {
    if (morphOpen) {
      setSurfaceOn(true);
      return;
    }
    if (!surfaceOn) return;
    const id = window.setTimeout(() => setSurfaceOn(false), 240);
    return () => window.clearTimeout(id);
  }, [morphOpen, surfaceOn]);

  // Success/info status auto-dismiss after a beat; errors stay until dismissed.
  React.useEffect(() => {
    if (!status || status.tone === "error") return;
    const id = window.setTimeout(() => onStatusDismiss?.(), statusDismissMs);
    return () => window.clearTimeout(id);
  }, [status, statusDismissMs, onStatusDismiss]);

  React.useEffect(() => {
    if (!open || !hasPanel) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open, hasPanel, setOpen]);

  // Free drag — transform lives on the wrapper (not the morph) so the size morph
  // and the drag never fight. Tearing off restores the pill (`detached`).
  const onDragStart = (e: React.PointerEvent) => {
    if (!draggable) return;
    e.preventDefault();
    setDetached(true);
    const sx = e.clientX;
    const sy = e.clientY;
    const orig = { ...dragRef.current };
    const wrap = dragWrapRef.current;
    if (wrap) wrap.style.transition = "none";
    const move = (ev: PointerEvent) => {
      dragRef.current = { x: orig.x + (ev.clientX - sx), y: orig.y + (ev.clientY - sy) };
      if (wrap) wrap.style.transform = `translate(${dragRef.current.x}px, ${dragRef.current.y}px)`;
    };
    const up = () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
    };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
  };

  // Corner resize — adjusts the panel box; the hook follows via `size` in deps.
  const onResizeStart = (e: React.PointerEvent) => {
    if (!resizable) return;
    e.preventDefault();
    e.stopPropagation();
    const sx = e.clientX;
    const sy = e.clientY;
    const sw = panelW;
    const sh = panelRef.current?.offsetHeight ?? panelHeight ?? 240;
    const grip = GRIP[placement];
    const move = (ev: PointerEvent) => {
      setSize({
        w: Math.max(240, Math.round(sw + grip.sx * (ev.clientX - sx))),
        h: Math.max(140, Math.round(sh + grip.sy * (ev.clientY - sy))),
      });
    };
    const up = () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
    };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
  };

  const stop = (e: React.PointerEvent) => e.stopPropagation();

  const mainItems = items.filter((i) => !i.pinned);
  const pinnedItems = items.filter((i) => i.pinned);
  const hasCollapsible = items.some((i) => !i.core && !i.pinned);
  const showToggle = expandable && hasCollapsible;
  const ActionIcon = action?.icon;

  // Interleave a seam between adjacent VISIBLE items whose group differs.
  const renderItems = (list: MorphDockItem[]) =>
    list.map((item, i) => {
      const prev = list[i - 1];
      const boundary =
        prev !== undefined &&
        prev.group !== item.group &&
        isVisible(prev, expanded) &&
        isVisible(item, expanded);
      return (
        <React.Fragment key={item.id}>
          {boundary ? (
            <span aria-hidden data-slot="morph-dock-seam" className={cn(SEAM, t.seam)} />
          ) : null}
          <DockItem item={item} collapsed={!isVisible(item, expanded)} t={t} />
        </React.Fragment>
      );
    });

  return (
    <div ref={rootRef} className={cn("relative inline-flex", className)}>
      {/* PILL — always present (the dock footprint). Fades only while a panel
          sits over it in place; it returns the moment the panel is torn off. */}
      <div
        ref={barRef}
        className={cn(
          "flex items-center gap-1 rounded-full p-[3px] transition-opacity duration-150",
          bare ? "" : t.shell,
          inPlace && "pointer-events-none opacity-0",
        )}
      >
        {breadcrumb && breadcrumb.length > 0 ? (
          <div data-slot="morph-dock-breadcrumb" className="flex h-8 min-w-0 items-center gap-1 px-2.5">
            {breadcrumb.map((c, i) => {
              const last = i === breadcrumb.length - 1;
              return (
                <React.Fragment key={`${c.label}-${i}`}>
                  {i > 0 ? (
                    <ChevronRight aria-hidden className={cn("size-3.5 shrink-0", t.crumb)} />
                  ) : null}
                  {last || c.href === undefined ? (
                    <span
                      aria-current={last ? "page" : undefined}
                      className={cn("truncate text-[13px] font-semibold", last ? t.title : t.crumb)}
                    >
                      {c.label}
                    </span>
                  ) : (
                    <a
                      href={c.href}
                      className={cn("truncate text-[13px] font-medium hover:underline", t.crumb)}
                    >
                      {c.label}
                    </a>
                  )}
                </React.Fragment>
              );
            })}
          </div>
        ) : null}

        <nav aria-label={navLabel} className="flex items-center gap-1">
          {renderItems(mainItems)}

          {showToggle ? (
            <button
              type="button"
              aria-expanded={expanded}
              aria-label={expanded ? "Show fewer" : "Show all"}
              title={expanded ? "Show fewer" : "Show all"}
              onClick={(e) => {
                e.stopPropagation();
                setExpanded((v) => !v);
              }}
              className={cn(PILL, t.ring, expanded ? t.active : t.idle)}
            >
              <ChevronsLeftRight className="size-4 shrink-0" />
              <span className="sr-only">{expanded ? "Show fewer" : "Show all"}</span>
            </button>
          ) : null}

          {renderItems(pinnedItems)}
        </nav>

        {tools && tools.length > 0 ? (
          <div
            data-slot="morph-dock-tools"
            className={cn(
              "-my-[3px] flex shrink-0 items-center gap-1 self-stretch px-1.5",
              t.tool,
              !cluster && !action ? "-mr-[3px] rounded-r-full pr-[7px]" : "rounded-xl",
            )}
          >
            {tools.map((a, i) => {
              const prev = tools[i - 1];
              const boundary = prev !== undefined && prev.group !== a.group;
              return (
                <React.Fragment key={a.id}>
                  {boundary ? (
                    <span aria-hidden data-slot="morph-dock-seam" className={cn(SEAM, t.seam)} />
                  ) : null}
                  <ToolAction action={a} t={t} />
                </React.Fragment>
              );
            })}
          </div>
        ) : null}

        {cluster ? <div className="flex shrink-0 items-center">{cluster}</div> : null}

        {action && ActionIcon ? (
          <button
            type="button"
            aria-haspopup={hasPanel ? "dialog" : undefined}
            aria-expanded={hasPanel ? open : undefined}
            onClick={(e) => {
              e.stopPropagation();
              if (hasPanel) setOpen(true);
              action.onSelect?.();
            }}
            className={cn(
              "ml-1 flex h-8 shrink-0 items-center gap-2 rounded-full px-3 text-[13px] font-semibold outline-none transition-colors focus-visible:ring-2",
              t.ring,
              t.action,
            )}
          >
            <ActionIcon className="size-4 shrink-0" />
            {action.label}
          </button>
        ) : null}
      </div>

      {/* PANEL — an overlay that blooms out of the pill and can be dragged free. */}
      {showOverlay ? (
        <div
          className={cn(
            "absolute z-10",
            MAIN_ANCHOR[placement],
            crossAnchor(placement, origin),
            !morphOpen && "pointer-events-none",
          )}
        >
          <div ref={dragWrapRef} className="relative">
            <div
              ref={morphRef}
              className={cn(
                "overflow-hidden transition-[border-radius] duration-200",
                morphOpen ? "rounded-4xl" : "rounded-full",
                surfaceOn && t.panel,
              )}
            >
              <div
                ref={panelRef}
                role="dialog"
                aria-label={typeof panelTitle === "string" ? panelTitle : (action?.label ?? "Panel")}
                aria-hidden={!open && !hasStatus}
                style={{ width: panelW, height: panelH }}
                className={cn(
                  "group flex flex-col rounded-4xl opacity-0 transition-opacity duration-100 outline-none",
                  panelH != null && "overflow-hidden",
                  open || hasStatus ? "pointer-events-auto" : "pointer-events-none",
                )}
              >
                {hasHeader ? (
                  <div
                    onPointerDown={draggable ? onDragStart : undefined}
                    className={cn(
                      "relative flex shrink-0 items-center gap-1.5 px-2 pb-1.5",
                      draggable ? "cursor-grab touch-none select-none pt-3 active:cursor-grabbing" : "pt-1.5",
                    )}
                  >
                    {draggable ? (
                      <span
                        aria-hidden
                        className={cn(
                          "pointer-events-none absolute left-1/2 top-1 h-1 w-9 -translate-x-1/2 rounded-full transition-colors",
                          t.pill,
                        )}
                      />
                    ) : null}
                    {panelTitle != null ? (
                      <span className={cn("min-w-0 flex-1 truncate px-1 text-[13px] font-semibold", t.title)}>
                        {panelTitle}
                      </span>
                    ) : (
                      <span className="flex-1" />
                    )}
                    {onSave ? (
                      <button
                        type="button"
                        onPointerDown={stop}
                        onClick={() => onSave()}
                        className="rounded-full bg-brand px-2.5 py-1 text-[12px] font-semibold text-brand-foreground outline-none transition-colors hover:bg-brand/90 focus-visible:ring-2 focus-visible:ring-brand/40"
                      >
                        Save
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onPointerDown={stop}
                      onClick={() => setOpen(false)}
                      aria-label="Close"
                      className={cn(
                        "grid size-7 shrink-0 place-items-center rounded-lg outline-none transition-colors focus-visible:ring-2",
                        t.ring,
                        t.close,
                      )}
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                ) : null}

                <div className={cn(panelH != null && "min-h-0 flex-1 overflow-auto")}>
                  {overlayStatus != null ? (
                    <StatusBody status={overlayStatus} t={t} onClose={() => onStatusDismiss?.()} />
                  ) : (
                    children
                  )}
                </div>
              </div>
            </div>

            {/* Resize grip — sibling of the clipped morph so its arc can float
                OUTSIDE the corner and stay visible (the SignalRoute design). */}
            {resizable ? (
              <button
                type="button"
                aria-label="Resize"
                title="Drag to resize"
                onPointerDown={onResizeStart}
                className={cn(
                  "group/grip absolute z-30 touch-none transition-opacity duration-150 focus-visible:outline-none",
                  GRIP[placement].pos,
                  GRIP[placement].cursor,
                  open ? "opacity-100" : "pointer-events-none opacity-0",
                )}
              >
                <svg
                  width="64"
                  height="64"
                  viewBox="0 0 64 64"
                  fill="none"
                  aria-hidden
                  className={GRIP[placement].rotate}
                >
                  <path
                    d="M15 31 A28 28 0 0 1 33 49"
                    strokeWidth="3.5"
                    strokeLinecap="round"
                    className={cn("transition-colors", t.stroke)}
                  />
                </svg>
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default MorphDock;
