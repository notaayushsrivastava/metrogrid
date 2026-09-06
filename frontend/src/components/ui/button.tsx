import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md text-sm font-semibold outline-none transition-colors disabled:pointer-events-none disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-sm hover:bg-teal-300",
        secondary:
          "border border-border bg-secondary text-secondary-foreground hover:border-slate-500 hover:text-white",
        outline:
          "border border-border bg-transparent text-foreground hover:bg-secondary/70",
        ghost: "text-muted-foreground hover:bg-secondary/70 hover:text-foreground",
        destructive:
          "border border-rose-500/40 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20",
      },
      size: {
        default: "h-8 px-3",
        sm: "h-7 rounded-md px-2 text-xs",
        lg: "h-9 px-4",
        icon: "size-8",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
