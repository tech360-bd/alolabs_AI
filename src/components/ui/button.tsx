import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-xs hover:bg-primary/90",
        destructive:
          "bg-destructive text-white shadow-xs hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60",
        outline:
          "border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80",
        ghost:
          "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
        link: "text-primary underline-offset-4 hover:underline",
        /* ── Editorial variants (Diagram Design language) ─────────────────────
           Shadows are out, borders are in. Radii stay at 4–8px, the accent is
           reserved for the focal action, and mono is reserved for technical
           labels (`technical`). Paper #f5f5f5 · ink #2d3142 · accent #eb6c36. */
        editorial:
          "border border-[#2d3142] bg-[#2d3142] text-[#f5f5f5] hover:bg-[#3b4058] focus-visible:ring-[#eb6c36]/40 dark:border-[#f5f5f5] dark:bg-[#f5f5f5] dark:text-[#2d3142] dark:hover:bg-[#e2e2e2]",
        editorialOutline:
          "border border-[#2d3142] bg-transparent text-[#2d3142] hover:bg-[#2d3142]/5 focus-visible:ring-[#eb6c36]/40 dark:border-[#f5f5f5] dark:text-[#f5f5f5] dark:hover:bg-white/10",
        editorialAccent:
          "border border-[#eb6c36] bg-[#eb6c36]/10 text-[#2d3142] hover:bg-[#eb6c36]/20 focus-visible:ring-[#eb6c36]/40 dark:border-[#f08a59] dark:bg-[#f08a59]/12 dark:text-[#f5f5f5] dark:hover:bg-[#f08a59]/20",
        editorialGhost:
          "text-[#4f5d75] hover:bg-[#2d3142]/5 hover:text-[#2d3142] dark:text-[#bfc0c0] dark:hover:bg-white/10 dark:hover:text-[#f5f5f5]",
        technical:
          "border border-[#2d3142]/20 bg-transparent font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-[#4f5d75] hover:border-[#eb6c36]/60 hover:text-[#2d3142] focus-visible:ring-[#eb6c36]/40 dark:border-white/20 dark:text-[#bfc0c0] dark:hover:border-[#f08a59]/70 dark:hover:text-[#f5f5f5]",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        xs: "h-8 gap-1 rounded-[4px] px-2.5 text-xs has-[>svg]:px-2",
        sm: "h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        icon: "size-9",
        iconSm: "size-8 rounded-[6px]",
        editorial: "h-10 rounded-[6px] px-4 text-sm has-[>svg]:px-3.5",
        editorialLg: "h-11 rounded-[6px] px-6 text-sm has-[>svg]:px-5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
