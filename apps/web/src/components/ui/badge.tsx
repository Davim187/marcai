import { cva, type VariantProps } from 'class-variance-authority'
import * as React from 'react'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap',
  {
    variants: {
      variant: {
        default: 'bg-primary-soft text-foreground',
        secondary: 'bg-secondary text-secondary-foreground',
        outline: 'border text-foreground',
        success: 'bg-green text-green-foreground',
        warning: 'bg-mustard text-mustard-foreground',
        destructive: 'bg-terra text-terra-foreground',
        muted: 'bg-muted text-muted-foreground',
        // Feltros: etiquetas sólidas, como as plaquinhas coloridas do quadro
        cobalt: 'bg-cobalt text-cobalt-foreground',
        mustard: 'bg-mustard text-mustard-foreground',
        terra: 'bg-terra text-terra-foreground',
        green: 'bg-green text-green-foreground',
        pink: 'bg-pink text-pink-foreground',
      },
    },
    defaultVariants: { variant: 'default' },
  },
)

export function Badge({
  className,
  variant,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />
}
