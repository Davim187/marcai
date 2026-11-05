import { Clock, Instagram, MapPin, MessageCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import {
  contrastRatio,
  formatPrice,
  generatePalette,
  type TenantProfileInput,
  BRAND_PRESET_COLORS,
} from '@marcai/shared'
import { ImageUpload } from '@/components/image-upload'
import { PhoneInput } from '@/components/phone-input'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input, Textarea } from '@/components/ui/input'
import { Field } from '@/components/ui/label'
import { PageHeader } from '@/components/ui/page-header'
import { Skeleton } from '@/components/ui/skeleton'
import { api } from '@/lib/api'
import { brandStyle } from '@/lib/brand'
import { durationLabel } from '@/lib/dates'
import { qk, useApiMutation, useServices } from '@/lib/queries'
import { useRefreshSession } from '@/lib/session'
import { cn } from '@/lib/utils'
import { useTenantFull } from '../settings/policies-page'

const COLORS = BRAND_PRESET_COLORS

export default function AppearancePage() {
  const { data } = useTenantFull()
  const refresh = useRefreshSession()
  const { data: services = [] } = useServices()
  const [v, setV] = useState<TenantProfileInput | null>(null)
  useEffect(() => {
    if (data)
      setV({
        name: data.name,
        bio: data.bio ?? '',
        address: data.address ?? '',
        city: data.city ?? '',
        instagram: data.instagram ?? '',
        whatsapp: data.whatsapp?.replace(/^55/, '') ?? '',
        primaryColor: data.primaryColor,
        logoUrl: data.logoUrl,
        coverUrl: data.coverUrl,
        faviconUrl: data.faviconUrl,
        timezone: data.timezone,
      })
  }, [data])
  const save = useApiMutation(() => api('/tenant/profile', { method: 'PUT', body: v }), {
    success: 'Aparência salva',
    invalidate: [qk.tenant],
    onSuccess: () => refresh(),
  })
  if (!v || !data) return <Skeleton className="h-96" />
  const set = <K extends keyof TenantProfileInput>(k: K, val: TenantProfileInput[K]) =>
    setV({ ...v, [k]: val })
  const palette = generatePalette(v.primaryColor)
  const adjusted = palette.primary.toLowerCase() !== v.primaryColor.toLowerCase()

  return (
    <div>
      <PageHeader
        title="Aparência"
        description="Deixe sua página de agendamento com a cara do seu negócio."
        actions={
          <Button onClick={() => save.mutate()} loading={save.isPending}>
            Salvar
          </Button>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Marca</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="flex flex-wrap gap-6">
                <div>
                  <p className="mb-2 text-sm font-medium">Logo</p>
                  <ImageUpload
                    value={v.logoUrl}
                    onChange={(u) => set('logoUrl', u)}
                    shape="round"
                    label="Logo"
                  />
                </div>
                <div className="min-w-60 flex-1">
                  <p className="mb-2 text-sm font-medium">Foto de capa</p>
                  <ImageUpload
                    value={v.coverUrl}
                    onChange={(u) => set('coverUrl', u)}
                    shape="wide"
                    label="Capa (1200×400)"
                  />
                </div>
              </div>
              <div>
                <p className="mb-2 text-sm font-medium">Cor principal</p>
                <div className="flex flex-wrap items-center gap-3">
                  {COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => set('primaryColor', c)}
                      aria-label={`Cor ${c}`}
                      aria-pressed={v.primaryColor === c}
                      className={cn(
                        'ring-offset-background h-9 w-9 rounded-full ring-offset-2',
                        v.primaryColor.toLowerCase() === c.toLowerCase() &&
                          'ring-foreground ring-2',
                      )}
                      style={{ background: c }}
                    />
                  ))}
                  <label className="flex h-9 items-center gap-2 rounded-md border px-3 text-sm">
                    <input
                      type="color"
                      value={v.primaryColor}
                      onChange={(e) => set('primaryColor', e.target.value)}
                      className="h-6 w-6 cursor-pointer border-0 bg-transparent p-0"
                      aria-label="Escolher outra cor"
                    />
                    Outra
                  </label>
                </div>
                <div
                  className="mt-3 flex h-6 overflow-hidden rounded-lg"
                  aria-label="Paleta gerada"
                >
                  {(
                    ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900'] as const
                  ).map((k) => (
                    <div key={k} className="flex-1" style={{ background: palette[k] }} />
                  ))}
                </div>
                {adjusted && (
                  <p className="text-muted-foreground mt-2 text-xs">
                    Ajustamos um pouco o tom dos botões para manter o texto legível (contraste{' '}
                    {contrastRatio(palette.primary, '#ffffff').toFixed(1)}:1).
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Informações</CardTitle>
              <CardDescription>Aparecem no topo da sua página.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Field label="Nome do negócio" htmlFor="ap-name" className="sm:col-span-2">
                <Input id="ap-name" value={v.name} onChange={(e) => set('name', e.target.value)} />
              </Field>
              <Field
                label="Bio curta"
                htmlFor="ap-bio"
                className="sm:col-span-2"
                hint={`${(v.bio ?? '').length}/400`}
              >
                <Textarea
                  id="ap-bio"
                  rows={3}
                  maxLength={400}
                  value={v.bio ?? ''}
                  onChange={(e) => set('bio', e.target.value)}
                />
              </Field>
              <Field label="Endereço" htmlFor="ap-addr">
                <Input
                  id="ap-addr"
                  placeholder="Rua, número - bairro"
                  value={v.address ?? ''}
                  onChange={(e) => set('address', e.target.value)}
                />
              </Field>
              <Field label="Cidade" htmlFor="ap-city">
                <Input
                  id="ap-city"
                  placeholder="Fortaleza - CE"
                  value={v.city ?? ''}
                  onChange={(e) => set('city', e.target.value)}
                />
              </Field>
              <Field label="Instagram" htmlFor="ap-ig">
                <Input
                  id="ap-ig"
                  placeholder="@seuperfil"
                  value={v.instagram ?? ''}
                  onChange={(e) => set('instagram', e.target.value)}
                />
              </Field>
              <Field label="WhatsApp do estabelecimento" htmlFor="ap-wa">
                <PhoneInput
                  id="ap-wa"
                  value={v.whatsapp ?? ''}
                  onChange={(e) => set('whatsapp', e.target.value)}
                />
              </Field>
              <Field label="Fuso horário" htmlFor="ap-tz" hint="O padrão é America/Fortaleza.">
                <select
                  id="ap-tz"
                  className="border-input bg-card h-11 w-full rounded-lg border px-3 text-sm"
                  value={v.timezone}
                  onChange={(e) => set('timezone', e.target.value)}
                >
                  {[
                    'America/Fortaleza',
                    'America/Sao_Paulo',
                    'America/Recife',
                    'America/Bahia',
                    'America/Belem',
                    'America/Manaus',
                    'America/Cuiaba',
                    'America/Campo_Grande',
                    'America/Porto_Velho',
                    'America/Boa_Vista',
                    'America/Rio_Branco',
                    'America/Noronha',
                  ].map((z) => (
                    <option key={z}>{z}</option>
                  ))}
                </select>
              </Field>
            </CardContent>
          </Card>
        </div>
        {/* Pré-visualização ao vivo */}
        <div className="lg:sticky lg:top-24 lg:self-start">
          <p className="text-muted-foreground mb-2 text-[0.8rem] font-medium">Pré-visualização</p>
          <div
            className="border-foreground/90 bg-background shadow-lift mx-auto w-full max-w-[340px] overflow-hidden rounded-[2rem] border-[6px]"
            style={brandStyle(v.primaryColor)}
          >
            <div className="brand-cover h-24">
              {v.coverUrl && <img src={v.coverUrl} alt="" className="h-full w-full object-cover" />}
            </div>
            <div className="relative z-10 -mt-9 flex flex-col items-center px-4 text-center">
              {v.logoUrl ? (
                <img
                  src={v.logoUrl}
                  alt=""
                  className="border-background h-16 w-16 rounded-full border-4 object-cover"
                />
              ) : (
                <div className="border-background bg-primary-soft text-primary flex h-16 w-16 items-center justify-center rounded-full border-4 text-xl font-bold">
                  {v.name[0]}
                </div>
              )}
              <p className="mt-2 font-bold">{v.name}</p>
              {v.bio && <p className="text-muted-foreground mt-1 line-clamp-3 text-xs">{v.bio}</p>}
              <div className="mt-3 flex flex-wrap justify-center gap-1.5 text-[11px]">
                {v.city && (
                  <span className="flex items-center gap-1 rounded-md border px-2 py-1">
                    <MapPin className="text-primary h-3 w-3" />
                    {v.city}
                  </span>
                )}
                {v.instagram && (
                  <span className="flex items-center gap-1 rounded-md border px-2 py-1">
                    <Instagram className="text-primary h-3 w-3" />@{v.instagram.replace(/^@/, '')}
                  </span>
                )}
                {v.whatsapp && (
                  <span className="flex items-center gap-1 rounded-md border px-2 py-1">
                    <MessageCircle className="text-primary h-3 w-3" />
                    WhatsApp
                  </span>
                )}
              </div>
            </div>
            <div className="space-y-2 p-4">
              {services
                .filter((s) => s.active)
                .slice(0, 3)
                .map((s) => (
                  <div key={s.id} className="bg-card rounded-xl border p-3 text-left">
                    <p className="text-sm font-semibold">{s.name}</p>
                    <p className="mt-1 flex gap-2 text-xs">
                      <span className="text-primary font-bold">
                        {formatPrice(s.priceCents, s.priceFrom)}
                      </span>
                      <span className="text-muted-foreground flex items-center gap-0.5">
                        <Clock className="h-3 w-3" />
                        {durationLabel(s.durationMinutes)}
                      </span>
                    </p>
                  </div>
                ))}
              <div className="bg-primary text-primary-foreground rounded-lg py-2 text-center text-sm font-semibold">
                Agendar horário
              </div>
            </div>
          </div>
          <Button variant="link" className="mt-2 w-full" asChild>
            <a href={data.publicUrl} target="_blank" rel="noreferrer">
              Abrir minha página
            </a>
          </Button>
        </div>
      </div>
    </div>
  )
}
