/**
 * OnboardingTutorial — First-run guided tour shown when the planner is
 * entered from the landing page (`/planner?t=1`) or via the command palette.
 *
 * Behaviour:
 *  - Each step targets a real UI element via a `data-tour="<key>"` attribute
 *    (toolbox buttons, view switcher, score chips, project menu, canvas).
 *  - A slight-dark backdrop with a spotlight cutout focuses the current
 *    target; the step message renders as a chat-style dialog bubble that
 *    originates from (points at) the element it references. Steps without a
 *    target fall back to a centered dialog.
 *  - Dismissal (finish, skip, Esc) persists a localStorage flag so the tour
 *    never auto-opens again for that user.
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Grid3x3,
  MousePointer2,
  Move3D,
  Mountain,
  Play,
  Route,
  Sparkles,
  X,
} from "lucide-react";
import { slideDown } from "../../lib/motion";

const ONBOARDING_STORAGE_KEY = "metrogrid.onboarding.completed.v1";

/** True when the user has never completed the onboarding tutorial. */
export function shouldShowOnboarding(): boolean {
  try {
    return window.localStorage.getItem(ONBOARDING_STORAGE_KEY) !== "1";
  } catch {
    return true;
  }
}

/** Persist dismissal so the tutorial never auto-opens again. */
export function markOnboardingComplete(): void {
  try {
    window.localStorage.setItem(ONBOARDING_STORAGE_KEY, "1");
  } catch {
    /* private mode — tutorial simply re-opens next session */
  }
}

interface OnboardingStep {
  id: string;
  title: string;
  body: string;
  icon: React.ComponentType<{ className?: string }>;
  /** `data-tour` key of the element to spotlight; null → centered dialog. */
  target: string | null;
  keys?: string[];
}

const STEPS: OnboardingStep[] = [
  {
    id: "welcome",
    title: "Welcome to MetroGrid",
    body: "This is the urban simulation workspace. Design a city on the canvas and watch Livability, Traffic, and Resources respond in real time. Take a quick tour of the tools.",
    icon: Sparkles,
    target: null,
  },
  {
    id: "zones",
    title: "Place zones",
    body: "Open the Zones menu to place Residential, Commercial, Park, and Industrial zones — or use the number keys. Housing near parks and commerce scores higher.",
    icon: Building2,
    target: "zones",
    keys: ["1", "2", "3", "4"],
  },
  {
    id: "roads",
    title: "Connect with roads",
    body: "The Tools menu holds the road tiers. Faster roads make cheaper weighted A* paths; express highways are access-restricted and connect only via regular roads.",
    icon: Route,
    target: "tools",
    keys: ["5", "6", "7"],
  },
  {
    id: "terrain",
    title: "Shape the terrain",
    body: "Sculpt the ground directly on the canvas: raise, lower, and smooth elevation around the cursor to shape where your city sits.",
    icon: Mountain,
    target: "canvas",
    keys: ["T", "G", "H"],
  },
  {
    id: "tools",
    title: "Select and erase",
    body: "Select inspects zones and roads — click an object, then press Delete to remove it. Erase clears tiles under the cursor.",
    icon: MousePointer2,
    target: "tools",
    keys: ["V", "X", "Del"],
  },
  {
    id: "freeform",
    title: "Build in freeform 3D",
    body: "Switch between the 3D Build canvas and the 2D Plan Preview. In Build, zones live at any position: drag to move, R to rotate, corner handles to resize.",
    icon: Move3D,
    target: "view3d",
  },
  {
    id: "data",
    title: "Save, load, import",
    body: "The project menu keeps your layouts: save to the cloud, reload anytime, or import a real-world area from OpenStreetMap with the GIS importer.",
    icon: Grid3x3,
    target: "project",
  },
  {
    id: "ready",
    title: "The next city starts here",
    body: "Watch the live score chips as you build, press Cmd+K for the command palette, and open the shortcut sheet anytime. Start designing.",
    icon: Play,
    target: "scores",
  },
];

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const SPOT_PAD = 8;
const BUBBLE_W = 336;

