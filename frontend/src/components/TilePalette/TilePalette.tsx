/**
 * TilePalette — grouped tool rail (wireframe: BUILD / ZONES / ROADS).
 * Icon + short label + keyboard hint; current tool is obvious; every row
 * carries a color swatch + glyph so state never relies on color alone.
 */

import { TOOLS, TOOL_GROUPS, type ToolMeta } from "../../config/tiles";
import { TOOL_ICONS } from "../../config/icons";
import type { ToolId } from "../../types/city";

interface TilePaletteProps {
  activeTool: ToolId;
  onSelectTool: (tool: ToolId) => void;
  /** `row` renders the horizontal mobile bar, `column` the desktop rail. */
  layout?: "row" | "column";
}

function ToolRow({
  tool,
  active,
  onSelect,
}: {
  tool: ToolMeta;
  active: boolean;
  onSelect: (tool: ToolId) => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      title={`${tool.label} (${tool.key})`}
      onClick={() => onSelect(tool.id)}
      className={[
        "group flex w-full shrink-0 items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-sm outline-none transition-colors",
        "focus-visible:ring-2 focus-visible:ring-ring",
        active
          ? "bg-elevated text-foreground"
          : "border-transparent text-muted-foreground hover:border-border hover:bg-accent hover:text-foreground",
      ].join(" ")}
      style={
        active
          ? { borderColor: `${tool.color}66`, boxShadow: `inset 0 0 0 1px ${tool.color}22` }
          : undefined
      }
    >
      <span
        aria-hidden="true"
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border text-[13px] transition-transform group-active:scale-90"
        style={{
          backgroundColor: `${tool.color}1f`,
          borderColor: `${tool.color}55`,
          color: tool.color,
        }}
      >
        {(() => {
          const Icon = TOOL_ICONS[tool.icon];
          return Icon ? <Icon className="size-[14px]" /> : <span className="text-xs font-bold">{tool.glyph}</span>;
        })()}
      </span>
      <span className="min-w-0 flex-1 truncate font-medium">{tool.label}</span>
      <kbd
        aria-hidden="true"
        className={[
          "rounded border px-1 font-mono text-[10px] font-semibold",
          active
            ? "border-[#f5f7fa]/30 text-[#f5f7fa]"
            : "border-border text-faint",
        ].join(" ")}
      >
        {tool.key}
      </kbd>
    </button>
  );
}

export function TilePalette({ activeTool, onSelectTool, layout = "column" }: TilePaletteProps) {
  if (layout === "row") {
    return (
      <div
        role="toolbar"
        aria-label="City editing tools"
        className="flex flex-row gap-1 overflow-x-auto pb-1"
      >
        {TOOLS.map((tool) => (
          <ToolRow
            key={tool.id}
            tool={tool}
            active={tool.id === activeTool}
            onSelect={onSelectTool}
          />
        ))}
      </div>
    );
  }

  return (
    <div role="toolbar" aria-label="City editing tools" className="flex flex-col gap-4">
      {TOOL_GROUPS.map((group) => (
        <section key={group.id} aria-label={`${group.label} tools`} className="flex flex-col gap-1">
          <p className="mb-1 flex items-center gap-1.5 px-1 text-[10px] font-bold uppercase tracking-widest text-faint">
            <span aria-hidden="true" className="text-[11px] text-muted-foreground">
              {group.marker}
            </span>
            {group.label}
          </p>
          {TOOLS.filter((tool) => tool.group === group.id).map((tool) => (
            <ToolRow
              key={tool.id}
              tool={tool}
              active={tool.id === activeTool}
              onSelect={onSelectTool}
            />
          ))}
        </section>
      ))}
    </div>
  );
}

