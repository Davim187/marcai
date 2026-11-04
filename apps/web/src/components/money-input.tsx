import { Input } from './ui/input'

/** Input de valor em reais. Trabalha em centavos. */
export function MoneyInput({
  value,
  onChange,
  id,
  ...rest
}: { value: number; onChange: (cents: number) => void; id?: string } & Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange'
>) {
  const display = (value / 100).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return (
    <div className="relative">
      <span className="text-muted-foreground pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm">
        R$
      </span>
      <Input
        id={id}
        inputMode="numeric"
        className="pl-9"
        value={display}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, '').slice(0, 9)
          onChange(Number(digits || '0'))
        }}
        {...rest}
      />
    </div>
  )
}
