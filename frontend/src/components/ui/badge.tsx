import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Compact status chip — integrated from the Watermelon UI catalog
 * (badge-1, zero extra dependencies) and re-tokenized to MetroGrid surfaces.
 */
const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap",
  {
    variants: {
      variant: {
        default: "border-border bg-secondary text-secondary-foreground",
        success: "border-teal-500/40 bg-teal-500/10 text-teal-200",
        warning: "border-amber-500/40 bg-amber-500/10 text-amber-200",
        danger: "border-rose-500/40 bg-rose-500/10 text-rose-200",
      },
    },
    defaultVariants: { variant: "default" },
  }
);

function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
