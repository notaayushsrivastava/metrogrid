/**
 * Dashboard — compact, glanceable score meters (PRD §15).
 * Color thresholds come from config/scores (defined once, §15.1) and every
 * score state also carries a shape/word cue (§14A accessibility).
 */

import {
  METRIC_LABELS,
  SCORE_METRICS,
  scoreStyle,
  type ScoreMetric,
} from "../../config/scores";
import type { GlobalScores, TrafficDetail } from "../../types/city";
import type { MetricMovement } from "../../state/cityState";
import { useEffect, useRef } from "react";
import { pulseChip } from "@/lib/motion";

interface DashboardProps {
  scores: GlobalScores | null;
  movement: MetricMovement | null;
  calculating: boolean;
  /** Congestion estimate from the scoring engine (PRD §9.7). */
  congestion?: TrafficDetail | null;
  /** `bar` renders labeled meters; `chip` renders the compact header row. */
  variant?: "bar" | "chip";
}

function CongestionBadge({ detail }: { detail: TrafficDetail | null }) {
  if (!detail || detail.congested_roads <= 0 || detail.road_count === 0) return null;
  const pct = Math.round(detail.max_ratio * 100);
  return (
    <div
      className="flex items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1"
      title={`${detail.congested_roads} of ${detail.road_count} roads congested (peak ${pct}% capacity)`}
    >
      <span aria-hidden="true" className="text-[10px] text-amber-300">⚠</span>
      <span className="text-[10px] font-bold text-amber-200">
        {detail.congested_roads} congested
      </span>
    </div>
  );
}

function Movement({ value }: { value: number | undefined }) {
  if (value === undefined || value === 0) return null;
  const positive = value > 0;
  return (
    <span
      className="ml-1 text-[10px] font-bold"
      style={{ color: positive ? "#4ade80" : "#f87171" }}
      aria-label={`${positive ? "up" : "down"} ${Math.abs(value)}`}
    >
      {positive ? "▲" : "▼"}
      {Math.abs(value)}
    </span>
  );
}

export function Dashboard({ scores, movement, calculating, congestion, variant = "bar" }: DashboardProps) {
  // anime.js pulse on moved metrics (PRD Phase 4: restrained score feedback).
  const chipRefs = useRef<Partial<Record<ScoreMetric, HTMLDivElement | null>>>({});
  const prevMovement = useRef<MetricMovement | null>(null);
  useEffect(() => {
    if (!movement) return;
    for (const metric of SCORE_METRICS) {
      const delta = movement[metric];
      const previous = prevMovement.current?.[metric] ?? 0;
      if (delta !== 0 && delta !== previous) {
        pulseChip(chipRefs.current[metric] ?? null);
      }
    }
    prevMovement.current = movement;
  }, [movement]);

  if (variant === "chip") {
    return (
      <div className="flex items-center gap-2" aria-label="City scores">
        {SCORE_METRICS.map((metric) => {
          const value = scores ? scores[metric as ScoreMetric] : null;
          const style = value !== null ? scoreStyle(value) : null;
          return (
            <div
              key={metric}
              ref={(el) => {
                chipRefs.current[metric as ScoreMetric] = el;
              }}
              className="flex items-center gap-1 rounded-md border border-border/70 bg-card/70 px-2 py-1 backdrop-blur"
              title={METRIC_LABELS[metric as ScoreMetric]}
            >
              <span
                aria-hidden="true"
                className="text-[10px]"
                style={{ color: style?.color ?? "#64748b" }}
              >
                {style?.cue ?? "○"}
              </span>
              <span className="text-xs font-bold tabular-nums" style={{ color: style?.color ?? "#cbd5e1" }}>
                {value ?? "–"}
              </span>
              <Movement value={movement?.[metric as ScoreMetric]} />
            </div>
          );
        })}
        {calculating && (
          <span aria-hidden="true" className="h-3 w-3 animate-spin rounded-full border border-slate-500 border-t-transparent" />
        )}
        <CongestionBadge detail={congestion ?? null} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3" aria-label="City scores">
      {SCORE_METRICS.map((metric) => {
        const value = scores ? scores[metric as ScoreMetric] : null;
        const style = value !== null ? scoreStyle(value) : null;
        return (
          <div key={metric}>
            <div className="mb-1 flex items-baseline justify-between">
              <span className="text-xs font-medium text-slate-400">
                {METRIC_LABELS[metric as ScoreMetric]}
                <span className="ml-1.5 text-[10px] uppercase tracking-wide" style={{ color: style?.color }}>
                  {style?.word ?? ""}
                </span>
              </span>
              <span className="text-sm font-bold tabular-nums text-slate-100">
                {value ?? "–"}
                <Movement value={movement?.[metric as ScoreMetric]} />
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-700/60">
              <div
                className="h-full rounded-full transition-[width] duration-300"
                style={{ width: `${value ?? 0}%`, backgroundColor: style?.color ?? "#475569" }}
                role="meter"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={value ?? undefined}
                aria-label={`${METRIC_LABELS[metric as ScoreMetric]} score`}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
