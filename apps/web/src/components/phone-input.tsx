import * as React from 'react'
import { maskPhone } from '@marcai/shared'
import { Input } from './ui/input'

/** Input de WhatsApp com máscara (85) 99999-9999. */
export const PhoneInput = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ onChange, value, ...props }, ref) => (
  <Input
    ref={ref}
    type="tel"
    inputMode="numeric"
    autoComplete="tel-national"
    placeholder="(85) 99999-9999"
    value={maskPhone(String(value ?? ''))}
    onChange={(e) => {
      e.target.value = maskPhone(e.target.value)
      onChange?.(e)
    }}
    {...props}
  />
))
PhoneInput.displayName = 'PhoneInput'
