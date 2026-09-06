/**
 * Score presentation thresholds — defined ONCE (PRD §15.1).
 *
 *   0-40  → red / critical
 *  41-75  → yellow / warning
 *  76-100 → green / good
 */

export type ScoreStatus = "critical" | "warning" | "good";

export interface ScoreStyle {
  status: ScoreStatus;
  /** Hex color for bars, values, and indicators. */
  color: string;
  /** Non-color cue (PRD §14A accessibility): shape + word. */
  cue: string;
  word: string;
}

const STYLES: Record<ScoreStatus, ScoreStyle> = {
  critical: { status: "critical", color: "#ff6b6b", cue: "▼", word: "low" },
  warning: { status: "warning", color: "#ffd166", cue: "■", word: "fair" },
  good: { status: "good", color: "#7cffb2", cue: "●", word: "good" },
};

export function scoreStatus(score: number): ScoreStatus {
  if (score <= 40) return "critical";
  if (score <= 75) return "warning";
  return "good";
}

export function scoreStyle(score: number): ScoreStyle {
  return STYLES[scoreStatus(score)];
}

export const SCORE_METRICS = ["livability", "traffic", "resources"] as const;
export type ScoreMetric = (typeof SCORE_METRICS)[number];

export const METRIC_LABELS: Record<ScoreMetric, string> = {
  livability: "Livability",
  traffic: "Traffic",
  resources: "Resources",
};
