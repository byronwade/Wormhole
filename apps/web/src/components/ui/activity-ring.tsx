"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import { StatusDot, type StatusTone } from "@/components/ui/status-dot";

/** Map a 0–100 score to a tone via thresholds (default: <50 danger, <90 warning, else success). */
export function scoreTone(value: number, t: [number, number] = [50, 90]): StatusTone {
  if (value < t[0]) return "danger";
  if (value < t[1]) return "warning";
  return "success";
}

// Saturated arc stroke for the single-value score ring.
const scoreStroke: Record<StatusTone, string> = {
  success: "stroke-success",
  warning: "stroke-warning",
  danger: "stroke-destructive",
  info: "stroke-brand",
  neutral: "stroke-muted-foreground",
};

/**
 * Per-segment stroke utility — same token map, with the neutral tone softened
 * (tone-with-opacity) so a brand segment stays the clear accent rather than
 * being swamped by a heavy mid-gray.
 */
const segmentStroke: Record<StatusTone, string> = {
  success: "stroke-success",
  warning: "stroke-warning",
  danger: "stroke-destructive",
  info: "stroke-brand",
  neutral: "stroke-muted-foreground/40",
};

/**
 * Default tone per segment index when a segment omits `tone` — brand first, then
 * soft neutral, so a two-segment ring reads as brand + neutral by default.
 */
const toneCycle: StatusTone[] = ["info", "neutral", "success", "warning", "danger"];

export type RingSegment = {
  value: number;
  label: string;
  /** Stroke tone; defaults by position via `toneCycle`. */
  tone?: StatusTone;
  /** Optional drill-down metadata passed back through `onSegmentClick`. */
  href?: string;
};

type ScoreProps = {
  /** Single value for the score ring (0–`max`). */
  value: number;
  segments?: never;
  /** Denominator for `value` (default 100). */
  max?: number;
  /** Override the threshold-derived tone (see `scoreTone`). */
  tone?: StatusTone;
  label?: string;
  size?: number;
  thickness?: number;
  className?: string;
  "aria-label"?: string;
};

type SegmentsProps = {
  /** Segments to plot as a donut. */
  segments: RingSegment[];
  value?: never;
  size?: number;
  thickness?: number;
  gap?: number;
  centerLabel?: string;
  formatValue?: (n: number) => string;
  onSegmentClick?: (segment: RingSegment, index: number) => void;
  /** Show a derived headline below the ring ("Mostly {label}" / "Balanced" / "Quiet"). */
  verdict?: boolean;
  /** Optional description line shown below the ring. */
  caption?: string;
  className?: string;
};

export type ActivityRingProps = ScoreProps | SegmentsProps;

/**
 * Ring visualisation with two modes:
 *
 * - **Score** — pass `value` (0–`max`) for a single-arc gauge with a big centred
 *   number and a threshold-derived `tone` (see `scoreTone`).
 * - **Segmented** — pass `segments` for an interactive donut: tonal segments,
 *   hover/pin emphasis, tooltip, legend, optional verdict/caption, and a draw-in
 *   that respects `prefers-reduced-motion`.
 */
export function ActivityRing(props: ActivityRingProps) {
  return props.segments
    ? <SegmentedRing {...(props as SegmentsProps)} />
    : <ScoreRing {...(props as ScoreProps)} />;
}

function ScoreRing({
  value,
  max = 100,
  tone,
  label,
  size = 160,
  thickness = 10,
  className,
  "aria-label": ariaLabel,
}: ScoreProps) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const t = tone ?? scoreTone(pct);
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (pct / 100) * c;
  return (
    <div
      data-slot="activity-ring"
      role="img"
      aria-label={ariaLabel ?? `${Math.round(value)}${label ? ` ${label}` : ""}`}
      className={cn("relative inline-grid place-items-center", className)}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={thickness} className="stroke-muted" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={thickness}
          strokeLinecap="round"
          className={cn("transition-[stroke-dashoffset] duration-700 motion-reduce:transition-none", scoreStroke[t])}
          strokeDasharray={c}
          strokeDashoffset={offset}
        />
      </svg>
      <div aria-hidden className="absolute inset-0 grid place-items-center text-center">
        <div>
          <div className="text-3xl font-semibold tracking-tight tabular-nums">{Math.round(value)}</div>
          {label && <div className="text-xs text-muted-foreground">{label}</div>}
        </div>
      </div>
    </div>
  );
}

/** Respect the OS "reduce motion" setting — skips the draw-in animation. */
function usePrefersReducedMotion() {
  const [reduced, setReduced] = React.useState(false);
  React.useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return reduced;
}

