import {
  Building2,
  Eraser,
  Factory,
  House,
  Minus,
  MousePointer,
  Rocket,
  Train,
  TreePine,
  Mountain,
  ArrowDown,
  Waves,
  type LucideIcon,
} from "lucide-react";

/** Maps the string icon name in ToolMeta to a Lucide component. */
export const TOOL_ICONS: Record<string, LucideIcon> = {
  "mouse-pointer": MousePointer,
  eraser: Eraser,
  house: House,
  "building-2": Building2,
  trees: TreePine,
  factory: Factory,
  minus: Minus,
  train: Train,
  rocket: Rocket,
  mountain: Mountain,
  "arrow-down": ArrowDown,
  waves: Waves,
};
