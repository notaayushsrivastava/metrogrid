/**
 * TilePalette — compact tool selection (PRD §14A, §14.3).
 * Icon + short label + keyboard hint; current tool is obvious.
 */

import { TOOLS } from "../../config/tiles";
import type { ToolId } from "../../types/city";

interface TilePaletteProps {
  activeTool: ToolId;
  onSelectTool: (tool: ToolId) => void;
  /** `row` renders the horizontal mobile bar, `column` the desktop sidebar. */
  layout?: "row" | "column";
}

export function TilePalette({ activeTool, onSelectTool, layout = "column" }: TilePaletteProps) {
  const vertical = layout === "column";
  return (
    <div
      role="toolbar"
      aria-label="City editing tools"
      className={
        vertical
          ? "flex flex-col gap-1"
          : "flex flex-row gap-1 overflow-x-auto pb-1"
      }
    >
      {TOOLS.map((tool) => {
        const active = tool.id === activeTool;
        return (
          <button
            key={tool.id}
            type="button"
            aria-pressed={active}
            title={`${tool.label} (${tool.key})`}
            onClick={() => onSelectTool(tool.id)}
            className={[
              "group flex shrink-0 items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-sm outline-none transition-colors",
              "focus-visible:ring-2 focus-visible:ring-sky-400",
              vertical ? "w-full" : "",
              active
                ? "border-slate-400/70 bg-slate-700/60 text-slate-50"
                : "border-transparent text-slate-300 hover:border-slate-600 hover:bg-slate-800/70",
            ].join(" ")}
          >
            <span
              aria-hidden="true"
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-xs font-bold"
              style={{ backgroundColor: tool.color, color: "#0b1120" }}
            >
              {tool.glyph}
            </span>
            <span className="flex-1 whitespace-nowrap font-medium">{tool.label}</span>
            <kbd
              aria-hidden="true"
              className={[
                "rounded border px-1 text-[10px] font-semibold",
                active
                  ? "border-slate-400/60 text-slate-200"
                  : "border-slate-600 text-slate-400",
              ].join(" ")}
            >
              {tool.key}
            </kbd>
          </button>
        );
      })}
    </div>
  );
}