function SegmentedRing({
  segments,
  size = 168,
  thickness = 12,
  gap = 18,
  centerLabel = "total",
  formatValue = (n) => n.toLocaleString(),
  onSegmentClick,
  verdict = false,
  caption,
  className,
}: SegmentsProps) {
  const reduced = usePrefersReducedMotion();

  const [hovered, setHovered] = React.useState<number | null>(null);
  const [pinned, setPinned] = React.useState<number | null>(null);
  const rawActive = hovered ?? pinned;
  // Guard against a parent shrinking `segments` while a chip is pinned —
  // a stale index must not blow up `segments[active]`.
  const active = rawActive !== null && rawActive < segments.length ? rawActive : null;

  // Draw-in: segments start collapsed, then expand to their share on mount.
  const [drawn, setDrawn] = React.useState(false);
  React.useEffect(() => {
    const id = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const show = drawn || reduced;

  const total = segments.reduce((sum, s) => sum + s.value, 0);

  // Geometry
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;

  // Resolve tone + share for each segment.
  const resolved = segments.map((seg, i) => {
    const tone = seg.tone ?? toneCycle[i % toneCycle.length];
    const share = total > 0 ? seg.value / total : 0;
    const pct = Math.round(share * 100);
    return { seg, i, tone, share, pct };
  });

  // Cumulative arc placement. A gap at each junction so segments read as
  // distinct pills rather than a hard seam. Rounded caps eat ~stroke/2 per end,
  // so keep gap > stroke.
  let cursor = 0;
  const arcs = resolved.map((r) => {
    const start = cursor;
    cursor += r.share;
    const len = circumference * r.share;
    const visible = show ? Math.max(len - gap, 0) : 0;
    const offset = -(circumference * start + gap / 2);
    return { ...r, visible, offset };
  });

  const togglePin = (i: number) => setPinned((p) => (p === i ? null : i));

  const onSegment = (i: number) => {
    if (onSegmentClick) onSegmentClick(segments[i], i);
    else togglePin(i);
  };

  // Centre figure follows the active segment, else shows the total.
  const centre =
    active !== null
      ? { value: segments[active].value, label: segments[active].label }
      : { value: total, label: centerLabel };

  const activeArc = active !== null ? arcs[active] : null;

  // Per-segment presentation derived from the active state.
  const segProps = (i: number) => {
    const isActive = active === i;
    const dim = active !== null && !isActive;
    return {
      strokeWidth: isActive ? thickness + 3 : thickness,
      opacity: dim ? 0.4 : 1,
      // Draw-in (dasharray) is slow; hover feedback (width/opacity) is snappy —
      // separate properties so the two animations never fight. Segments only
      // render when total > 0, so no guard is needed in the handlers.
      style: {
        transition: reduced
          ? undefined
          : "stroke-dasharray 700ms ease-out, stroke-width 200ms ease, opacity 200ms ease",
        cursor: "pointer",
      } as React.CSSProperties,
      onMouseEnter: () => setHovered(i),
      onMouseLeave: () => setHovered(null),
      onClick: () => onSegment(i),
    };
  };

  let verdictText = "Quiet";
  if (total > 0) {
    const dominant = resolved.reduce((best, r) => (r.share > best.share ? r : best));
    verdictText = dominant.share >= 0.6 ? `Mostly ${dominant.seg.label}` : "Balanced";
  }

  return (
    <div
      data-slot="activity-ring"
      className={cn("flex flex-col items-center gap-4 text-center", className)}
    >
      <div className="relative" style={{ width: size, height: size }}>
        {/* Dark inverse tooltip (design-system "popover over light UI") */}
        {activeArc && (
          <div
            data-slot="activity-ring-tooltip"
            role="status"
            className="pointer-events-none absolute left-1/2 top-0 z-10 -translate-x-1/2 -translate-y-[calc(100%+6px)] whitespace-nowrap rounded-xl bg-foreground px-2.5 py-1 text-xs font-medium text-background edge"
          >
            <span className="inline-flex items-center gap-1.5">
              <StatusDot tone={activeArc.tone} />
              {activeArc.seg.label} · {formatValue(activeArc.seg.value)} · {activeArc.pct}%
            </span>
          </div>
        )}

        <svg width={size} height={size} className="-rotate-90" aria-hidden>
          {/* track */}
          <circle
            data-slot="activity-ring-track"
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={thickness}
            className="stroke-muted"
          />
          {total > 0 &&
            arcs.map((a) => (
              <circle
                key={a.i}
                data-slot="activity-ring-segment"
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                strokeLinecap="round"
                className={segmentStroke[a.tone]}
                strokeDasharray={`${a.visible} ${circumference - a.visible}`}
                strokeDashoffset={a.offset}
                {...segProps(a.i)}
              />
            ))}
        </svg>

        <div
          data-slot="activity-ring-center"
          className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"
        >
          <span className="text-3xl font-semibold tabular-nums tracking-tight">
            {formatValue(centre.value)}
          </span>
          <span className="text-xs text-muted-foreground">{centre.label}</span>
        </div>
      </div>

      {(verdict || caption) && (
        <div data-slot="activity-ring-summary" className="space-y-1">
          {verdict && (
            <p data-slot="activity-ring-verdict" className="text-lg font-semibold tracking-tight">
              {verdictText}
            </p>
          )}
          {caption && <p className="max-w-[16rem] text-sm text-muted-foreground">{caption}</p>}
        </div>
      )}

      <div
        data-slot="activity-ring-legend"
        className="flex flex-wrap items-center justify-center gap-4"
      >
        {resolved.map((r) => (
          <LegendChip
            key={r.i}
            tone={r.tone}
            label={r.seg.label}
            active={active === r.i}
            pinned={pinned === r.i}
            disabled={total === 0}
            onEnter={() => setHovered(r.i)}
            onLeave={() => setHovered(null)}
            onClick={() => togglePin(r.i)}
          />
        ))}
      </div>
    </div>
  );
}

function LegendChip({
  tone,
  label,
  active,
  pinned,
  disabled,
  onEnter,
  onLeave,
  onClick,
}: {
  tone: StatusTone;
  label: string;
  active: boolean;
  pinned: boolean;
  disabled?: boolean;
  onEnter: () => void;
  onLeave: () => void;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-slot="activity-ring-legend-chip"
      disabled={disabled}
      aria-pressed={pinned}
      onMouseEnter={disabled ? undefined : onEnter}
      onMouseLeave={disabled ? undefined : onLeave}
      onFocus={disabled ? undefined : onEnter}
      onBlur={disabled ? undefined : onLeave}
      onClick={disabled ? undefined : onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-full px-2 py-1 text-xs transition-colors",
        "outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-default disabled:opacity-60",
        active ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      <StatusDot tone={tone} size="md" className={cn("transition-transform", active && "scale-125")} />
      {label}
    </button>
  );
}
