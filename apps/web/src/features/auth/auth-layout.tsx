import { Link } from 'react-router'
import { Logo } from '@/components/logo'

export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
  footer?: React.ReactNode
}) {
  return (
    <div className="flex min-h-dvh">
      <div className="flex flex-1 flex-col px-4 py-8 sm:px-8">
        <Link to="/" className="mb-10 self-start" aria-label="Página inicial">
          <Logo />
        </Link>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center pb-16">
          <h1 className="text-2xl font-bold">{title}</h1>
          {subtitle && <p className="text-muted-foreground mt-1.5 text-sm">{subtitle}</p>}
          <div className="mt-8">{children}</div>
          {footer && <div className="text-muted-foreground mt-6 text-center text-sm">{footer}</div>}
        </div>
      </div>
      <div className="relative hidden flex-1 overflow-hidden bg-gradient-to-br from-[#FBEAF0] via-[#F7DCE6] to-[#F1CBD9] lg:block">
        <div className="absolute inset-0 flex flex-col justify-center px-16">
          <p className="max-w-md text-4xl font-extrabold leading-tight text-[#2B2024]">
            Sua agenda cheia, sem precisar responder mensagem.
          </p>
          <ul className="mt-8 space-y-3 text-[#5c3d4a]">
            <li>💅 Link de agendamento para a bio do Instagram</li>
            <li>🔒 Nunca mais duas clientes no mesmo horário</li>
            <li>📲 Aviso na hora, no painel e no WhatsApp</li>
            <li>⏰ Lembrete automático: menos faltas</li>
          </ul>
        </div>
      </div>
    </div>
  )
}

export function GoogleButton() {
  return (
    <a
      href="/api/auth/google"
      className="bg-card hover:bg-muted flex h-11 w-full items-center justify-center gap-3 rounded-lg border text-sm font-semibold shadow-sm transition"
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
        <path
          fill="#EA4335"
          d="M12 10.2v3.9h5.5c-.2 1.3-1.6 3.9-5.5 3.9-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.3 14.6 2.3 12 2.3 6.6 2.3 2.3 6.6 2.3 12s4.3 9.7 9.7 9.7c5.6 0 9.3-3.9 9.3-9.5 0-.6-.1-1.1-.2-1.6H12z"
        />
      </svg>
      Continuar com o Google
    </a>
  )
}

export function Divider({ label = 'ou' }: { label?: string }) {
  return (
    <div className="text-muted-foreground my-5 flex items-center gap-3 text-xs">
      <div className="bg-border h-px flex-1" />
      {label}
      <div className="bg-border h-px flex-1" />
    </div>
  )
}
