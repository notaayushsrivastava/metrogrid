import * as React from "react";
import * as SheetPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

function Sheet(props: React.ComponentProps<typeof SheetPrimitive.Root>) {
  return <SheetPrimitive.Root {...props} />;
}

function SheetTrigger(
  props: React.ComponentProps<typeof SheetPrimitive.Trigger>
) {
  return <SheetPrimitive.Trigger {...props} />;
}

function SheetTitle(props: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return <SheetPrimitive.Title {...props} />;
}

function SheetDescription(
  props: React.ComponentProps<typeof SheetPrimitive.Description>
) {
  return <SheetPrimitive.Description {...props} />;
}

function SheetClose(props: React.ComponentProps<typeof SheetPrimitive.Close>) {
  return <SheetPrimitive.Close {...props} />;
}

/**
 * Compact right-side contextual sheet (PRD Phase 4: keep the planner canvas
 * visible during GIS workflows — the panel is narrow and canvas stays live).
 */
function SheetContent({
  className,
  children,
  onCloseAutoFocus,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content>) {
  return (
    <SheetPrimitive.Portal>
      <SheetPrimitive.Overlay className="fixed inset-0 z-40 bg-background/60 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
      <SheetPrimitive.Content
        onCloseAutoFocus={(event) => {
          if (onCloseAutoFocus) {
            onCloseAutoFocus(event);
          } else {
            event.preventDefault();
          }
        }}
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex w-[min(24rem,100vw)] flex-col gap-4 overscroll-contain border-l border-border bg-card p-4 shadow-2xl outline-none",
          "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:duration-200 data-[state=open]:duration-300 data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right",
          className
        )}
        {...props}
      >
        {children}
        <SheetPrimitive.Close
          aria-label="Close panel"
          className="absolute right-3 top-3 rounded-md p-1 text-muted-foreground outline-none transition-colors hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="size-4" aria-hidden="true" />
        </SheetPrimitive.Close>
      </SheetPrimitive.Content>
    </SheetPrimitive.Portal>
  );
}

export {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
};
