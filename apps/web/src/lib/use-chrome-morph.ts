"use client";

import * as React from "react";

const useIsoLayoutEffect =
  typeof window !== "undefined" ? React.useLayoutEffect : React.useEffect;

const EASE = "cubic-bezier(.22,1,.36,1)";

export interface ChromeMorphOptions {
  /**
   * The morphing container. Its CSS anchoring sets the grow DIRECTION — this
   * hook only animates size, so the SAME morph works whether the container is
   * pinned top-right (grows left/down), top-left (grows right/down), bottom
   * (grows up), or full-width on mobile. Position-agnostic by design.
   */
  morphRef: React.RefObject<HTMLDivElement | null>;
  /** Resting content that fades OUT as a panel blooms in (cross-fade morphs). */
  restRef?: React.RefObject<HTMLDivElement | null>;
  /** The active panel: faded IN and measured for the open height (cross-fade). */
  panelRef?: React.RefObject<HTMLDivElement | null>;
  /** Whether a panel is currently open. */
  open: boolean;
  /**
   * Bloom DOWN — animate width + height and cross-fade rest↔panel (flows, search,
   * comm windows). When false, a width-only grow (dropdowns/menus that swap their
   * own content).
   */
  growHeight: boolean;
  /** Open width target in px, read at morph time. */
  width: () => number;
  /**
   * Open height in px, read at morph time. If omitted, the active panel
   * (`panelRef`) is measured. Provide this when the consumer manages its own
   * (multi-)panel cross-fade and just wants the box sized.
   */
  height?: () => number;
  /**
   * Optional start/end box, in px. When provided, the morph grows from (and
   * shrinks back to) THIS box instead of the container's own collapsed size —
   * e.g. a window that blooms out of a sibling pill rather than its own nub.
   */
  collapsedFrom?: () => { w: number; h: number } | null;
  /** Bloom-down duration in ms (default 220). */
  durationMs?: number;
  /** Extra triggers that change the open target (which panel, its size, …). */
  deps?: React.DependencyList;
}

/**
 * Shared bloom morph for floating chrome — a toolbar pill, a launcher, a nav
 * dock, a comm window. The container grows from its collapsed box into the open
 * panel on a tuned cubic-bezier, cross-fading the resting content out and the
 * panel in, then shrinks cleanly back on close. Position-agnostic: the
 * container's CSS anchoring picks the grow direction; the hook only sizes.
 *
 * Sizing only — a consumer with several panels (or its own cross-fade / drag
 * logic) passes `width`/`height`/`collapsedFrom` and manages opacity itself.
 */
export function useChromeMorph({
  morphRef,
  restRef,
  panelRef,
  open,
  growHeight,
  width,
  height,
  collapsedFrom,
  durationMs = 220,
  deps = [],
}: ChromeMorphOptions) {
  const collapsedW = React.useRef<number | null>(null);
  const collapsedH = React.useRef<number | null>(null);

  // Remember the collapsed box while idle so the morph can animate from it.
  useIsoLayoutEffect(() => {
    const el = morphRef.current;
    if (el && !open && !el.style.width) {
      collapsedW.current = el.offsetWidth;
      collapsedH.current = el.offsetHeight;
    }
  });

  useIsoLayoutEffect(() => {
    const el = morphRef.current;
    if (!el) return;
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const from = collapsedFrom?.();

    if (open) {
      // Already sized → a panel→panel switch: grow from the CURRENT box (morph
      // between panels) rather than re-blooming from the collapsed/origin box.
      const alreadyOpen = !!el.style.width;
      const cw = alreadyOpen
        ? el.offsetWidth
        : (from?.w ?? collapsedW.current ?? el.offsetWidth);
      const ch = alreadyOpen
        ? el.offsetHeight
        : (from?.h ?? collapsedH.current ?? el.offsetHeight);
      const ow = width();

      if (growHeight) {
        // Cross-fade the resting content OUT + the (absolute) panel IN while the
        // container grows over it — so the panel develops out of the pill instead
        // of materializing at the corner.
        const oh = height ? height() : (panelRef?.current?.offsetHeight ?? el.offsetHeight);
        if (restRef?.current) {
          restRef.current.style.transitionDelay = "0ms";
          restRef.current.style.opacity = "0";
        }
        if (panelRef?.current) {
          panelRef.current.style.transitionDelay = reduce ? "0ms" : "40ms";
          panelRef.current.style.opacity = "1";
        }
        const grow = `width ${durationMs}ms ${EASE}, height ${durationMs}ms ${EASE}, border-radius ${durationMs}ms ${EASE}`;
        if (reduce) {
          el.style.transition = "none";
          el.style.width = `${ow}px`;
          el.style.height = `${oh}px`;
          return;
        }
        el.style.transition = "none";
        el.style.width = `${cw}px`;
        el.style.height = `${ch}px`;
        void el.offsetWidth; // reflow
        el.style.transition = grow;
        el.style.width = `${ow}px`;
        el.style.height = `${oh}px`;
        return;
      }

      // Width-only grow (menus that swap their own content).
      if (reduce) {
        el.style.transition = "none";
        el.style.width = `${ow}px`;
        return;
      }
      el.style.transition = "none";
      el.style.width = `${cw}px`;
      void el.offsetWidth; // reflow
      el.style.transition = `width 250ms ${EASE}, border-radius 250ms ${EASE}`;
      el.style.width = `${ow}px`;
    } else if (el.style.width) {
      const cw = from?.w ?? collapsedW.current;
      const ch = from?.h ?? collapsedH.current;
      const hadHeight = el.style.height !== "";
      // No collapsed box to shrink into → clear inline sizing (legacy fallback).
      if (cw == null) {
        el.style.transition = "none";
        el.style.width = "";
        el.style.height = "";
        void el.offsetWidth;
        el.style.transition = "";
        return;
      }
      // Settle AT the collapsed box rather than clearing the inline width. The
      // panel inside is a fixed `panelW`, so clearing the width would let the box
      // reflow (shrink-wrap) back to full panel width for a frame the instant the
      // close transition ends — a one-frame "snap" flash. Coming to rest exactly
      // over the pill leaves nothing to snap to, and reopen grows from this box.
      const settle = () => {
        el.style.transition = "";
      };
      if (reduce) {
        el.style.transition = "none";
        el.style.width = `${cw}px`;
        if (hadHeight) el.style.height = `${ch ?? el.offsetHeight}px`;
        void el.offsetWidth;
        settle();
        return;
      }
      el.style.transition = hadHeight
        ? `width ${durationMs}ms ${EASE}, height ${durationMs}ms ${EASE}, border-radius ${durationMs}ms ${EASE}`
        : `width 250ms ${EASE}, border-radius 250ms ${EASE}`;
      el.style.width = `${cw}px`;
      if (hadHeight) el.style.height = `${ch ?? el.offsetHeight}px`;
      const onEnd = (e: TransitionEvent) => {
        if (e.propertyName !== "width") return;
        settle();
        el.removeEventListener("transitionend", onEnd);
      };
      el.addEventListener("transitionend", onEnd);
      return () => el.removeEventListener("transitionend", onEnd);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, growHeight, ...deps]);
}
