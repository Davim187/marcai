import { CalendarHeart, Clock } from 'lucide-react'
import { formatPrice } from '@marcai/shared'
import { durationLabel } from '@/lib/dates'
import { type PublicService, type PublicTenant } from './types'

/** Lista de serviços por categoria e o resumo do serviço escolhido. */
export function ServiceList({
  t,
  onChoose,
}: {
  t: PublicTenant
  onChoose: (s: PublicService) => void
}) {
  const groups = [
    ...t.categories.map((c) => ({
      id: c.id,
      name: c.name,
      items: t.services.filter((s) => s.categoryId === c.id),
    })),
    {
      id: 'outros',
      name: 'Outros',
      items: t.services.filter(
        (s) => !s.categoryId || !t.categories.some((c) => c.id === s.categoryId),
      ),
    },
  ].filter((g) => g.items.length)
  if (!t.services.length) {
    return (
      <p className="bg-muted text-muted-foreground mt-10 rounded-2xl p-6 text-center text-sm">
        Nenhum serviço disponível para agendamento online no momento.
      </p>
    )
  }
  return (
    <div className="mt-8 space-y-8">
      <h2 className="text-xl font-semibold tracking-[-0.02em]">Escolha o serviço</h2>
      {groups.map((g) => (
        <section key={g.id}>
          {groups.length > 1 && (
            <h3 className="text-muted-foreground mb-3 text-[0.8rem] font-medium">{g.name}</h3>
          )}
          <div className="space-y-3">
            {g.items.map((s) => (
              <button
                key={s.id}
                onClick={() => onChoose(s)}
                className="bg-card shadow-soft hover:border-primary hover:shadow-lift flex w-full gap-3 rounded-2xl border p-4 text-left transition hover:-translate-y-0.5"
              >
                {s.photoUrl && (
                  <img
                    src={s.photoUrl}
                    alt=""
                    loading="lazy"
                    className="h-20 w-20 shrink-0 rounded-xl object-cover"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{s.name}</p>
                  {s.description && (
                    <p className="text-muted-foreground mt-0.5 line-clamp-2 text-sm">
                      {s.description}
                    </p>
                  )}
                  <div className="mt-2 flex items-center gap-3 text-sm">
                    <span className="text-primary font-bold">
                      {formatPrice(s.priceCents, s.priceFrom)}
                    </span>
                    <span className="text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" /> {durationLabel(s.durationMinutes)}
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

export function ServiceSummary({
  service,
  professionalName,
}: {
  service: PublicService
  professionalName?: string
}) {
  return (
    <div className="bg-primary-soft flex items-center gap-3 rounded-2xl p-3">
      <CalendarHeart className="text-primary h-5 w-5 shrink-0" />
      <div className="min-w-0 text-sm">
        <p className="truncate font-semibold">
          {service.name}
          {professionalName && ` com ${professionalName}`}
        </p>
        <p className="text-muted-foreground">
          {durationLabel(service.durationMinutes)} ·{' '}
          {formatPrice(service.priceCents, service.priceFrom)}
        </p>
      </div>
    </div>
  )
}
