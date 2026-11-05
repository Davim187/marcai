import { Instagram, MapPin, MessageCircle } from 'lucide-react'
import { whatsappLink } from '@marcai/shared'
import { type PublicTenant } from './types'

/** Cabeçalho da página pública: capa, logo, nome, bio e contatos. */
export function TenantHeader({ t }: { t: PublicTenant }) {
  const location = [t.address, t.city].filter(Boolean).join(' - ')
  return (
    <header>
      <div className="brand-cover relative h-36 overflow-hidden sm:h-44 sm:rounded-b-3xl">
        {t.coverUrl && <img src={t.coverUrl} alt="" className="h-full w-full object-cover" />}
      </div>
      <div className="relative z-10 -mt-12 flex flex-col items-center px-4 text-center">
        {t.logoUrl ? (
          <img
            src={t.logoUrl}
            alt={`Logo de ${t.name}`}
            className="border-background bg-card shadow-lift h-24 w-24 rounded-[1.75rem] border-4 object-cover"
          />
        ) : (
          <div className="border-background bg-primary-soft text-primary shadow-lift flex h-24 w-24 items-center justify-center rounded-[1.75rem] border-4 text-3xl font-semibold">
            {t.name.charAt(0)}
          </div>
        )}
        <h1 className="mt-3 text-[1.7rem] font-semibold tracking-[-0.02em]">{t.name}</h1>
        {t.bio && <p className="text-muted-foreground mt-1.5 max-w-md text-sm">{t.bio}</p>}
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {location && (
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`}
              target="_blank"
              rel="noreferrer"
              className="bg-card hover:border-primary inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium"
            >
              <MapPin className="text-primary h-3.5 w-3.5" /> {t.city ?? 'Ver no mapa'}
            </a>
          )}
          {t.instagram && (
            <a
              href={`https://instagram.com/${t.instagram}`}
              target="_blank"
              rel="noreferrer"
              className="bg-card hover:border-primary inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium"
            >
              <Instagram className="text-primary h-3.5 w-3.5" /> @{t.instagram}
            </a>
          )}
          {t.whatsapp && (
            <a
              href={whatsappLink(t.whatsapp)}
              target="_blank"
              rel="noreferrer"
              className="bg-card hover:border-primary inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium"
            >
              <MessageCircle className="text-primary h-3.5 w-3.5" /> WhatsApp
            </a>
          )}
        </div>
      </div>
    </header>
  )
}
