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
        success: "border-[#7cffb2]/40 bg-[#7cffb2]/10 text-[#7cffb2]",
        warning: "border-[#ffd166]/40 bg-[#ffd166]/10 text-[#ffd166]",
        danger: "border-[#ff6b6b]/40 bg-[#ff6b6b]/10 text-[#ff6b6b]",
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