/** Locate a `data-tour` anchor and return its viewport rect. */
function locateTarget(target: string | null): Rect | null {
  if (!target) return null;
  const el = document.querySelector(`[data-tour="${target}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return null;
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

interface OnboardingTutorialProps {
  open: boolean;
  /** Called on finish, skip, or Escape — persists completion. */
  onFinish: () => void;
}

export function OnboardingTutorial({ open, onFinish }: OnboardingTutorialProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [viewport, setViewport] = useState({
    w: window.innerWidth,
    h: window.innerHeight,
  });
  const step = STEPS[stepIndex];
  const isLast = stepIndex === STEPS.length - 1;
  const Icon = step.icon;
  const bubbleRef = useRef<HTMLDivElement>(null);

  // Track the spotlight target on step change / resize / scroll.
  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      setRect(locateTarget(step.target));
      setViewport({ w: window.innerWidth, h: window.innerHeight });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, stepIndex, step.target]);

  // Slide-in motion on open / step change.
  useEffect(() => {
    if (open) slideDown(bubbleRef.current);
  }, [open, stepIndex]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onFinish();
        return;
      }
      if (event.key === "ArrowRight" || event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();
        if (isLast) onFinish();
        else setStepIndex((i) => Math.min(i + 1, STEPS.length - 1));
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        event.stopPropagation();
        setStepIndex((i) => Math.max(i - 1, 0));
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [open, isLast, onFinish]);

  if (!open) return null;

  // Bubble geometry: the chat dialog anchors to the spotlight target, flips
  // vertically when there is no room below, and flips horizontally against
  // the viewport edge (with a re-anchored tail) when it would overflow.
  const BUBBLE_MARGIN = 12;
  const BUBBLE_EST_H = 250;
  // Shrink on narrow viewports so the bubble itself can never overflow.
  const bubbleW = Math.min(BUBBLE_W, viewport.w - BUBBLE_MARGIN * 2);
  const targetCx = rect
    ? rect.left + rect.width / 2
    : viewport.w / 2;
  const desiredLeft = targetCx - bubbleW / 2;
  const clampedLeft = Math.min(
    Math.max(desiredLeft, BUBBLE_MARGIN),
    Math.max(BUBBLE_MARGIN, viewport.w - bubbleW - BUBBLE_MARGIN)
  );
  const bubbleLeft = clampedLeft;
  // Horizontal flip: when the viewport edge pushes the bubble sideways away
  // from the target's center, slide the speech tail so it keeps pointing at
  // the target instead of drifting off the bubble or off-screen.
  const tailLeft = Math.min(
    Math.max(targetCx - bubbleLeft - 6, 18),
    Math.max(18, bubbleW - 30)
  );
  // Choose the side (below vs above) with the most room, then clamp the
  // bubble fully inside the viewport. The old "rect.top < EST_H" rule forced
  // full-height targets (e.g. the canvas) off the bottom of the screen.
  const estH = BUBBLE_EST_H;
  const minTop = BUBBLE_MARGIN;
  const maxTop = Math.max(minTop, viewport.h - estH - BUBBLE_MARGIN);
  const spaceBelow = rect ? viewport.h - (rect.top + rect.height) : viewport.h;
  const spaceAbove = rect ? rect.top : viewport.h;
  const placeBelow = rect ? spaceBelow >= spaceAbove : false;
  const rawTop = rect
    ? placeBelow
      ? rect.top + rect.height + 18
      : rect.top - 18 - estH
    : viewport.h / 2 - estH / 2;
  const bubbleTop = Math.min(Math.max(rawTop, minTop), maxTop);
  const bubbleStyle: React.CSSProperties = rect
    ? { left: bubbleLeft, width: bubbleW, top: bubbleTop }
    : {
        left: bubbleLeft,
        width: bubbleW,
        top: "50%",
        transform: "translateY(-50%)",
      };

  return (
    <div
      className="fixed inset-0 z-[100]"
      role="dialog"
      aria-modal="true"
      aria-label="MetroGrid onboarding tutorial"
    >
      {/* Slight-dark backdrop with a spotlight cutout over the active target */}
      {rect ? (
        <div
          className="fixed rounded-2xl border-2 border-primary/80 transition-all duration-300 ease-out"
          style={{
            top: rect.top - SPOT_PAD,
            left: rect.left - SPOT_PAD,
            width: rect.width + SPOT_PAD * 2,
            height: rect.height + SPOT_PAD * 2,
            boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.62), 0 0 24px rgba(0,0,0,0.35)",
          }}
          aria-hidden="true"
        />
      ) : (
        <div className="fixed inset-0 bg-black/55 backdrop-blur-[2px]" aria-hidden="true" />
      )}

      {/* Chat-style tutorial dialog originating from the referenced element */}
      <div
        ref={bubbleRef}
        className="fixed z-[101] rounded-2xl border border-border bg-card shadow-2xl transition-all duration-300 ease-out"
        style={bubbleStyle}
      >
        {/* Speech tail pointing at the spotlight target; slides (flips) with
            the bubble when it is clamped horizontally */}
        {rect && (
          <span
            aria-hidden="true"
            className={`absolute size-3 rotate-45 border-border bg-card ${
              placeBelow
                ? "-top-1.5 border-l border-t"
                : "-bottom-1.5 border-r border-b"
            }`}
            style={{ left: tailLeft }}
          />
        )}

        <button
          type="button"
          onClick={onFinish}
          className="absolute right-2.5 top-2.5 flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Skip tutorial"
        >
          <X className="size-3.5" />
        </button>

        <div className="flex flex-col gap-3 p-4">
          {/* Chat header: guide avatar + status */}
          <div className="flex items-center gap-2.5">
            <span
              aria-hidden="true"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-primary/40 bg-primary/10 text-primary shadow-sm"
            >
              <Icon className="size-4" />
            </span>
            <div className="leading-tight">
              <p className="text-xs font-bold text-foreground">MetroGrid Guide</p>
              <p className="flex items-center gap-1 font-mono text-[9px] tracking-[0.18em] text-muted-foreground">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> ONLINE · STEP{" "}
                {stepIndex + 1}/{STEPS.length}
              </p>
            </div>
          </div>

          {/* Message body */}
          <div className="rounded-xl rounded-tl-sm border border-border/70 bg-muted/40 p-3">
            <p className="text-sm font-semibold text-foreground">{step.title}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{step.body}</p>
            {step.keys && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {step.keys.map((key) => (
                  <kbd
                    key={key}
                    className="rounded-md border border-border bg-card px-1.5 py-0.5 font-mono text-[10px] font-semibold text-foreground shadow-sm"
                  >
                    {key}
                  </kbd>
                ))}
              </div>
            )}
          </div>

          {/* Progress dots + controls */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1" aria-hidden="true">
              {STEPS.map((s, i) => (
                <span
                  key={s.id}
                  className={`h-1.5 rounded-full transition-all duration-200 ${
                    i === stepIndex ? "w-4 bg-primary" : i < stepIndex ? "w-1.5 bg-primary/50" : "w-1.5 bg-muted"
                  }`}
                />
              ))}
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setStepIndex((i) => Math.max(i - 1, 0))}
                disabled={stepIndex === 0}
                className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
              >
                <ArrowLeft className="size-3.5" /> Back
              </button>
              <button
                type="button"
                onClick={() => (isLast ? onFinish() : setStepIndex((i) => i + 1))}
                className="flex items-center gap-1 rounded-lg bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90"
              >
                {isLast ? "Start Planning" : "Next"} <ArrowRight className="size-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
