import * as React from 'react'
import { cn } from '@/lib/utils'

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, type, ...props }, ref) => (
  <input
    type={type}
    ref={ref}
    className={cn(
      'border-input bg-card placeholder:text-muted-foreground/70 focus-visible:border-primary aria-[invalid=true]:border-destructive flex h-11 w-full rounded-lg border px-3 py-2 text-base shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm',
      className,
    )}
    {...props}
  />
))
Input.displayName = 'Input'

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      'border-input bg-card placeholder:text-muted-foreground/70 focus-visible:border-primary aria-[invalid=true]:border-destructive flex min-h-[88px] w-full rounded-lg border px-3 py-2 text-base shadow-sm disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm',
      className,
    )}
    {...props}
  />
))
Textarea.displayName = 'Textarea'

export const NativeSelect = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      'border-input bg-card bg-[url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2716%27 height=%2716%27 fill=%27none%27 stroke=%27%23888%27 stroke-width=%272%27 viewBox=%270 0 24 24%27%3E%3Cpath d=%27m6 9 6 6 6-6%27/%3E%3C/svg%3E")] focus-visible:border-primary flex h-11 w-full appearance-none rounded-lg border bg-[right_0.75rem_center] bg-no-repeat px-3 pr-9 text-base shadow-sm disabled:opacity-50 sm:text-sm',
      className,
    )}
    {...props}
  >
    {children}
  </select>
))
NativeSelect.displayName = 'NativeSelect'
