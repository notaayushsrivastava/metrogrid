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
import type { GlobalScores } from "../../types/city";
import type { MetricMovement } from "../../state/cityState";

interface DashboardProps {
  scores: GlobalScores | null;
  movement: MetricMovement | null;
  calculating: boolean;
  /** `bar` renders labeled meters; `chip` renders the compact header row. */
  variant?: "bar" | "chip";
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

export function Dashboard({ scores, movement, calculating, variant = "bar" }: DashboardProps) {
  if (variant === "chip") {
    return (
      <div className="flex items-center gap-2" aria-label="City scores">
        {SCORE_METRICS.map((metric) => {
          const value = scores ? scores[metric as ScoreMetric] : null;
          const style = value !== null ? scoreStyle(value) : null;
          return (
            <div
              key={metric}
              className="flex items-center gap-1 rounded-md border border-slate-700/70 bg-slate-900/70 px-2 py-1"
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
