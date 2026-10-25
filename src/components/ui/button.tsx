import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// The SaaS template's button, on DevDash's colours so it works in both themes. "gradient" is
// the main action on a screen; "default" a solid one; "ghost" and "outline" the quiet ones.
const buttonVariants = cva(
  "inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-transparent font-medium transition-[transform,background-color,color,opacity] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:opacity-90",
        gradient:
          "bg-gradient-to-b from-[var(--dd-gradient-from)] via-[var(--dd-gradient-from)] to-[var(--dd-gradient-to)] text-[var(--dd-gradient-ink)] hover:scale-[1.03] active:scale-[0.97] motion-reduce:transform-none",
        secondary: "bg-secondary text-secondary-foreground hover:bg-glass-line",
        ghost: "bg-transparent text-[var(--dd-ink-soft)] hover:bg-secondary hover:text-foreground",
        outline: "border-border bg-transparent text-[var(--dd-ink-soft)] hover:bg-secondary hover:text-foreground",
        danger: "bg-destructive text-white hover:opacity-90",
      },
      size: {
        default: "h-10 px-4 text-sm",
        sm: "h-8 px-3 text-[13px]",
        lg: "h-12 px-8 text-base",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, type = "button", ...props }, ref) => (
    <button ref={ref} type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  ),
);

Button.displayName = "Button";

export { buttonVariants };
